import mongoose from 'mongoose';
import LeadFollowUp, { FOLLOW_UP_OPEN_STATUSES } from './leadFollowUp.model.js';
import Lead from './lead.model.js';
import ContactLogEntry from './contactLog.model.js';
import LeadCommunication from './leadCommunication.model.js';
import MessageRecipient from '../messaging/messageRecipient.model.js';
import { checkContactSuppression } from './leadContactSuppression.js';
import { isValidTimezone, startOfNextZonedDay } from './leadWorkflowTime.js';
import auditService from '../auth/audit.service.js';
import notificationService from '../notifications/notification.service.js';
import {
  AppError, AuthorizationError, NotFoundError, ValidationError,
} from '../../shared/errors/AppError.js';
import logger from '../../shared/logger/index.js';
import { currentLeadAccessFilter } from '../../shared/security/requestAccessContext.js';
import { automationView } from '../aiCalling/engine/followUpView.js';

// Governance (team-scoped lead access, {} in company mode / outside a governed request).
const leadAccessMatch = () => { const f = currentLeadAccessFilter(); return Object.keys(f).length ? { $and: [f] } : {}; };

/**
 * Unified follow-up inbox over LeadFollowUp: buckets (overdue / today /
 * upcoming / done) per viewer timezone, cursor pagination, lifecycle actions
 * (complete, snooze, reassign, cancel) with ownership checks, audit and
 * realtime refresh, plus contact suppression shown on every open item.
 * Also serves the legacy GET /crm/leads/follow-ups shape for the mobile app.
 */

export const FOLLOW_UP_LIMIT = 200;
export const NOTE_EXCERPT_LENGTH = 140;
const DAY_MS = 24 * 60 * 60 * 1000;
const SUPPRESSION_CONCURRENCY = 8;
const IN_CHUNK = 5000;
const chunk = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));
const DEFAULT_PAST_DAYS = 30;
const DEFAULT_FUTURE_DAYS = 60;
const CALLBACK_DISPOSITIONS = new Set(['callback_requested', 'human_follow_up']);
const USER_FIELDS = { firstName: 1, lastName: 1, email: 1 };
const SUMMARY_BUCKETS = ['pending', 'completed', 'overdue', 'today', 'upcoming', 'done', 'aiManaged', 'aiScheduled', 'aiInProgress', 'aiCompleted', 'aiFailed', 'attention'];
const LEAD_ROW_FIELDS = {
  _id: 1, name: 1, leadNumber: 1, status: 1, assignedTo: 1, phone: 1, mobile: 1, email: 1, latestCall: 1, pipelineStage: 1, lastContactedAt: 1, lastContactChannel: 1,
};
const { ObjectId } = mongoose.Types;

const oid = (v) => (v instanceof ObjectId ? v : new ObjectId(String(v)));
const name = (u) => (u ? ([u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || null) : null);
const iso = (d) => (d ? new Date(d).toISOString() : null);

export function excerpt(text, max = NOTE_EXCERPT_LENGTH) {
  if (typeof text !== 'string') return null;
  const flat = text.replace(/\s+/g, ' ').trim();
  if (!flat) return null;
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function encodeCursor(at, id) {
  return Buffer.from(JSON.stringify({ at: new Date(at).toISOString(), id: String(id) })).toString('base64url');
}
function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const c = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!c?.at || !/^[0-9a-f]{24}$/i.test(c.id) || Number.isNaN(Date.parse(c.at))) throw new Error('bad');
    return { at: new Date(c.at), id: new ObjectId(c.id) };
  } catch {
    throw new ValidationError('Invalid cursor', [{ field: 'cursor', message: 'cursor is malformed' }]);
  }
}

function emit(userId, payload) {
  try { global.io?.to(`user:${userId}`).emit('lead:follow-up', payload); } catch { /* realtime is best effort */ }
}

