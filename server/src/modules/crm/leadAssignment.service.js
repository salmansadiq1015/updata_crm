import mongoose from 'mongoose';
import Lead, { LEAD_STATUS } from './lead.model.js';
import LeadAssignmentPolicy from './leadAssignmentPolicy.model.js';
import LeadEvent from './leadEvent.model.js';
import { addBusinessMinutes, isValidTimezone } from './leadWorkflowTime.js';
import auditService from '../auth/audit.service.js';
import notificationService from '../notifications/notification.service.js';
import { ValidationError } from '../../shared/errors/AppError.js';
import logger from '../../shared/logger/index.js';

/**
 * Automatic lead assignment + first-response SLA stamping.
 *
 * - New leads (create / bulk import) that arrive WITHOUT an owner are assigned
 *   by the policy (round-robin or least-loaded among active eligible users;
 *   the first matching source/city/businessType rule narrows the pool). A lead
 *   that already has an owner is never reassigned.
 * - Whenever a lead gets an owner it has not yet responded to, the SLA clock
 *   starts: firstResponseDueAt = assignedAt + N (business) minutes.
 * Assignment problems never block lead creation: they are logged and the lead
 * stays unassigned.
 */

const OPEN_PIPELINE = [LEAD_STATUS.NEW, LEAD_STATUS.CONTACTED];

export const DEFAULT_POLICY = Object.freeze({
  key: 'default',
  enabled: false,
  strategy: 'round_robin',
  eligibleUserIds: [],
  rules: [],
  sla: {
    enabled: false,
    firstResponseMinutes: 240,
    businessHours: { enabled: false, timezone: 'Europe/Zurich', days: [1, 2, 3, 4, 5], start: '08:00', end: '17:00' },
  },
  escalation: { enabled: false, afterMinutes: 60, maxLevel: 2, userIds: [], followUpAfterMinutes: 24 * 60 },
});

const ids = (list) => (Array.isArray(list) ? list.map(String) : []);
const lc = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : null);

function withDefaults(doc) {
  const p = doc || {};
  return {
    ...DEFAULT_POLICY,
    ...p,
    sla: { ...DEFAULT_POLICY.sla, ...(p.sla || {}), businessHours: { ...DEFAULT_POLICY.sla.businessHours, ...(p.sla?.businessHours || {}) } },
    escalation: { ...DEFAULT_POLICY.escalation, ...(p.escalation || {}) },
    eligibleUserIds: ids(p.eligibleUserIds),
    rules: (p.rules || []).map((r) => ({ ...r, _id: r._id ? String(r._id) : null, userIds: ids(r.userIds) })),
  };
}

/** SLA fields for an owner assigned at `at` who has not responded yet. */
export function slaFieldsForAssignment(policy, at) {
  const reset = { escalationLevel: 0, slaBreachedAt: null, lastEscalatedAt: null };
  if (!policy?.sla?.enabled) return { firstResponseDueAt: null, slaStatus: 'none', ...reset };
  return {
    firstResponseDueAt: addBusinessMinutes(at, policy.sla.firstResponseMinutes, policy.sla.businessHours),
    slaStatus: 'pending',
    ...reset,
  };
}

function ruleMatches(rule, lead) {
  const m = rule.match || {};
  const checks = [];
  if (m.source) checks.push(lc(lead.source) === lc(m.source));
  if (m.city) checks.push(lc(lead.address?.city) === lc(m.city));
  if (m.businessType) checks.push(lc(lead.sourceMetadata?.businessType) === lc(m.businessType));
  return checks.length > 0 && checks.every(Boolean);
}

class LeadAssignmentService {
  async getPolicy() {
    const doc = await LeadAssignmentPolicy.findOne({ key: 'default' }).lean();
    return withDefaults(doc);
  }

