import mongoose from 'mongoose';
import Lead from './lead.model.js';
import LeadFollowUp, { FOLLOW_UP_OPEN_STATUSES } from './leadFollowUp.model.js';
import { recordLeadEvent } from './leadEvent.model.js';
import leadAssignmentService from './leadAssignment.service.js';
import auditService from '../auth/audit.service.js';
import notificationService from '../notifications/notification.service.js';
import logger from '../../shared/logger/index.js';

/**
 * First-response SLA + escalation.
 *
 * - recordFirstResponse(): called wherever an OUTBOUND contact is recorded
 *   (mobile/SIM call or SMS completion, AI call result, lead e-mail, WhatsApp).
 *   Stamps firstRespondedAt once and resolves the SLA to met / late.
 * - sweep(): BullMQ repeatable job. Marks overdue leads and follow-ups, alerts
 *   the owner, escalates to supervisors after a further threshold. Every state
 *   change is compare-and-set and every alert carries an idempotency key, so a
 *   retried or concurrent run never double-alerts; an alert is sent BEFORE its
 *   CAS write, so a crash in between is repaired (deduped) by the next run.
 */

const BATCH = 200;
const MINUTE = 60_000;

const oidStr = (v) => (v ? String(v._id ?? v) : null);

async function notify(data, actorId = null) {
  try {
    await notificationService.create(data, actorId);
    return true;
  } catch (err) {
    // 409 = idempotency key already used inside the window: already delivered.
    if (err?.statusCode === 409) return true;
    logger.warn('SLA notification failed', { module: 'crm', type: data.type, error: { message: err.message } });
    return false;
  }
}

function emit(userIds, event, payload) {
  for (const id of userIds) {
    try { global.io?.to(`user:${id}`).emit(event, payload); } catch { /* best effort */ }
  }
}

class LeadSlaService {
  /**
   * First outbound contact of any channel. Idempotent: only the first call
   * per lead writes. A lead without a deadline keeps slaStatus 'none'.
   */
  async recordFirstResponse(leadId, { at = new Date(), channel = null } = {}) {
    try {
      const when = new Date(at);
      const lead = await Lead.findById(leadId).select('_id firstRespondedAt firstResponseDueAt slaStatus assignedTo').lean();
      if (!lead || lead.firstRespondedAt) return false;
      const due = lead.firstResponseDueAt ? new Date(lead.firstResponseDueAt) : null;
      const slaStatus = due ? (when <= due ? 'met' : 'late') : (lead.slaStatus || 'none');
      const res = await Lead.updateOne(
        { _id: lead._id, firstRespondedAt: null },
        { $set: { firstRespondedAt: when, firstResponseChannel: channel, slaStatus } },
      );
      if (!res.modifiedCount) return false;
      if (due) {
        await recordLeadEvent({
          leadId: lead._id, type: slaStatus === 'met' ? 'sla.met' : 'sla.late', at: when,
          details: { channel, firstResponseDueAt: due, minutesFromDue: Math.round((when - due) / MINUTE) },
          dedupeKey: `sla-response:${lead._id}`,
        });
        if (lead.assignedTo) emit([String(lead.assignedTo)], 'lead:sla', { leadId: String(lead._id), slaStatus });
      }
      return true;
    } catch (err) {
      logger.warn('Could not record lead first response (ignored)', { module: 'crm', leadId: String(leadId), error: { message: err.message } });
      return false;
    }
  }

  async _escalationRecipients(policy) {
    const User = mongoose.models.User;
    const configured = policy.escalation.userIds || [];
    if (configured.length) {
      const active = await User.find({ _id: { $in: configured }, status: 'active', isDeleted: { $ne: true } }).select('_id').lean();
      if (active.length) return active.map((u) => String(u._id));
    }
    // Fallback: everyone who may edit the policy (supervisors) + Admins.
    const Role = mongoose.models.Role;
    const Permission = mongoose.models.Permission;
    if (!Role || !Permission) return [];
    const perm = await Permission.findOne({ module: 'lead', action: 'assign-policy' }).select('_id').lean();
    const roles = await Role.find({ $or: [{ name: 'Admin' }, ...(perm ? [{ permissions: perm._id }] : [])] }).select('_id').lean();
    if (!roles.length) return [];
    const users = await User.find({ role: { $in: roles.map((r) => r._id) }, status: 'active', isDeleted: { $ne: true } }).select('_id').limit(50).lean();
    return users.map((u) => String(u._id));
  }