class LeadFollowUpService {
  // ------------------------------------------------------------- creation
  /**
   * Idempotent creation keyed by `sourceKey`: a retried call/SMS completion
   * never creates a second follow-up. Returns the stored document.
   */
  async upsertFromSource({
    sourceKey, leadId, ownerId, dueAt, timezone = null, channel = null, note = null, source, createdBy = null, now = new Date(),
  }) {
    const due = new Date(dueAt);
    const doc = await LeadFollowUp.findOneAndUpdate(
      { sourceKey },
      {
        $setOnInsert: {
          sourceKey, leadId, ownerId, createdBy, dueAt: due, nextDueAt: due,
          timezone: isValidTimezone(timezone) ? timezone : null,
          channel, note: note ? String(note).slice(0, 2000) : null, status: 'open', source,
          taskType: ({ email: 'EMAIL', phone: 'PHONE_CALL', sms: 'SMS', in_person: 'MEETING' })[channel] || 'CUSTOM_TASK',
          actions: [{ action: 'created', at: now, by: createdBy, details: { sourceType: source.type } }],
        },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    ).lean();
    emit(String(doc.ownerId), { type: 'upserted', followUpId: String(doc._id), leadId: String(leadId) });
    return doc;
  }

  /** Manual follow-up from the inbox or the lead drawer. */
  async create({ leadId, ownerId = null, dueAt, timezone = null, channel = null, note = null, taskType = null, priority = 'NORMAL', reminderMinutes = null }, viewer, meta = {}) {
    const lead = await Lead.findById(leadId).select('_id name').lean();
    if (!lead) throw new NotFoundError('Lead', leadId);
    const owner = ownerId ? String(ownerId) : String(viewer.id);
    if (owner !== String(viewer.id)) await this._assertActiveUser(owner);
    const now = new Date();
    const due = new Date(dueAt);
    const doc = await LeadFollowUp.create({
      leadId, ownerId: owner, createdBy: viewer.id, dueAt: due, nextDueAt: due,
      timezone: isValidTimezone(timezone) ? timezone : null, channel, note,
      taskType, priority, reminderMinutes,
      status: 'open', source: { type: 'manual' },
      actions: [{ action: 'created', at: now, by: viewer.id, details: { sourceType: 'manual' } }],
    });
    this._audit('lead.follow_up_created', viewer.id, meta, { followUpId: String(doc._id), leadId: String(leadId), ownerId: owner });
    if (owner !== String(viewer.id)) await this._notifyOwner(doc, lead, viewer.id, 'assigned');
    emit(owner, { type: 'created', followUpId: String(doc._id), leadId: String(leadId) });
    return this.getById(doc._id, viewer);
  }

  /** Contact-log entry with a follow-up date on a lead (manual logs, WhatsApp, legacy paths). */
  async upsertFromContactLog(entry) {
    if (!entry?.leadId || !entry.followUpAt) return null;
    return this.upsertFromSource({
      sourceKey: `contact_log:${entry._id}`,
      leadId: entry.leadId?._id ?? entry.leadId,
      ownerId: entry.employeeId?._id ?? entry.employeeId ?? entry.createdBy,
      dueAt: entry.followUpAt,
      channel: entry.channel || null,
      note: entry.openPoints || entry.subject || excerpt(entry.note, 500),
      source: { type: 'contact_log', contactLogId: entry._id },
      createdBy: entry.createdBy?._id ?? entry.createdBy ?? null,
    });
  }

  /** A contact-log follow-up date was edited or the entry deleted. */
  async syncContactLog(entryId, { followUpAt, deleted = false } = {}, actorId = null) {
    const fu = await LeadFollowUp.findOne({ 'source.contactLogId': entryId, status: { $in: FOLLOW_UP_OPEN_STATUSES } }).lean();
    if (!fu) return null;
    const now = new Date();
    if (deleted || followUpAt === null) {
      return LeadFollowUp.updateOne({ _id: fu._id, status: { $in: FOLLOW_UP_OPEN_STATUSES } }, {
        $set: { status: 'cancelled', cancelledAt: now, cancelledBy: actorId, cancelReason: deleted ? 'Contact log entry deleted' : 'Follow-up date removed', closedAt: now },
        $push: { actions: { action: 'cancelled', at: now, by: actorId, details: { via: 'contact_log' } } },
      });
    }
    if (followUpAt) {
      const due = new Date(followUpAt);
      return LeadFollowUp.updateOne({ _id: fu._id, status: { $in: FOLLOW_UP_OPEN_STATUSES } }, {
        $set: { dueAt: due, nextDueAt: due, status: 'open', snoozedUntil: null },
        $push: { actions: { action: 'rescheduled', at: now, by: actorId, details: { via: 'contact_log', dueAt: due } } },
      });
    }
    return null;
  }

  /**
   * A completed device/agent communication (mobile SIM call or SMS, SIM call
   * campaign, AI SMS agent). A recorded follow-up time becomes a follow-up; a
   * callback/follow-up disposition WITHOUT a time becomes one due immediately
   * (the time still has to be agreed) — never a guessed time.
   */
  async fromCommunication(doc) {
    const outcome = doc?.outcome;
    if (!outcome || doc.receipt?.steps?.outcome?.status !== 'ok') return null;
    let dueAt = outcome.followUpAt ? new Date(outcome.followUpAt) : null;
    let note = excerpt(outcome.notes, 500);
    if (!dueAt && CALLBACK_DISPOSITIONS.has(outcome.disposition)) {
      dueAt = doc.completedAt ? new Date(doc.completedAt) : new Date();
      note = [`${outcome.disposition === 'callback_requested' ? 'Callback requested' : 'Follow-up requested'} — no time was recorded.`, note].filter(Boolean).join(' ');
    }
    if (!dueAt) return null;
    const type = doc.route === 'sim_sms_agent' ? 'sim_sms' : doc.route === 'sim_call_campaign' ? 'sim_call' : 'communication';
    return this.upsertFromSource({
      sourceKey: `communication:${doc._id}`,
      leadId: doc.leadId,
      ownerId: doc.createdBy,
      dueAt,
      timezone: outcome.followUpTimezone,
      channel: doc.channel,
      note,
      source: { type, communicationId: doc._id, contactLogId: doc.contactLogId || null },
      createdBy: doc.createdBy,
    });
  }

  /**
   * AI call that ended with a callback request (or a qualified verdict). The agent records
   * the requested time as an ISO instant or the lead's words; `resolved`
   * (aiCalling/engine/callbackTime.js) turns words like "in 10 minutes" or "tomorrow
   * morning" into a due time in the lead's timezone. Approximate times keep the lead's
   * words on the follow-up so a person can see exactly what was said.
   */
  async fromAiCall({ call, lead, campaign, outcome, resolved = null }) {
    const qualified = outcome?.action === 'mark_qualified' && outcome.qualification === 'qualified' && !outcome.requiresReview;
    if ((!qualified && outcome?.action !== 'schedule_callback') || !call?._id || !lead?._id) return null;
    const text = typeof outcome.callback?.requestedAt === 'string' ? outcome.callback.requestedAt.trim() : null;
    const iso = text && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(text) ? new Date(text) : null;
    const validIso = iso && !Number.isNaN(iso.getTime());
    const useResolved = !qualified && resolved?.at && !Number.isNaN(new Date(resolved.at).getTime());
    const dueAt = useResolved ? new Date(resolved.at) : validIso ? iso : (call.endedAt || new Date());
    const exact = validIso || (useResolved && !resolved.approximate);
    const note = qualified ? 'Qualified by the configured call rules. Review the call answers and send an introductory email.' : [
      exact ? null : `Callback requested during an AI call${text ? ` (requested time, as stated: "${text.slice(0, 200)}")` : ' — no time was given'}.`,
      useResolved && resolved.approximate ? `Planned for ${dueAt.toISOString()} (${resolved.timezone}); confirm the exact time with the lead.` : null,
      outcome.callback?.note ? String(outcome.callback.note).slice(0, 500) : null,
    ].filter(Boolean).join(' ');
    return this.upsertFromSource({
      sourceKey: `ai_call:${call._id}`,
      leadId: lead._id,
      ownerId: lead.assignedTo || campaign.createdBy,
      dueAt,
      timezone: useResolved ? resolved.timezone : null,
      channel: qualified ? 'email' : 'phone',
      note: note || null,
      source: { type: 'ai_call', callRecordId: call._id, campaignId: campaign._id, callingAgentId: campaign.agentId || null,
        qualification: outcome.qualification, recommendedAction: qualified ? 'INTRODUCTION_EMAIL' : 'SCHEDULE_CALLBACK',
        requestedTimeText: exact ? null : (text ? text.slice(0, 300) : null) },
      createdBy: null,
    });
  }

  /** Stop automatic outreach tasks after a later negative verdict; retain every record and action. */
  async closeAutomaticForLead(leadId, callId, ownerId) {
    const now = new Date();
    const result = await LeadFollowUp.updateMany({ leadId, createdBy: null, 'source.type': 'ai_call', status: { $in: FOLLOW_UP_OPEN_STATUSES } }, {
      $set: { status: 'cancelled', cancelledAt: now, closedAt: now, cancelReason: 'Lead no longer eligible for automatic follow-up' },
      $push: { actions: { action: 'cancelled', at: now, by: null, details: { callId: String(callId), reason: 'negative_call_outcome' } } },
    });
    if (result.modifiedCount) emit(String(ownerId), { type: 'cancelled', leadId: String(leadId) });
  }

  // ---------------------------------------------------------------- inbox
  async _teamUserIds(viewer) {
    const User = mongoose.models.User;
    if (!viewer.department) return [oid(viewer.id)];
    const users = await User.find({ department: viewer.department, isDeleted: { $ne: true } }).select('_id').lean();
    const list = users.map((u) => u._id);
    if (!list.some((id) => String(id) === String(viewer.id))) list.push(oid(viewer.id));
    return list;
  }

  async _scopeMatch(scope, viewer, ownerId = null) {
    if (scope === 'all' && !viewer.isSupervisor) {
      throw new AuthorizationError('Viewing every follow-up requires the lead:assign-policy permission');
    }
    let owners = null;
    if (scope === 'mine') owners = [oid(viewer.id)];
    else if (scope === 'team') owners = await this._teamUserIds(viewer);
    if (ownerId) {
      if (owners && !owners.some((id) => String(id) === String(ownerId))) {
        throw new AuthorizationError('That owner is outside the selected scope');
      }
      owners = [oid(ownerId)];
    }
    return owners ? { ownerId: { $in: owners } } : {};
  }

  _bucketMatch(bucket, now, endOfToday) {
    const open = { status: { $in: FOLLOW_UP_OPEN_STATUSES } };
    switch (bucket) {
      case 'overdue': return { ...open, nextDueAt: { $lt: now } };
      case 'today': return { ...open, nextDueAt: { $gte: now, $lt: endOfToday } };
      case 'upcoming': return { ...open, nextDueAt: { $gte: endOfToday } };
      case 'done': return { status: { $in: ['done', 'cancelled'] } };
      default: return open;
    }
  }

  /** Management view: who works the follow-up (AI agent / person) and AI call states. */
  _managementMatch(management) {
    switch (management) {
      case 'ai': return { 'automation.mode': 'ai' };
      case 'human': return { 'automation.mode': { $ne: 'ai' } };
      case 'ai_scheduled': return { 'automation.mode': 'ai', 'automation.state': { $in: ['scheduled', 'queued', 'retry_scheduled'] } };
      case 'ai_active': return { 'automation.mode': 'ai', 'automation.state': { $in: ['queued', 'calling', 'retry_scheduled'] } };
      case 'ai_completed': return { 'automation.state': 'completed' };
      case 'ai_failed': return { 'automation.state': { $in: ['failed', 'no_answer', 'busy'] } };
      case 'attention': return { $or: [{ 'automation.state': { $in: ['requires_human', 'failed', 'paused'] } }, { priority: 'CRITICAL' }] };
      default: return {};
    }
  }

  /**
   * Owner name, AI agent identity and live call state for one page of rows —
   * three indexed `_id $in` reads instead of three $lookups per row. Sets the
   * same `owner` / `aiAgent` / `aiCall` arrays the $lookup stages produced.
   */
  async _attachRowRefs(rows) {
    if (!rows.length) return;
    const ids = (pick) => [...new Map(rows.map(pick).filter(Boolean).map((id) => [String(id), id])).values()];
    const db = mongoose.connection.db;
    const byId = (docs) => new Map(docs.map((doc) => [String(doc._id), doc]));
    const ownerIds = ids((r) => r.ownerId);
    const agentIds = ids((r) => r.automation?.agentId);
    const callIds = ids((r) => r.automation?.callRecordId);
    const [owners, agents, calls] = await Promise.all([
      ownerIds.length ? db.collection('users').find({ _id: { $in: ownerIds } }, { projection: USER_FIELDS }).toArray() : [],
      agentIds.length ? db.collection('callingagents').find({ _id: { $in: agentIds } }, { projection: { name: 1, title: 1, agentType: 1, avatarPresetId: 1, availability: 1 } }).toArray() : [],
      callIds.length ? db.collection('callrecords').find({ _id: { $in: callIds } }, { projection: { state: 1, disposition: 1, qualification: 1, durationSeconds: 1, answeredAt: 1, endedAt: 1, 'callNotes.summary': 1 } }).toArray() : [],
    ]);
    const ownerMap = byId(owners); const agentMap = byId(agents); const callMap = byId(calls);
    for (const row of rows) {
      const o = ownerMap.get(String(row.ownerId));
      const a = row.automation?.agentId && agentMap.get(String(row.automation.agentId));
      const c = row.automation?.callRecordId && callMap.get(String(row.automation.callRecordId));
      row.owner = o ? [o] : [];
      row.aiAgent = a ? [a] : [];
      row.aiCall = c ? [c] : [];
    }
  }

  /** Agent identity + live call state for AI-managed rows (after pagination). */
  _automationLookups() {
    return [
      { $lookup: { from: 'callingagents', localField: 'automation.agentId', foreignField: '_id', pipeline: [{ $project: { name: 1, title: 1, agentType: 1, avatarPresetId: 1, availability: 1 } }], as: 'aiAgent' } },
      { $lookup: { from: 'callrecords', localField: 'automation.callRecordId', foreignField: '_id', pipeline: [{ $project: { state: 1, disposition: 1, qualification: 1, durationSeconds: 1, answeredAt: 1, endedAt: 1, 'callNotes.summary': 1 } }], as: 'aiCall' } },
    ];
  }

  /**
   * Live, governed lead for each follow-up row. Equality lookup on `_id`
   * (localField/foreignField) so every row is one index point read; rows whose
   * lead is soft-deleted or outside the viewer's lead access drop out.
   */
  _leadLookup(project = LEAD_ROW_FIELDS) {
    return [
      {
        $lookup: {
          from: Lead.collection.name,
          localField: 'leadId',
          foreignField: '_id',
          pipeline: [
            { $match: { isDeleted: { $ne: true }, ...leadAccessMatch() } },
            { $project: project },
          ],
          as: 'lead',
        },
      },
      { $unwind: '$lead' },
    ];
  }

  /**
   * Live, governed leads by id (chunked `_id $in`, index point reads) →
   * Map(String(id) → projected lead). Same visibility as the $lookup join:
   * not soft-deleted and inside the request's lead access filter.
   */
  async _liveLeads(ids, project = LEAD_ROW_FIELDS) {
    const out = new Map();
    const unique = [...new Map(ids.filter(Boolean).map((id) => [String(id), id])).values()];
    for (const part of chunk(unique, IN_CHUNK)) {
      // eslint-disable-next-line no-await-in-loop
      const docs = await Lead.find({ _id: { $in: part }, isDeleted: { $ne: true }, ...leadAccessMatch() })
        .setOptions({ includeDeleted: true }) // isDeleted is explicit above
        .select(project).lean();
      for (const doc of docs) out.set(String(doc._id), doc);
    }
    return out;
  }

  _pipelineHead(match) {
    return [{ $match: match }, ...this._leadLookup()];
  }

  /**
   * One inbox page. `tz` is the viewer's IANA zone (decides where "today" ends);
   * open buckets sort by next due time ascending, `done` by close time descending.
   */
  async list({
    scope = 'mine', bucket = 'open', cursor = null, limit = 25, tz = 'UTC', leadId = null, ownerId = null, q = '', channel = null, qualification = null, order = null, management = null, agentId = null,
  }, viewer, now = new Date()) {
    const zone = isValidTimezone(tz) ? tz : 'UTC';
    const endOfToday = startOfNextZonedDay(now, zone);
    const match = {
      ...(await this._scopeMatch(scope, viewer, ownerId)),
      ...this._bucketMatch(bucket, now, endOfToday),
      ...(leadId ? { leadId: oid(leadId) } : {}),
      ...(channel ? { channel } : {}),
      ...(agentId ? { 'automation.agentId': oid(agentId) } : {}),
    };
    const managed = this._managementMatch(management);
    if (managed.$or) match.$and = [...(match.$and || []), { $or: managed.$or }];
    else Object.assign(match, managed);
    const desc = order ? order === 'desc' : bucket === 'done';
    const sortField = bucket === 'done' ? 'closedAt' : 'nextDueAt';
    const c = decodeCursor(cursor);
    if (c) {
      const op = desc ? '$lt' : '$gt';
      match.$or = [{ [sortField]: { [op]: c.at } }, { [sortField]: c.at, _id: { [op]: c.id } }];
    }
    const dir = desc ? -1 : 1;
    // Search after the governed lead lookup, before pagination. Treat input as
    // literal text so punctuation cannot change the meaning of the query.
    const search = q.trim() ? new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
    const leadMatches = (lead, row) => (!qualification || lead.latestCall?.qualificationStatus === qualification)
      && (!search || [lead.name, lead.leadNumber, lead.phone, lead.mobile, lead.email, row.note]
        .some((value) => typeof value === 'string' && search.test(value)));
    // Walk the follow-ups in page order (index-backed sort) in growing batches
    // and join their leads with one indexed `_id $in` read per batch, keeping
    // rows whose lead is live, visible and matches the lead-side filters,
    // until the page (+1 for hasNext) is full. Same rows, same order as
    // joining every follow-up in scope first, but the work is bounded by the
    // page instead of the whole inbox (no per-row $lookup sub-pipeline).
    const sort = { [sortField]: dir, _id: dir };
    const op = desc ? '$lt' : '$gt';
    const rows = [];
    let after = null;
    let batch = Math.max((limit + 1) * 2, 50);
    for (;;) {
      const filter = after
        ? { $and: [match, { $or: [{ [sortField]: { [op]: after.at } }, { [sortField]: after.at, _id: { [op]: after.id } }] }] }
        : match;
      // eslint-disable-next-line no-await-in-loop
      const scanned = await LeadFollowUp.find(filter).sort(sort).limit(batch).select('-actions').lean();
      if (!scanned.length) break;
      // eslint-disable-next-line no-await-in-loop
      const leads = await this._liveLeads(scanned.map((row) => row.leadId));
      for (const row of scanned) {
        const lead = leads.get(String(row.leadId));
        if (lead && leadMatches(lead, row)) {
          rows.push({ ...row, lead });
          if (rows.length > limit) break;
        }
      }
      if (rows.length > limit || scanned.length < batch) break;
      const tail = scanned[scanned.length - 1];
      after = { at: tail[sortField], id: tail._id };
      batch = Math.min(batch * 2, 2000);
    }
    await this._attachRowRefs(rows.slice(0, limit + 1));
    const hasNext = rows.length > limit;
    const page = rows.slice(0, limit);
    const data = await this._serializeMany(page, now, endOfToday);
    const last = page[page.length - 1];
    return {
      data,
      pagination: { limit, hasNext, nextCursor: hasNext && last ? encodeCursor(last[sortField], last._id) : null },
      meta: { timezone: zone, endOfToday: endOfToday.toISOString() },
    };
  }

  async summary({ scope = 'mine', tz = 'UTC' }, viewer, now = new Date()) {
    const zone = isValidTimezone(tz) ? tz : 'UTC';
    const endOfToday = startOfNextZonedDay(now, zone);
    const base = await this._scopeMatch(scope, viewer);
    const open = { $in: ['$status', FOLLOW_UP_OPEN_STATUSES] };
    const count = (cond) => ({ $sum: { $cond: [cond, 1, 0] } });
    // Count per LEAD first (one pass over the follow-ups in scope), then
    // resolve the distinct leads with chunked indexed `_id $in` reads instead of
    // a $lookup sub-pipeline per follow-up (which dominated: ~10 s for 15k rows).
    // Rows of soft-deleted / out-of-scope leads drop out exactly as before.
    const perLead = await LeadFollowUp.aggregate([
      { $match: base },
      {
        $group: {
          _id: '$leadId',
          pending: count(open),
          completed: count({ $eq: ['$status', 'done'] }),
          overdue: count({ $and: [open, { $lt: ['$nextDueAt', now] }] }),
          today: count({ $and: [open, { $gte: ['$nextDueAt', now] }, { $lt: ['$nextDueAt', endOfToday] }] }),
          upcoming: count({ $and: [open, { $gte: ['$nextDueAt', endOfToday] }] }),
          done: count({ $in: ['$status', ['done', 'cancelled']] }),
          aiManaged: count({ $and: [{ $eq: ['$automation.mode', 'ai'] }, open] }),
          aiScheduled: count({ $and: [{ $eq: ['$automation.mode', 'ai'] }, { $in: ['$automation.state', ['scheduled', 'queued', 'retry_scheduled']] }] }),
          aiInProgress: count({ $and: [{ $eq: ['$automation.mode', 'ai'] }, { $eq: ['$automation.state', 'calling'] }] }),
          aiCompleted: count({ $eq: ['$automation.state', 'completed'] }),
          aiFailed: count({ $in: ['$automation.state', ['failed', 'no_answer', 'busy']] }),
          attention: count({ $and: [open, { $in: ['$automation.state', ['requires_human', 'failed', 'paused']] }] }),
        },
      },
    ]);
    const leads = await this._liveLeads(perLead.map((row) => row._id), { _id: 1, 'latestCall.qualificationStatus': 1 });
    const totals = Object.fromEntries(SUMMARY_BUCKETS.map((k) => [k, 0]));
    let totalLeads = 0;
    let qualifiedLeads = 0;
    const liveIds = [];
    for (const row of perLead) {
      const lead = leads.get(String(row._id));
      if (!lead) continue;
      liveIds.push(lead._id);
      totalLeads += 1;
      if (lead.latestCall?.qualificationStatus === 'QUALIFIED') qualifiedLeads += 1;
      for (const k of SUMMARY_BUCKETS) totals[k] += row[k];
    }
    const emails = { sent: 0, delivered: 0, failed: 0 };
    for (const ids of chunk(liveIds, IN_CHUNK)) {
      // eslint-disable-next-line no-await-in-loop
      const [part] = await MessageRecipient.aggregate([
        { $match: { leadId: { $in: ids }, channel: 'email' } },
        { $group: { _id: null,
          sent: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$sentAt', null] }, null] }, 1, 0] } },
          delivered: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$deliveredAt', null] }, null] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $in: ['$status', ['failed', 'undelivered']] }, 1, 0] } },
        } },
      ]);
      if (part) { emails.sent += part.sent; emails.delivered += part.delivered; emails.failed += part.failed; }
    }
    return { overdue: totals.overdue, today: totals.today, upcoming: totals.upcoming, done: totals.done,
      pending: totals.pending, completed: totals.completed,
      aiManaged: totals.aiManaged, aiScheduled: totals.aiScheduled, aiInProgress: totals.aiInProgress,
      aiCompleted: totals.aiCompleted, aiFailed: totals.aiFailed, attention: totals.attention,
      totalLeads, qualifiedLeads,
      emailsSent: emails.sent, emailsDelivered: emails.delivered, emailsFailed: emails.failed, timezone: zone };
  }

  async getById(id, viewer, now = new Date()) {
    const rows = await LeadFollowUp.aggregate([
      ...this._pipelineHead({ _id: oid(id) }),
      { $lookup: { from: 'users', localField: 'ownerId', foreignField: '_id', pipeline: [{ $project: USER_FIELDS }], as: 'owner' } },
      ...this._automationLookups(),
    ]);
    if (!rows.length) throw new NotFoundError('FollowUp', id);
    const [item] = await this._serializeMany(rows, now, startOfNextZonedDay(now, 'UTC'));
    return item;
  }

  async _serializeMany(rows, now, endOfToday) {
    const out = [];
    // Contact suppression per distinct (lead, channel) of the OPEN rows, run
    // with bounded concurrency instead of one sequential check per row.
    const memo = new Map();
    const pending = [...new Map(rows.filter((r) => FOLLOW_UP_OPEN_STATUSES.includes(r.status))
      .map((r) => [`${r.leadId}:${r.channel || ''}`, r])).entries()];
    for (let i = 0; i < pending.length; i += SUPPRESSION_CONCURRENCY) {
      // eslint-disable-next-line no-await-in-loop
      const results = await Promise.all(pending.slice(i, i + SUPPRESSION_CONCURRENCY)
        .map(([, r]) => checkContactSuppression(r.leadId, r.channel || null)));
      pending.slice(i, i + SUPPRESSION_CONCURRENCY).forEach(([key], j) => memo.set(key, results[j]));
    }
    for (const r of rows) {
      const open = FOLLOW_UP_OPEN_STATUSES.includes(r.status);
      const suppression = open ? memo.get(`${r.leadId}:${r.channel || ''}`) : null;
      const due = new Date(r.nextDueAt);
      out.push({
        id: String(r._id),
        leadId: String(r.leadId),
        lead: { id: String(r.lead._id), name: r.lead.name, leadNumber: r.lead.leadNumber ?? null, status: r.lead.status,
          email: r.lead.email ?? null, phone: r.lead.mobile || r.lead.phone || null,
          lastContactedAt: iso(r.lead.lastContactedAt), lastContactChannel: r.lead.lastContactChannel ?? null,
          latestCall: r.lead.latestCall ?? null, pipelineStage: r.lead.pipelineStage ?? 'LEAD' },
        owner: { id: String(r.ownerId), name: name(r.owner?.[0]) },
        createdBy: r.createdBy ? String(r.createdBy) : null,
        dueAt: iso(r.dueAt),
        nextDueAt: iso(r.nextDueAt),
        timezone: r.timezone ?? null,
        channel: r.channel ?? null,
        note: r.note ?? null,
        taskType: r.taskType ?? null, priority: r.priority ?? 'NORMAL', reminderMinutes: r.reminderMinutes ?? null,
        status: r.status,
        bucket: !open ? 'done' : due < now ? 'overdue' : due < endOfToday ? 'today' : 'upcoming',
        snoozedUntil: iso(r.snoozedUntil),
        snoozeCount: r.snoozeCount ?? 0,
        completedAt: iso(r.completedAt),
        completedBy: r.completedBy ? String(r.completedBy) : null,
        completionNote: r.completionNote ?? null,
        cancelledAt: iso(r.cancelledAt),
        cancelReason: r.cancelReason ?? null,
        source: {
          type: r.source?.type ?? 'manual',
          communicationId: r.source?.communicationId ? String(r.source.communicationId) : null,
          callRecordId: r.source?.callRecordId ? String(r.source.callRecordId) : null,
          campaignId: r.source?.campaignId ? String(r.source.campaignId) : null,
          callingAgentId: r.source?.callingAgentId ? String(r.source.callingAgentId) : null,
          qualification: r.source?.qualification ?? null,
          recommendedAction: r.source?.recommendedAction ?? null,
          contactLogId: r.source?.contactLogId ? String(r.source.contactLogId) : null,
          requestedTimeText: r.source?.requestedTimeText ?? null,
        },
        suppression,
        automation: r.automation?.mode === 'ai' || r.automation?.state ? {
          ...automationView(r.automation, r.aiCall?.[0] || null),
          agent: r.aiAgent?.[0] ? { id: String(r.aiAgent[0]._id), name: r.aiAgent[0].name, title: r.aiAgent[0].title || null, agentType: r.aiAgent[0].agentType || 'custom', avatarPresetId: r.aiAgent[0].avatarPresetId || null, availability: r.aiAgent[0].availability } : null,
        } : null,
        createdAt: iso(r.createdAt),
      });
    }
    return out;
  }

  // -------------------------------------------------------------- actions
  async _loadForAction(id, viewer, { requireOwnerOrSupervisor = true } = {}) {
    const fu = await LeadFollowUp.findById(id).lean();
    if (!fu) throw new NotFoundError('FollowUp', id);
    const lead = await Lead.findById(fu.leadId).select('_id name leadNumber').lean();
    if (!lead) throw new NotFoundError('Lead', fu.leadId);
    const mine = String(fu.ownerId) === String(viewer.id) || String(fu.createdBy) === String(viewer.id);
    if (requireOwnerOrSupervisor && !mine && !viewer.isSupervisor) {
      throw new AuthorizationError('Only the owner, the creator or a supervisor can change this follow-up');
    }
    return { fu, lead };
  }

  async _transition(fu, set, action, viewer, details = null) {
    const now = new Date();
    const updated = await LeadFollowUp.findOneAndUpdate(
      { _id: fu._id, status: { $in: FOLLOW_UP_OPEN_STATUSES } },
      { $set: set, $push: { actions: { action, at: now, by: viewer.id, details } } },
      { returnDocument: 'after', runValidators: true },
    ).lean();
    if (!updated) throw new AppError('This follow-up is already closed', 409, 'FOLLOW_UP_CLOSED');
    return updated;
  }

  async complete(id, { note = null } = {}, viewer, meta = {}) {
    const { fu } = await this._loadForAction(id, viewer);
    const now = new Date();
    await this._transition(fu, { status: 'done', completedAt: now, completedBy: viewer.id, completionNote: note, closedAt: now }, 'completed', viewer);
    await this._stopAutomation(fu._id, 'done', viewer.id);
    this._audit('lead.follow_up_completed', viewer.id, meta, { followUpId: String(fu._id), leadId: String(fu.leadId) });
    emit(String(fu.ownerId), { type: 'completed', followUpId: String(fu._id) });
    return this.getById(fu._id, viewer);
  }

  async snooze(id, { until }, viewer, meta = {}) {
    const { fu } = await this._loadForAction(id, viewer);
    const at = new Date(until);
    if (!(at.getTime() > Date.now())) throw new ValidationError('Snooze must move the follow-up into the future', [{ field: 'until', message: 'until must be in the future' }]);
    await this._transition(fu, { status: 'snoozed', snoozedUntil: at, nextDueAt: at, snoozeCount: (fu.snoozeCount || 0) + 1 }, 'snoozed', viewer, { until: at });
    this._audit('lead.follow_up_snoozed', viewer.id, meta, { followUpId: String(fu._id), leadId: String(fu.leadId), until: at });
    emit(String(fu.ownerId), { type: 'snoozed', followUpId: String(fu._id) });
    return this.getById(fu._id, viewer);
  }

  async cancel(id, { reason }, viewer, meta = {}) {
    const { fu } = await this._loadForAction(id, viewer);
    const now = new Date();
    await this._transition(fu, { status: 'cancelled', cancelledAt: now, cancelledBy: viewer.id, cancelReason: reason, closedAt: now }, 'cancelled', viewer, { reason });
    await this._stopAutomation(fu._id, 'cancelled', viewer.id);
    this._audit('lead.follow_up_cancelled', viewer.id, meta, { followUpId: String(fu._id), leadId: String(fu.leadId), reason });
    emit(String(fu.ownerId), { type: 'cancelled', followUpId: String(fu._id) });
    return this.getById(fu._id, viewer);
  }

  async reassign(id, { ownerId }, viewer, meta = {}) {
    const { fu, lead } = await this._loadForAction(id, viewer);
    if (String(fu.ownerId) === String(ownerId)) return this.getById(fu._id, viewer);
    await this._assertActiveUser(ownerId);
    const updated = await this._transition(fu, { ownerId: oid(ownerId) }, 'reassigned', viewer, { from: String(fu.ownerId), to: String(ownerId) });
    this._audit('lead.follow_up_reassigned', viewer.id, meta, { followUpId: String(fu._id), leadId: String(fu.leadId), from: String(fu.ownerId), to: String(ownerId) });
    if (String(ownerId) !== String(viewer.id)) await this._notifyOwner(updated, lead, viewer.id, 'assigned');
    emit(String(fu.ownerId), { type: 'reassigned', followUpId: String(fu._id) });
    emit(String(ownerId), { type: 'reassigned', followUpId: String(fu._id) });
    return this.getById(fu._id, viewer);
  }

  /**
   * Action-time contact check: the client calls this right before it dials /
   * opens a composer from the inbox. A hard block answers 409 CONTACT_SUPPRESSED.
   */
  async contactCheck(id, channel, viewer) {
    const fu = await LeadFollowUp.findById(id).select('leadId channel').lean();
    if (!fu) throw new NotFoundError('FollowUp', id);
    const lead = await Lead.findById(fu.leadId).select('_id').lean();
    if (!lead) throw new NotFoundError('Lead', fu.leadId);
    const result = await checkContactSuppression(fu.leadId, channel || fu.channel || null);
    if (result.suppressed) {
      const err = new AppError(`Contact blocked: ${result.reason}`, 409, 'CONTACT_SUPPRESSED', result.reasons.map((r) => ({ field: 'channel', code: r, message: r })));
      err.data = result;
      throw err;
    }
    return { allowed: true, ...result, checkedBy: String(viewer.id) };
  }

  /** An AI-managed follow-up closed by a person: cancel its pending call (never blocks the close). */
  async _stopAutomation(followUpId, status, by) {
    try {
      const { default: followUpCalling } = await import('../aiCalling/followUpCalling.service.js');
      await followUpCalling.onFollowUpClosed(followUpId, { status, by });
    } catch (e) { logger.warn('stopping AI follow-up automation failed', { module: 'crm', followUpId: String(followUpId), error: e.message }); }
  }

  async _assertActiveUser(userId) {
    const User = mongoose.models.User;
    const user = await User.findOne({ _id: userId, status: 'active', isDeleted: { $ne: true } }).select('_id').lean();
    if (!user) throw new ValidationError('Owner must be an active user', [{ field: 'ownerId', message: 'Unknown or inactive user' }]);
  }

  async _notifyOwner(fu, lead, actorId, kind) {
    await notificationService.create({
      channels: ['IN_APP'],
      recipientIds: [String(fu.ownerId)],
      type: 'lead.follow_up_assigned',
      category: 'CRM',
      priority: 'NORMAL',
      payload: {
        title: `Follow-up assigned to you: ${lead.name}`,
        message: `Due ${new Date(fu.nextDueAt).toISOString()}${fu.timezone ? ` (${fu.timezone})` : ''}`,
        leadId: String(lead._id), followUpId: String(fu._id), kind,
      },
      sourceModule: 'crm', sourceEvent: 'FOLLOW_UP_ASSIGNED', sourceEntityType: 'Lead', sourceEntityId: lead._id,
    }, actorId).catch((e) => logger.warn('follow-up notification failed', { module: 'crm', error: e.message }));
  }

  _audit(eventType, userId, meta, details) {
    auditService.logEvent({
      eventType, userId, ipAddress: meta.ipAddress || 'internal', userAgent: meta.userAgent, result: 'success', module: 'lead', details,
    });
  }

  // --------------------------------------------------------------- legacy
  /**
   * GET /crm/leads/follow-ups (mobile app). Same response shape as before:
   * open follow-ups from LeadFollowUp, plus contact-log follow-up dates that no
   * follow-up record tracks yet (written before migration 032 or by a direct
   * model write). `contactLogId` keeps its meaning where a log exists and falls
   * back to the follow-up id, so it stays a unique row key.
   */
  async listLegacy({ from, to, scope = 'mine' } = {}, userId, now = new Date()) {
    const start = from ? new Date(from) : new Date(now.getTime() - DEFAULT_PAST_DAYS * DAY_MS);
    const end = to ? new Date(to) : new Date(now.getTime() + DEFAULT_FUTURE_DAYS * DAY_MS);
    if (start.getTime() > end.getTime()) {
      throw new ValidationError('Validation failed', [{ field: 'to', message: "'to' must not be before 'from'", type: 'date.min' }]);
    }
    const me = oid(userId);
    const fuMatch = { status: { $in: FOLLOW_UP_OPEN_STATUSES }, nextDueAt: { $gte: start, $lte: end } };
    if (scope !== 'all') fuMatch.$or = [{ ownerId: me }, { createdBy: me }];
    const followUps = await LeadFollowUp.aggregate([
      { $match: fuMatch },
      { $sort: { nextDueAt: 1, _id: 1 } }, // before the lead join: lookups stop once the page is full
      ...this._leadLookup(),
      { $limit: FOLLOW_UP_LIMIT },
      { $lookup: { from: ContactLogEntry.collection.name, localField: 'source.contactLogId', foreignField: '_id', pipeline: [{ $project: { subject: 1 } }], as: 'log' } },
      ...this._automationLookups(),
    ]);

    const logMatch = { isDeleted: false, leadId: { $ne: null }, followUpAt: { $gte: start, $lte: end } };
    if (scope !== 'all') logMatch.$or = [{ createdBy: me }, { employeeId: me }];
    const logs = await ContactLogEntry.aggregate([
      { $match: logMatch },
      { $sort: { followUpAt: 1, _id: 1 } },
      { $lookup: { from: LeadFollowUp.collection.name, localField: '_id', foreignField: 'source.contactLogId', pipeline: [{ $project: { _id: 1 } }, { $limit: 1 }], as: 'tracked' } },
      { $match: { tracked: { $size: 0 } } },
      {
        $lookup: {
          from: Lead.collection.name,
          let: { leadId: '$leadId' },
          pipeline: [{ $match: { $expr: { $eq: ['$_id', '$$leadId'] }, isDeleted: { $ne: true }, ...leadAccessMatch() } }, { $project: { _id: 1, name: 1, leadNumber: 1 } }],
          as: 'lead',
        },
      },
      { $unwind: '$lead' },
      { $limit: FOLLOW_UP_LIMIT },
      {
        $lookup: {
          from: LeadCommunication.collection.name, localField: '_id', foreignField: 'contactLogId',
          pipeline: [{ $project: { _id: 0, 'outcome.followUpTimezone': 1 } }, { $limit: 1 }], as: 'communication',
        },
      },
    ]);

    const rows = [
      ...followUps.map((r) => ({
        contactLogId: String(r.source?.contactLogId ?? r._id),
        leadId: String(r.lead._id),
        leadNumber: r.lead.leadNumber ?? null,
        leadName: r.lead.name,
        followUpAt: new Date(r.nextDueAt).toISOString(),
        followUpTimezone: r.timezone ?? null,
        channel: r.channel || 'other',
        subject: r.log?.[0]?.subject ?? null,
        note: excerpt(r.note),
        ...(r.lead.latestCall ? { latestCall: r.lead.latestCall, pipelineStage: r.lead.pipelineStage ?? 'LEAD' } : {}),
        // Additive, AI follow-ups only (ordinary rows keep the exact legacy shape; older app
        // builds strip unknown keys): the follow-up id + AI follow-up state for the app's controls.
        ...(r.automation?.mode === 'ai' || r.automation?.state ? { followUpId: String(r._id), automation: {
          mode: r.automation.mode || 'human', state: r.automation.state || null, reason: r.automation.reason || null,
          agentId: r.automation.agentId ? String(r.automation.agentId) : null, agentName: r.aiAgent?.[0]?.name ?? null,
          attempts: r.automation.attempts || 0, lastError: r.automation.lastError || null,
          callState: r.aiCall?.[0]?.state ?? null, summary: r.aiCall?.[0]?.callNotes?.summary ? excerpt(r.aiCall[0].callNotes.summary, 300) : null,
        } } : {}),
      })),
      ...logs.map((row) => ({
        contactLogId: String(row._id),
        leadId: String(row.lead._id),
        leadNumber: row.lead.leadNumber ?? null,
        leadName: row.lead.name,
        followUpAt: row.followUpAt.toISOString(),
        followUpTimezone: row.communication?.[0]?.outcome?.followUpTimezone ?? null,
        channel: row.channel,
        subject: row.subject ?? null,
        note: excerpt(row.note),
      })),
    ];
    rows.sort((a, b) => (a.followUpAt < b.followUpAt ? -1 : a.followUpAt > b.followUpAt ? 1 : a.contactLogId.localeCompare(b.contactLogId)));
    return rows.slice(0, FOLLOW_UP_LIMIT);
  }
}

const leadFollowUpService = new LeadFollowUpService();
export default leadFollowUpService;