  async updatePolicy(input, actorId, meta = {}) {
    const userIds = [...new Set([
      ...ids(input.eligibleUserIds), ...ids(input.escalation?.userIds), ...(input.rules || []).flatMap((r) => ids(r.userIds)),
    ])];
    if (userIds.length) {
      const User = mongoose.models.User;
      const found = await User.find({ _id: { $in: userIds } }).select('_id').lean();
      const known = new Set(found.map((u) => String(u._id)));
      const missing = userIds.filter((id) => !known.has(id));
      if (missing.length) {
        throw new ValidationError('Unknown users in assignment policy', missing.map((id) => ({ field: 'userIds', message: `Unknown user ${id}` })));
      }
    }
    if (input.sla?.businessHours?.timezone && !isValidTimezone(input.sla.businessHours.timezone)) {
      throw new ValidationError('Invalid timezone', [{ field: 'sla.businessHours.timezone', message: 'Must be an IANA timezone' }]);
    }
    const before = await this.getPolicy();
    const set = { updatedBy: actorId };
    for (const key of ['enabled', 'strategy', 'eligibleUserIds', 'rules']) if (input[key] !== undefined) set[key] = input[key];
    if (input.sla) {
      for (const [k, v] of Object.entries(input.sla)) {
        if (k === 'businessHours') for (const [bk, bv] of Object.entries(v || {})) set[`sla.businessHours.${bk}`] = bv;
        else set[`sla.${k}`] = v;
      }
    }
    if (input.escalation) for (const [k, v] of Object.entries(input.escalation)) set[`escalation.${k}`] = v;
    await LeadAssignmentPolicy.updateOne({ key: 'default' }, { $set: set, $setOnInsert: { key: 'default' } }, { upsert: true, runValidators: true });
    const after = await this.getPolicy();
    auditService.logEvent({
      eventType: 'lead.assignment_policy_updated', userId: actorId, ipAddress: meta.ipAddress || 'internal', userAgent: meta.userAgent,
      result: 'success', module: 'lead',
      details: { before: { ...before, rrCounters: undefined }, after: { ...after, rrCounters: undefined } },
    });
    return after;
  }

  async _activeUsers(userIds) {
    if (!userIds.length) return [];
    const User = mongoose.models.User;
    const rows = await User.find({ _id: { $in: userIds }, status: 'active', isDeleted: { $ne: true } }).select('_id').lean();
    const active = new Set(rows.map((u) => String(u._id)));
    return userIds.filter((id) => active.has(id)).sort();
  }

  /** The pool for a lead: first matching rule with active users, else the default pool. */
  async _poolFor(policy, lead) {
    for (const rule of policy.rules) {
      if (!ruleMatches(rule, lead)) continue;
      const users = await this._activeUsers(rule.userIds);
      if (users.length) return { key: `rule_${rule._id || rule.name || 'x'}`, users, strategy: rule.strategy || policy.strategy };
    }
    const users = await this._activeUsers(policy.eligibleUserIds);
    return users.length ? { key: 'default', users, strategy: policy.strategy } : null;
  }

  async _nextCounter(poolKey) {
    const safeKey = poolKey.replace(/[.$]/g, '_');
    const doc = await LeadAssignmentPolicy.findOneAndUpdate(
      { key: 'default' },
      { $inc: { [`rrCounters.${safeKey}`]: 1 } },
      { returnDocument: 'after', projection: { rrCounters: 1 } },
    ).lean();
    return Number(doc?.rrCounters?.[safeKey] || 1) - 1;
  }

  async _loads(userIds) {
    const rows = await Lead.aggregate([
      { $match: { assignedTo: { $in: userIds.map((id) => new mongoose.Types.ObjectId(id)) }, status: { $in: OPEN_PIPELINE }, isDeleted: false } },
      { $group: { _id: '$assignedTo', n: { $sum: 1 } } },
    ]);
    const loads = new Map(userIds.map((id) => [id, 0]));
    for (const r of rows) loads.set(String(r._id), r.n);
    return loads;
  }

  async _pick(pool, loadCache) {
    const counter = await this._nextCounter(pool.key);
    if (pool.strategy !== 'least_loaded') return pool.users[counter % pool.users.length];
    if (!loadCache.has(pool.key)) loadCache.set(pool.key, await this._loads(pool.users));
    const loads = loadCache.get(pool.key);
    const min = Math.min(...pool.users.map((u) => loads.get(u) ?? 0));
    const tied = pool.users.filter((u) => (loads.get(u) ?? 0) === min);
    const chosen = tied[counter % tied.length];
    loads.set(chosen, (loads.get(chosen) ?? 0) + 1);
    return chosen;
  }