  async sweep(now = new Date()) {
    const result = { breached: 0, escalated: 0, followUpsOverdue: 0, followUpsEscalated: 0 };
    const policy = await leadAssignmentService.getPolicy();
    let recipients = null;
    const escalateTo = async () => {
      if (recipients === null) recipients = await this._escalationRecipients(policy);
      return recipients;
    };

    // 1. First-response deadline passed without a response → overdue + owner alert.
    const due = await Lead.find({ slaStatus: 'pending', firstRespondedAt: null, firstResponseDueAt: { $lte: now } })
      .select('_id name leadNumber assignedTo firstResponseDueAt').limit(BATCH).lean();
    for (const lead of due) {
      const dueKey = new Date(lead.firstResponseDueAt).getTime();
      if (lead.assignedTo) {
        await notify({
          channels: ['IN_APP'], recipientIds: [oidStr(lead.assignedTo)], type: 'lead.sla_breached', category: 'CRM', priority: 'HIGH',
          payload: {
            title: `First response overdue: ${lead.name}`,
            message: `The response deadline (${new Date(lead.firstResponseDueAt).toISOString()}) has passed.`,
            leadId: String(lead._id), firstResponseDueAt: new Date(lead.firstResponseDueAt).toISOString(),
          },
          sourceModule: 'crm', sourceEvent: 'LEAD_SLA_BREACHED', sourceEntityType: 'Lead', sourceEntityId: lead._id,
          idempotencyKey: `lead-sla-breach-${lead._id}-${dueKey}`,
        });
      }
      const res = await Lead.updateOne(
        { _id: lead._id, slaStatus: 'pending', firstRespondedAt: null, firstResponseDueAt: lead.firstResponseDueAt },
        { $set: { slaStatus: 'overdue', slaBreachedAt: now } },
      );
      if (res.modifiedCount) {
        result.breached += 1;
        await recordLeadEvent({ leadId: lead._id, type: 'sla.breached', at: now, details: { firstResponseDueAt: lead.firstResponseDueAt, assignedTo: oidStr(lead.assignedTo) }, dedupeKey: `sla-breach:${lead._id}:${dueKey}` });
        auditService.logEvent({ eventType: 'lead.sla_breached', userId: null, ipAddress: 'internal', result: 'success', module: 'lead', details: { leadId: String(lead._id), firstResponseDueAt: lead.firstResponseDueAt } });
        if (lead.assignedTo) emit([oidStr(lead.assignedTo)], 'lead:sla', { leadId: String(lead._id), slaStatus: 'overdue' });
      }
    }

    // 2. Still unanswered after afterMinutes × level → escalate one level.
    if (policy.escalation.enabled) {
      const step = policy.escalation.afterMinutes * MINUTE;
      const maxLevel = policy.escalation.maxLevel;
      const overdue = await Lead.find({
        slaStatus: 'overdue', firstRespondedAt: null, escalationLevel: { $lt: maxLevel },
        firstResponseDueAt: { $lte: new Date(now.getTime() - step) },
      }).select('_id name leadNumber assignedTo firstResponseDueAt escalationLevel').limit(BATCH).lean();
      for (const lead of overdue) {
        const level = (lead.escalationLevel || 0) + 1;
        const dueAt = new Date(lead.firstResponseDueAt);
        if (now.getTime() < dueAt.getTime() + step * level) continue;
        const to = await escalateTo();
        const dueKey = dueAt.getTime();
        if (to.length) {
          await notify({
            channels: ['IN_APP'], recipientIds: to, type: 'lead.sla_escalated', category: 'CRM', priority: 'HIGH',
            payload: {
              title: `Escalation (level ${level}): ${lead.name} has no first response`,
              message: `Response was due ${dueAt.toISOString()}; the owner has not contacted the lead.`,
              leadId: String(lead._id), level, assignedTo: oidStr(lead.assignedTo),
            },
            sourceModule: 'crm', sourceEvent: 'LEAD_SLA_ESCALATED', sourceEntityType: 'Lead', sourceEntityId: lead._id,
            idempotencyKey: `lead-sla-escalation-${lead._id}-${dueKey}-${level}`,
          });
        }
        const res = await Lead.updateOne(
          { _id: lead._id, slaStatus: 'overdue', firstRespondedAt: null, escalationLevel: lead.escalationLevel || 0 },
          { $set: { escalationLevel: level, lastEscalatedAt: now } },
        );
        if (res.modifiedCount) {
          result.escalated += 1;
          await recordLeadEvent({ leadId: lead._id, type: 'sla.escalated', at: now, details: { level, recipients: to, firstResponseDueAt: dueAt }, dedupeKey: `sla-escalation:${lead._id}:${dueKey}:${level}` });
          auditService.logEvent({ eventType: 'lead.sla_escalated', userId: null, ipAddress: 'internal', result: 'success', module: 'lead', details: { leadId: String(lead._id), level, recipients: to } });
          emit(to, 'lead:sla', { leadId: String(lead._id), slaStatus: 'overdue', escalationLevel: level });
        }
      }
    }

    // Planned reminders use the existing sweep and notification dedupe. A failed
    // notification remains eligible; snoozing automatically re-arms the reminder.
    const reminders = await LeadFollowUp.find({
      status: { $in: FOLLOW_UP_OPEN_STATUSES }, reminderMinutes: { $ne: null }, nextDueAt: { $gt: now },
      $expr: { $and: [
        { $ne: ['$reminderNotifiedFor', '$nextDueAt'] },
        { $lte: [{ $subtract: ['$nextDueAt', { $multiply: ['$reminderMinutes', MINUTE] }] }, now] },
      ] },
    }).select('_id leadId ownerId nextDueAt priority').limit(BATCH).lean();
    const reminderNames = await this._leadNames(reminders.map((fu) => fu.leadId));
    await this._retireOrphans(reminders, reminderNames, 'reminderNotifiedFor');
    for (const fu of reminders) {
      if (!reminderNames.has(String(fu.leadId))) continue;
      const delivered = await notify({
        channels: ['IN_APP'], recipientIds: [String(fu.ownerId)], type: 'lead.follow_up_reminder', category: 'CRM', priority: fu.priority || 'NORMAL',
        payload: { title: `Upcoming follow-up: ${reminderNames.get(String(fu.leadId))}`, message: `Due ${new Date(fu.nextDueAt).toISOString()}.`, leadId: String(fu.leadId), followUpId: String(fu._id) },
        sourceModule: 'crm', sourceEvent: 'FOLLOW_UP_REMINDER', sourceEntityType: 'Lead', sourceEntityId: fu.leadId,
        idempotencyKey: `lead-follow-up-reminder-${fu._id}-${new Date(fu.nextDueAt).getTime()}`,
      });
      if (delivered) await LeadFollowUp.updateOne({ _id: fu._id, nextDueAt: fu.nextDueAt, status: { $in: FOLLOW_UP_OPEN_STATUSES } }, { $set: { reminderNotifiedFor: fu.nextDueAt } });
    }

    // 3. Follow-ups whose (next) due time passed: one owner alert per due time.
    // An AI follow-up call that is in progress, or due within the last 30 minutes (the
    // dispatcher picks it up every minute), is being worked — not overdue for a person.
    const aiWorking = { $nor: [
      { 'automation.mode': 'ai', 'automation.state': { $in: ['queued', 'calling', 'retry_scheduled'] } },
      { 'automation.mode': 'ai', 'automation.state': 'scheduled', nextDueAt: { $gt: new Date(now.getTime() - 30 * MINUTE) } },
    ] };
    const overdueFollowUps = await LeadFollowUp.find({
      status: { $in: FOLLOW_UP_OPEN_STATUSES }, nextDueAt: { $lte: now }, ...aiWorking,
      $expr: { $ne: ['$overdueNotifiedFor', '$nextDueAt'] },
    }).select('_id leadId ownerId nextDueAt timezone note').limit(BATCH).lean();
    const leadNames = await this._leadNames(overdueFollowUps.map((f) => f.leadId));
    await this._retireOrphans(overdueFollowUps, leadNames, 'overdueNotifiedFor');
    for (const fu of overdueFollowUps) {
      const leadName = leadNames.get(String(fu.leadId));
      if (!leadName) continue; // lead deleted
      const dueKey = new Date(fu.nextDueAt).getTime();
      await notify({
        channels: ['IN_APP'], recipientIds: [String(fu.ownerId)], type: 'lead.follow_up_overdue', category: 'CRM', priority: 'HIGH',
        payload: {
          title: `Follow-up overdue: ${leadName}`,
          message: `Was due ${new Date(fu.nextDueAt).toISOString()}${fu.timezone ? ` (${fu.timezone})` : ''}.`,
          leadId: String(fu.leadId), followUpId: String(fu._id),
        },
        sourceModule: 'crm', sourceEvent: 'FOLLOW_UP_OVERDUE', sourceEntityType: 'Lead', sourceEntityId: fu.leadId,
        idempotencyKey: `lead-follow-up-overdue-${fu._id}-${dueKey}`,
      });
      const res = await LeadFollowUp.updateOne(
        { _id: fu._id, status: { $in: FOLLOW_UP_OPEN_STATUSES }, nextDueAt: fu.nextDueAt },
        { $set: { overdueNotifiedFor: fu.nextDueAt }, $push: { actions: { action: 'overdue', at: now, by: null, details: { dueAt: fu.nextDueAt } } } },
      );
      if (res.modifiedCount) {
        result.followUpsOverdue += 1;
        await recordLeadEvent({ leadId: fu.leadId, type: 'follow_up.overdue', at: now, details: { followUpId: String(fu._id), dueAt: fu.nextDueAt, ownerId: String(fu.ownerId) }, dedupeKey: `fu-overdue:${fu._id}:${dueKey}` });
        emit([String(fu.ownerId)], 'lead:follow-up', { type: 'overdue', followUpId: String(fu._id) });
      }
    }

    // 4. Follow-ups still open long after their due time → supervisors.
    if (policy.escalation.enabled) {
      const cutoff = new Date(now.getTime() - policy.escalation.followUpAfterMinutes * MINUTE);
      const stale = await LeadFollowUp.find({
        status: { $in: FOLLOW_UP_OPEN_STATUSES }, nextDueAt: { $lte: cutoff }, ...aiWorking,
        $expr: { $ne: ['$escalatedFor', '$nextDueAt'] },
      }).select('_id leadId ownerId nextDueAt').limit(BATCH).lean();
      const names = await this._leadNames(stale.map((f) => f.leadId));
      await this._retireOrphans(stale, names, 'escalatedFor');
      for (const fu of stale) {
        const leadName = names.get(String(fu.leadId));
        if (!leadName) continue;
        const to = await escalateTo();
        const dueKey = new Date(fu.nextDueAt).getTime();
        if (to.length) {
          await notify({
            channels: ['IN_APP'], recipientIds: to, type: 'lead.follow_up_escalated', category: 'CRM', priority: 'HIGH',
            payload: {
              title: `Escalation: follow-up for ${leadName} is still open`,
              message: `Due ${new Date(fu.nextDueAt).toISOString()}; not completed by its owner.`,
              leadId: String(fu.leadId), followUpId: String(fu._id), ownerId: String(fu.ownerId),
            },
            sourceModule: 'crm', sourceEvent: 'FOLLOW_UP_ESCALATED', sourceEntityType: 'Lead', sourceEntityId: fu.leadId,
            idempotencyKey: `lead-follow-up-escalation-${fu._id}-${dueKey}`,
          });
        }
        const res = await LeadFollowUp.updateOne(
          { _id: fu._id, status: { $in: FOLLOW_UP_OPEN_STATUSES }, nextDueAt: fu.nextDueAt },
          { $set: { escalatedFor: fu.nextDueAt }, $push: { actions: { action: 'escalated', at: now, by: null, details: { recipients: to } } } },
        );
        if (res.modifiedCount) {
          result.followUpsEscalated += 1;
          await recordLeadEvent({ leadId: fu.leadId, type: 'follow_up.escalated', at: now, details: { followUpId: String(fu._id), recipients: to }, dedupeKey: `fu-escalation:${fu._id}:${dueKey}` });
          auditService.logEvent({ eventType: 'lead.follow_up_escalated', userId: null, ipAddress: 'internal', result: 'success', module: 'lead', details: { followUpId: String(fu._id), leadId: String(fu.leadId), recipients: to } });
        }
      }
    }
    return result;
  }

  /**
   * Follow-ups whose lead is gone (soft-deleted) are skipped by the sweep, but
   * they kept matching the next sweep's query too: once BATCH of them piled up
   * they filled every batch and starved live follow-ups of reminders, overdue
   * alerts and escalations. Stamp the marker for the current due instant (no
   * notification, no action entry) so they leave the candidate set; a snooze
   * or reschedule re-arms them exactly like any other follow-up.
   */
  async _retireOrphans(rows, names, marker) {
    const orphans = rows.filter((fu) => !names.has(String(fu.leadId)));
    if (!orphans.length) return;
    await LeadFollowUp.bulkWrite(orphans.map((fu) => ({
      updateOne: {
        filter: { _id: fu._id, status: { $in: FOLLOW_UP_OPEN_STATUSES }, nextDueAt: fu.nextDueAt },
        update: { $set: { [marker]: fu.nextDueAt } },
      },
    })), { ordered: false });
  }

  async _leadNames(leadIds) {
    if (!leadIds.length) return new Map();
    const leads = await Lead.find({ _id: { $in: leadIds } }).select('_id name').lean();
    return new Map(leads.map((l) => [String(l._id), l.name]));
  }
}

const leadSlaService = new LeadSlaService();
export default leadSlaService;