  /**
   * Assignment + SLA fields to persist with ONE new lead (merged into the insert,
   * so the lead is never visible unassigned when the policy assigns it).
   */
  async prepareNew(lead, ctx = {}) {
    const [patch] = await this.prepareNewBatch([lead], ctx);
    return patch;
  }

  async prepareNewBatch(leads, { now = new Date() } = {}) {
    let policy;
    try {
      policy = await this.getPolicy();
    } catch (err) {
      logger.warn('Assignment policy unavailable; leads stay as given', { module: 'crm', error: { message: err.message } });
      return leads.map((lead) => (lead.assignedTo ? { assignedAt: now, assignmentSource: lead.source === 'import' ? 'import' : 'manual' } : {}));
    }
    const loadCache = new Map();
    const out = [];
    for (const lead of leads) {
      if (lead.assignedTo) {
        out.push({ assignedAt: now, assignmentSource: lead.source === 'import' ? 'import' : 'manual', ...slaFieldsForAssignment(policy, now) });
        continue;
      }
      if (!policy.enabled) { out.push({}); continue; }
      try {
        const pool = await this._poolFor(policy, lead);
        if (!pool) { out.push({}); continue; }
        const userId = await this._pick(pool, loadCache);
        out.push({ assignedTo: new mongoose.Types.ObjectId(userId), assignedAt: now, assignmentSource: 'auto', ...slaFieldsForAssignment(policy, now) });
      } catch (err) {
        logger.warn('Automatic lead assignment failed; lead left unassigned', { module: 'crm', error: { message: err.message } });
        out.push({});
      }
    }
    return out;
  }

  /** Events + owner alerts after new leads were persisted (best effort, never throws). */
  async afterCreate(leads, actorId = null) {
    try {
      const assigned = (leads || []).filter((l) => l?.assignedTo && l.assignedAt);
      if (!assigned.length) return;
      await LeadEvent.insertMany(assigned.map((l) => ({
        leadId: l._id,
        type: l.assignmentSource === 'auto' ? 'assignment.auto' : 'assignment.manual',
        at: l.assignedAt,
        actor: l.assignmentSource === 'auto' ? null : actorId,
        details: { assignedTo: String(l.assignedTo?._id ?? l.assignedTo), firstResponseDueAt: l.firstResponseDueAt ?? null, source: l.assignmentSource },
      })), { ordered: false });
      const auto = assigned.filter((l) => l.assignmentSource === 'auto');
      if (auto.length) {
        auditService.logEvent({
          eventType: 'lead.auto_assigned', userId: actorId, ipAddress: 'internal', result: 'success', module: 'lead',
          details: { count: auto.length, assignments: auto.slice(0, 50).map((l) => ({ leadId: String(l._id), assignedTo: String(l.assignedTo?._id ?? l.assignedTo) })) },
        });
      }
      await this._notifyAssignees(assigned, actorId);
    } catch (err) {
      logger.warn('Lead assignment follow-up failed', { module: 'crm', error: { message: err.message } });
    }
  }

  /**
   * Fields to persist when an existing lead's owner changes (called before the
   * write). Same owner → nothing (re-saving a form must not restart the clock).
   * A lead already responded to keeps its SLA result.
   */
  async assignmentPatch(leadId, assignedTo, now = new Date()) {
    const lead = await Lead.findById(leadId).select('assignedTo firstRespondedAt').lean();
    if (!lead) return {};
    const next = assignedTo ? String(assignedTo) : null;
    if (String(lead.assignedTo ?? '') === String(next ?? '')) return {};
    if (!next) {
      return lead.firstRespondedAt
        ? { assignedAt: null, assignmentSource: null }
        : { assignedAt: null, assignmentSource: null, firstResponseDueAt: null, slaStatus: 'none', escalationLevel: 0, slaBreachedAt: null, lastEscalatedAt: null };
    }
    if (lead.firstRespondedAt) return { assignedAt: now, assignmentSource: 'manual' };
    const policy = await this.getPolicy();
    return { assignedAt: now, assignmentSource: 'manual', ...slaFieldsForAssignment(policy, now) };
  }

  /** Bulk (re)assign: stamp assignment/SLA on the ids whose owner actually changed. */
  async stampBulkAssignment(changedIds, assignedTo, actorId, now = new Date()) {
    if (!changedIds.length) return;
    const policy = await this.getPolicy();
    const unresponded = { _id: { $in: changedIds }, firstRespondedAt: null };
    const responded = { _id: { $in: changedIds }, firstRespondedAt: { $ne: null } };
    // One bulkWrite (the reassignment itself stays ONE updateMany in the repository).
    await Lead.bulkWrite(assignedTo ? [
      { updateMany: { filter: unresponded, update: { $set: { assignedAt: now, assignmentSource: 'manual', ...slaFieldsForAssignment(policy, now) } } } },
      { updateMany: { filter: responded, update: { $set: { assignedAt: now, assignmentSource: 'manual' } } } },
    ] : [
      { updateMany: { filter: unresponded, update: { $set: { assignedAt: null, assignmentSource: null, firstResponseDueAt: null, slaStatus: 'none', escalationLevel: 0, slaBreachedAt: null, lastEscalatedAt: null } } } },
      { updateMany: { filter: responded, update: { $set: { assignedAt: null, assignmentSource: null } } } },
    ]);
    await this.afterAssignmentChange(changedIds, assignedTo, actorId);
  }

  /** Timeline events + owner alert after a manual (re)assignment. Never throws. */
  async afterAssignmentChange(leadIds, assignedTo, actorId) {
    try {
      const leads = await Lead.find({ _id: { $in: leadIds } }).select('_id name leadNumber assignedTo assignedAt firstResponseDueAt assignmentSource').lean();
      if (!leads.length) return;
      await LeadEvent.insertMany(leads.map((l) => ({
        leadId: l._id,
        type: assignedTo ? 'assignment.manual' : 'assignment.cleared',
        at: l.assignedAt || new Date(),
        actor: actorId || null,
        details: { assignedTo: assignedTo ? String(assignedTo) : null, firstResponseDueAt: l.firstResponseDueAt ?? null },
      })), { ordered: false });
      if (assignedTo && String(assignedTo) !== String(actorId)) await this._notifyAssignees(leads, actorId);
    } catch (err) {
      logger.warn('Lead reassignment follow-up failed', { module: 'crm', error: { message: err.message } });
    }
  }

  async _notifyAssignees(leads, actorId) {
    const byOwner = new Map();
    for (const l of leads) {
      const owner = String(l.assignedTo?._id ?? l.assignedTo);
      if (!byOwner.has(owner)) byOwner.set(owner, []);
      byOwner.get(owner).push(l);
    }
    for (const [owner, list] of byOwner) {
      const first = list[0];
      const due = list.map((l) => l.firstResponseDueAt).filter(Boolean).sort((a, b) => new Date(a) - new Date(b))[0] || null;
      await notificationService.create({
        channels: ['IN_APP'],
        recipientIds: [owner],
        type: 'lead.assigned',
        category: 'CRM',
        priority: 'NORMAL',
        payload: {
          title: list.length === 1 ? `Lead assigned to you: ${first.name}` : `${list.length} leads assigned to you`,
          message: due ? `First response due by ${new Date(due).toISOString()}` : 'No response deadline is configured.',
          leadId: list.length === 1 ? String(first._id) : null,
          leadIds: list.slice(0, 50).map((l) => String(l._id)),
          firstResponseDueAt: due ? new Date(due).toISOString() : null,
        },
        sourceModule: 'crm', sourceEvent: 'LEAD_ASSIGNED', sourceEntityType: 'Lead', sourceEntityId: first._id,
      }, actorId).catch((e) => logger.warn('lead assignment notification failed', { module: 'crm', error: e.message }));
    }
  }
}

const leadAssignmentService = new LeadAssignmentService();
export default leadAssignmentService;
