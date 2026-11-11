/**
 * Read side + owner actions for the Incoming Calls workspace (web and mobile share it).
 * Every figure is computed from persisted InboundCall documents; nothing is estimated.
 * Calls are owner-scoped (createdBy), like AI calls; supervisors with inbound-calls:admin see all.
 */

import mongoose from 'mongoose';

import InboundCall from './inboundCall.model.js';
import InboundCallEvent from './inboundCallEvent.model.js';
import PairedDevice from '../pairedPhone/pairedDevice.model.js';
import CallingAgent from '../aiCalling/callingAgent.model.js';
import Lead from '../crm/lead.model.js';
import User from '../auth/user.model.js';
import { toCsv } from '../../shared/utils/csv.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/AppError.js';
import { ACTIVE_STATUSES, TERMINAL_STATUSES } from './engine/stateMachine.js';
import { deviceReadiness } from '../pairedPhone/readiness.js';
import { CALLER_FIELDS, CALLER_FIELD_KEYS } from './engine/receptionistPrompt.js';
import { OPEN_WORK_STATUSES, WORK_STATUSES } from './engine/workStatus.js';
import { normalizeQuestions } from './engine/closingQuestions.js';
import inboundService from './inboundCall.service.js';
import { pricedCost } from '../aiCalling/callAnalytics.service.js';

const { ObjectId } = mongoose.Types;
const SORTS = { newest: { createdAt: -1, _id: -1 }, oldest: { createdAt: 1, _id: 1 }, longest: { durationSeconds: -1, _id: -1 } };
const LIST_COUNT_CAP = 10000;
const escapeRegex = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Owner of the phone, or the person the call is assigned to; supervisors (inbound-calls:admin) see all.
const scopeOf = (viewer) => (viewer.seeAll ? {} : { $or: [{ createdBy: new ObjectId(String(viewer.id)) }, { assignedTo: new ObjectId(String(viewer.id)) }] });

export function buildFilter(viewer, q = {}) {
  const f = { ...scopeOf(viewer), isTest: { $ne: true } };
  if (q.status) f.status = { $in: String(q.status).split(',') };
  if (q.handledBy === 'ai') f.answeredBy = 'ai';
  if (q.handledBy === 'human') f.answeredBy = 'human';
  if (q.handledBy === 'none') f.answeredBy = null;
  if (q.callerType === 'new') f['match.status'] = 'new';
  if (q.callerType === 'existing') f['match.status'] = 'existing';
  if (q.callerType === 'private') f['caller.presentation'] = { $ne: 'available' };
  if (q.callerType === 'ambiguous') f['match.status'] = 'ambiguous';
  if (q.simSlot !== undefined && q.simSlot !== null && q.simSlot !== '') f.simSlot = Number(q.simSlot);
  if (q.deviceId) f.deviceId = new ObjectId(String(q.deviceId));
  if (q.agentId) f['handling.agentId'] = new ObjectId(String(q.agentId));
  if (q.outcome) f.outcome = { $in: String(q.outcome).split(',') };
  if (q.qualification) f['qualification.result'] = { $in: String(q.qualification).split(',') };
  if (q.inquiry) f.$and = [...(f.$and || []), { $or: [{ 'intents.primary': q.inquiry }, { 'intents.secondary': q.inquiry }] }];
  if (q.assignedTo === 'me') f.assignedTo = new ObjectId(String(viewer.id));
  else if (q.assignedTo === 'none') f.assignedTo = null;
  else if (q.assignedTo) f.assignedTo = new ObjectId(String(q.assignedTo));
  if (q.workStatus === 'open') f['work.status'] = { $in: [...OPEN_WORK_STATUSES] };
  else if (q.workStatus) f['work.status'] = { $in: String(q.workStatus).split(',') };
  if (q.leadCreated === true || q.leadCreated === 'true') f.leadCreated = true;
  if (q.ids) f._id = { $in: String(q.ids).split(',').map((x) => new ObjectId(x)) };
  if (q.leadId) f.leadId = new ObjectId(String(q.leadId));
  if (q.from || q.to) f.createdAt = { ...(q.from ? { $gte: new Date(q.from) } : {}), ...(q.to ? { $lte: new Date(q.to) } : {}) };
  if (q.search) {
    const re = new RegExp(escapeRegex(String(q.search).trim().slice(0, 80)), 'i');
    const digits = String(q.search).replace(/\D/g, '');
    const or = [{ 'caller.name': re }, { 'summary.text': re }, { 'handling.agentName': re }];
    if (digits.length >= 3) or.push({ 'caller.e164': new RegExp(escapeRegex(digits)) });
    f.$and = [...(f.$and || []), { $or: or }];
  }
  return f;
}

const LIST_FIELDS = 'internalCallId callWaiting work.status work.source work.updatedAt caller match leadId leadCreated status aiStatus audioStatus handling answeredBy outcome simSlot simLabel deviceId deviceName durationSeconds ringSeconds detectedAt answeredAt endedAt intents qualification.result callback.requested handoff.requested assignedTo createdAt createdBy';

export function presentRow(c, leads = new Map()) {
  return {
    id: String(c._id),
    callId: c.internalCallId,
    caller: { name: c.caller?.name || leads.get(String(c.leadId))?.name || null, number: c.caller?.e164 || c.caller?.raw || null, presentation: c.caller?.presentation },
    callerType: c.caller?.presentation !== 'available' ? 'private' : c.match?.status,
    lead: c.leadId ? { id: String(c.leadId), name: leads.get(String(c.leadId))?.name || null, number: leads.get(String(c.leadId))?.leadNumber || null, created: Boolean(c.leadCreated) } : null,
    status: c.status, aiStatus: c.aiStatus, audioStatus: c.audioStatus,
    handling: c.handling?.mode || null, answeredBy: c.answeredBy, outcome: c.outcome,
    agent: c.handling?.agentId ? { id: String(c.handling.agentId), name: c.handling.agentName } : null,
    rule: c.handling?.ruleName || null, aiBlockedBy: c.handling?.aiBlockedBy || null,
    // Arrived while the phone was in another call (kept after release: it is how the call arrived).
    callWaiting: c.handling?.aiBlockedBy === 'call_waiting' || c.handling?.reason === 'call_waiting' || Boolean(c.callWaiting),
    sim: { slot: c.simSlot, label: c.simLabel }, device: c.deviceId ? { id: String(c.deviceId), name: c.deviceName } : null,
    durationSeconds: c.durationSeconds || 0, ringSeconds: c.ringSeconds,
    primaryInquiry: c.intents?.primary || null,
    workStatus: c.work?.status || null, workSource: c.work?.source || null, workUpdatedAt: c.work?.updatedAt || null,
    assignedTo: c.assignedTo ? String(c.assignedTo) : null,
    qualification: c.qualification?.result || null,
    callbackRequested: Boolean(c.callback?.requested), humanRequested: Boolean(c.handoff?.requested),
    detectedAt: c.detectedAt, answeredAt: c.answeredAt, endedAt: c.endedAt,
  };
}

async function leadsFor(rows) {
  const ids = [...new Set(rows.map((r) => r.leadId).filter(Boolean).map(String))];
  if (!ids.length) return new Map();
  const leads = await Lead.find({ _id: { $in: ids } }).select('name leadNumber status').lean();
  return new Map(leads.map((l) => [String(l._id), l]));
}

const STATS_GROUP = {
  _id: null,
  total: { $sum: 1 },
  ai: { $sum: { $cond: [{ $eq: ['$answeredBy', 'ai'] }, 1, 0] } },
  human: { $sum: { $cond: [{ $eq: ['$answeredBy', 'human'] }, 1, 0] } },
  missed: { $sum: { $cond: [{ $eq: ['$status', 'MISSED'] }, 1, 0] } },
  rejected: { $sum: { $cond: [{ $eq: ['$status', 'REJECTED'] }, 1, 0] } },
  completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } },
  failed: { $sum: { $cond: [{ $in: ['$status', ['FAILED', 'INTERRUPTED']] }, 1, 0] } },
  active: { $sum: { $cond: [{ $in: ['$status', [...ACTIVE_STATUSES]] }, 1, 0] } },
  newLeads: { $sum: { $cond: ['$leadCreated', 1, 0] } },
  existing: { $sum: { $cond: [{ $eq: ['$match.status', 'existing'] }, 1, 0] } },
  qualified: { $sum: { $cond: [{ $eq: ['$qualification.result', 'QUALIFIED'] }, 1, 0] } },
  callbacks: { $sum: { $cond: ['$callback.requested', 1, 0] } },
  escalations: { $sum: { $cond: ['$handoff.requested', 1, 0] } },
  answeredDuration: { $sum: { $cond: [{ $gt: ['$durationSeconds', 0] }, '$durationSeconds', 0] } },
  answeredCount: { $sum: { $cond: [{ $gt: ['$durationSeconds', 0] }, 1, 0] } },
  aiAttempted: { $sum: { $cond: [{ $eq: ['$handling.mode', 'ai'] }, 1, 0] } },
  aiSucceeded: { $sum: { $cond: [{ $and: [{ $eq: ['$answeredBy', 'ai'] }, { $eq: ['$status', 'COMPLETED'] }] }, 1, 0] } },
  aiFailed: { $sum: { $cond: [{ $and: [{ $eq: ['$handling.mode', 'ai'] }, { $or: [{ $in: ['$status', ['FAILED', 'INTERRUPTED']] }, { $eq: ['$aiStatus', 'unavailable'] }] }] }, 1, 0] } },
};

function presentStats(agg) {
  const s = agg || {};
  const rate = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null);
  return {
    total: s.total || 0, answeredByAi: s.ai || 0, answeredByHuman: s.human || 0, missed: s.missed || 0, rejected: s.rejected || 0,
    completed: s.completed || 0, failed: s.failed || 0, active: s.active || 0, newLeads: s.newLeads || 0, existingLeads: s.existing || 0,
    qualified: s.qualified || 0, callbacks: s.callbacks || 0, escalations: s.escalations || 0,
    averageDurationSeconds: s.answeredCount ? Math.round(s.answeredDuration / s.answeredCount) : null,
    aiSuccessRate: rate(s.aiSucceeded || 0, s.aiAttempted || 0),
    aiFailureRate: rate(s.aiFailed || 0, s.aiAttempted || 0),
    answerRate: rate((s.ai || 0) + (s.human || 0), s.total || 0),
    aiAnswerRate: rate(s.ai || 0, s.total || 0),
    missedRate: rate(s.missed || 0, s.total || 0),
    qualificationRate: rate(s.qualified || 0, s.ai || 0),
    callbackRate: rate(s.callbacks || 0, (s.ai || 0)),
    escalationRate: rate(s.escalations || 0, (s.ai || 0)),
  };
}

class InboundQueryService {
  async list(viewer, q = {}) {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 25));
    const filter = buildFilter(viewer, q);
    const [rows, total] = await Promise.all([
      InboundCall.find(filter).sort(SORTS[q.sort] || SORTS.newest).skip((page - 1) * limit).limit(limit).select(LIST_FIELDS).lean(),
      // Bounded count (filters such as isTest are not indexed); past the cap `total` is a lower bound.
      InboundCall.countDocuments(filter, { limit: LIST_COUNT_CAP }),
    ]);
    const leads = await leadsFor(rows);
    return { data: rows.map((r) => presentRow(r, leads)), pagination: { page, limit, total, pages: Math.ceil(total / limit), totalCapped: total >= LIST_COUNT_CAP } };
  }

  async live(viewer) {
    const rows = await InboundCall.find({ ...scopeOf(viewer), processedAt: null, status: { $in: [...ACTIVE_STATUSES] } })
      .sort({ createdAt: -1 }).limit(20).select(`${LIST_FIELDS} agentActivity gateway.audio gateway.command transcript fields questions language handoff.status handoff.reason handoff.requestedAt`).lean();
    const leads = await leadsFor(rows);
    return rows.map((r) => ({
      ...presentRow(r, leads),
      agentActivity: r.agentActivity, audio: r.gateway?.audio || null, pendingCommand: r.gateway?.command?.ackedAt ? null : r.gateway?.command?.kind || null,
      language: r.language?.current || null,
      handoff: r.handoff?.requested ? { status: r.handoff.status, reason: r.handoff.reason, requestedAt: r.handoff.requestedAt } : null,
      lastTurns: (r.transcript || []).slice(-6).map((t) => ({ role: t.role, text: t.text, at: t.at })),
      collected: (r.fields || []).filter((f) => !f.supersededAt).map((f) => ({ key: f.key, value: f.value, explicit: f.explicit })),
      questionCount: (r.questions || []).length,
    }));
  }

  async get(viewer, id) {
    if (!mongoose.isValidObjectId(id)) throw new NotFoundError('InboundCall', id);
    const c = await InboundCall.findOne({ _id: id, ...scopeOf(viewer) }).lean();
    if (!c) throw new NotFoundError('InboundCall', id);
    const leads = await leadsFor([c, ...(c.match?.leadIds || []).map((leadId) => ({ leadId }))]);
    const lead = c.leadId ? await Lead.findById(c.leadId).select('name leadNumber status email phone mobile source assignedTo address.city tags').lean() : null;
    const authorIds = [...new Set([...(c.notes || []).map((n) => String(n.by)), ...(c.work?.history || []).flatMap((h) => [String(h.by), String(h.assignedTo), String(h.assignedFrom)]), String(c.assignedTo)].filter((x) => mongoose.isValidObjectId(x)))];
    const authors = new Map((authorIds.length ? await User.find({ _id: { $in: authorIds } }).select('firstName lastName email').lean() : [])
      .map((u) => [String(u._id), [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || null]));
    const agentDoc = c.handling?.agentId ? await CallingAgent.findById(c.handling.agentId).select('inbound.closingQuestions').lean() : null;
    const closing = normalizeQuestions(agentDoc?.inbound?.closingQuestions || []);
    const closingLabel = new Map(closing.map((x) => [x.key, x.label]));
    const events = await InboundCallEvent.find({ inboundCallId: c._id }).sort({ occurredAt: 1 }).limit(200).select('source type occurredAt').lean();
    const fields = (c.fields || []);
    const transcript = c.transcript || [];
    // Q&A view: questions the AI asked (from saved fields), the caller's answers, the caller's
    // own questions with the AI's answers, and what is still missing.
    const aiQuestions = fields.filter((f) => !f.supersededAt && f.askedQuestion).map((f) => ({ question: f.askedQuestion, answer: f.value, key: f.key, explicit: f.explicit, at: f.at }));
    const collectedKeys = new Set(fields.filter((f) => !f.supersededAt && f.verification !== 'rejected').map((f) => f.key));
    return {
      ...presentRow(c, leads),
      createdBy: String(c.createdBy),
      leadDetail: lead ? { id: String(lead._id), name: lead.name, number: lead.leadNumber, status: lead.status, email: lead.email, phone: lead.mobile || lead.phone, source: lead.source, city: lead.address?.city || null } : null,
      match: { status: c.match?.status, candidates: (c.match?.leadIds || []).map((lid) => ({ id: String(lid), name: leads.get(String(lid))?.name || null, number: leads.get(String(lid))?.leadNumber || null })) },
      handlingDetail: c.handling,
      language: c.language,
      transcript,
      events: [...(c.events || []), ...(c.transitions || []).map((t) => ({ type: `status:${t.to}`, at: t.at, detail: t.reason }))].sort((a, b) => new Date(a.at) - new Date(b.at)),
      transitions: c.transitions,
      eventLog: events,
      fields: fields.map((f) => ({ id: String(f._id), key: f.key, label: f.label || closingLabel.get(f.key) || CALLER_FIELDS.find((x) => x.key === f.key)?.label || f.key, value: f.value, explicit: f.explicit, confidence: f.confidence, verification: f.verification, evidence: f.evidence, superseded: Boolean(f.supersededAt), appliedToLead: f.appliedToLead, source: f.source, at: f.at })),
      qa: {
        aiQuestions,
        callerQuestions: (c.questions || []).map((q) => ({ id: String(q._id), text: q.text, category: q.category, categorySource: q.categorySource, answerStatus: q.answerStatus, answerSummary: q.answerSummary, at: q.at })),
        unanswered: (c.questions || []).filter((q) => q.answerStatus !== 'answered').map((q) => q.text),
        missingInformation: (c.qualification?.missing || []).filter((k) => !collectedKeys.has(k)),
        // Each configured closing question: answered (with the value), declined, or not asked.
        closingQuestions: closing.map((x) => {
          const f = fields.find((y) => y.key === x.key && !y.supersededAt && y.verification !== 'rejected');
          const declined = (c.declinedFields || []).some((d) => d.key === x.key);
          return { key: x.key, label: x.label, question: x.question, type: x.type, required: x.required, status: f ? 'answered' : declined ? 'declined' : 'not_asked', value: f ? f.value : null, explicit: f ? f.explicit : null };
        }),
      },
      intentsDetail: c.intents,
      summary: c.summary,
      qualificationDetail: c.qualification,
      recommendations: c.recommendations || [],
      followUpIds: (c.followUpIds || []).map(String),
      work: {
        status: c.work?.status || null, reason: c.work?.reason || null, source: c.work?.source || null, updatedAt: c.work?.updatedAt || null,
        updatedBy: c.work?.updatedBy ? { id: String(c.work.updatedBy), name: authors.get(String(c.work.updatedBy)) || null } : null,
        assignee: c.assignedTo ? { id: String(c.assignedTo), name: authors.get(String(c.assignedTo)) || null } : null,
        history: (c.work?.history || []).map((h) => ({
          from: h.from, to: h.to, source: h.source, reason: h.reason, note: h.note, at: h.at,
          by: h.by ? { id: String(h.by), name: authors.get(String(h.by)) || null } : null,
          assignedTo: h.assignedTo ? { id: String(h.assignedTo), name: authors.get(String(h.assignedTo)) || null } : null,
          assignedFrom: h.assignedFrom ? { id: String(h.assignedFrom), name: authors.get(String(h.assignedFrom)) || null } : null,
        })),
      },
      callback: c.callback,
      handoff: c.handoff,
      doNotContact: c.doNotContact,
      notes: (c.notes || []).map((n) => ({ id: String(n._id), text: n.text, by: n.by ? String(n.by) : null, byName: n.by ? authors.get(String(n.by)) || null : null, at: n.at })),
      audio: c.gateway?.audio || null,
      codec: c.gateway?.codec || null,
      pendingCommand: c.gateway?.command?.ackedAt ? null : c.gateway?.command?.kind || null,
      aiVoice: c.aiVoice, quality: c.quality,
      cost: pricedCost({ cost: c.cost, durationSeconds: c.durationSeconds, provider: c.isTest ? 'livekit_web' : 'paired_phone', isTest: c.isTest }),
      error: c.error?.code ? c.error : null,
      processedAt: c.processedAt,
      endReason: c.endReason,
      transcriptStats: { turns: transcript.length, callerTurns: transcript.filter((t) => t.role === 'caller').length },
    };
  }

  /** Overview cards. All counts from stored records in the window. */
  async stats(viewer, q = {}) {
    const [agg] = await InboundCall.aggregate([{ $match: buildFilter(viewer, q) }, { $group: STATS_GROUP }]);
    return presentStats(agg);
  }

  /**
   * Charts + the summary cards in ONE pass over the window ($facet), instead of eleven
   * aggregations re-reading the same calls. Only the fields the groups use are carried in.
   */
  async analytics(viewer, q = {}) {
    const match = buildFilter(viewer, q);
    const tz = q.tz || 'UTC';
    const group = (key) => [{ $group: { _id: key, count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 20 }];
    const [facets] = await InboundCall.aggregate([
      { $match: match },
      { $project: {
        _id: 0, createdAt: 1, answeredBy: 1, status: 1, aiStatus: 1, leadCreated: 1, outcome: 1, durationSeconds: 1, deviceId: 1, deviceName: 1, simSlot: 1,
        'match.status': 1, 'qualification.result': 1, 'callback.requested': 1, 'handoff.requested': 1, 'intents.primary': 1, 'language.current': 1,
        'handling.mode': 1, 'handling.agentId': 1, 'handling.agentName': 1,
        services: { $filter: { input: { $ifNull: ['$fields', []] }, as: 'f', cond: { $and: [
          { $eq: ['$$f.key', 'service_interest'] }, { $eq: [{ $ifNull: ['$$f.supersededAt', null] }, null] }, { $eq: ['$$f.explicit', true] },
        ] } } },
      } },
      { $facet: {
        summary: [{ $group: STATS_GROUP }],
        byDay: [{ $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: tz } },
          total: { $sum: 1 },
          ai: { $sum: { $cond: [{ $eq: ['$answeredBy', 'ai'] }, 1, 0] } },
          human: { $sum: { $cond: [{ $eq: ['$answeredBy', 'human'] }, 1, 0] } },
          missed: { $sum: { $cond: [{ $eq: ['$status', 'MISSED'] }, 1, 0] } },
          qualified: { $sum: { $cond: [{ $eq: ['$qualification.result', 'QUALIFIED'] }, 1, 0] } },
          newLeads: { $sum: { $cond: ['$leadCreated', 1, 0] } },
        } }, { $sort: { _id: 1 } }],
        byInquiry: group('$intents.primary'), byOutcome: group('$outcome'), byQualification: group('$qualification.result'),
        byDevice: [{ $group: { _id: { id: '$deviceId', name: '$deviceName' }, count: { $sum: 1 } } }, { $sort: { count: -1 } }],
        bySim: group('$simSlot'),
        byAgent: [{ $group: { _id: { id: '$handling.agentId', name: '$handling.agentName' }, count: { $sum: 1 }, ai: { $sum: { $cond: [{ $eq: ['$answeredBy', 'ai'] }, 1, 0] } } } }, { $sort: { count: -1 } }],
        byLanguage: group('$language.current'),
        byHour: [{ $group: { _id: { $hour: { date: '$createdAt', timezone: tz } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }],
        services: [{ $unwind: '$services' }, { $group: { _id: { $toLower: { $trim: { input: '$services.value' } } }, count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 10 }],
      } },
    ]);
    const { summary, byDay, byInquiry, byOutcome, byQualification, byDevice, bySim, byAgent, byLanguage, byHour, services } = facets;
    const rows = (list) => list.filter((r) => r._id !== null && r._id !== undefined).map((r) => ({ key: r._id, count: r.count }));
    return {
      summary: presentStats(summary[0]),
      series: byDay.map((d) => ({ date: d._id, total: d.total, ai: d.ai, human: d.human, missed: d.missed, qualified: d.qualified, newLeads: d.newLeads })),
      byInquiry: rows(byInquiry), byOutcome: rows(byOutcome), byQualification: rows(byQualification),
      byDevice: byDevice.filter((r) => r._id?.id).map((r) => ({ key: String(r._id.id), label: r._id.name, count: r.count })),
      bySim: rows(bySim).map((r) => ({ ...r, label: `SIM ${Number(r.key) + 1}` })),
      byAgent: byAgent.filter((r) => r._id?.id).map((r) => ({ key: String(r._id.id), label: r._id.name, count: r.count, answered: r.ai })),
      byLanguage: rows(byLanguage), byHour: rows(byHour), topServices: rows(services),
    };
  }

  async exportCsv(viewer, q = {}) {
    const rows = await InboundCall.find(buildFilter(viewer, q)).sort({ createdAt: -1 }).limit(5000).select(`${LIST_FIELDS} summary.text fields`).lean();
    const leads = await leadsFor(rows);
    const headers = ['date', 'caller_name', 'caller_number', 'caller_type', 'lead_number', 'lead_name', 'status', 'outcome', 'answered_by', 'agent', 'device', 'sim', 'duration_seconds',
      'primary_inquiry', 'qualification', 'callback_requested', 'human_requested', 'summary', ...CALLER_FIELD_KEYS.map((k) => `field_${k}`)];
    const data = rows.map((c) => {
      const p = presentRow(c, leads);
      const f = Object.fromEntries((c.fields || []).filter((x) => !x.supersededAt).map((x) => [`field_${x.key}`, x.explicit ? x.value : `${x.value} (inferred)`]));
      return {
        date: c.createdAt, caller_name: p.caller.name, caller_number: p.caller.number, caller_type: p.callerType, lead_number: p.lead?.number, lead_name: p.lead?.name,
        status: c.status, outcome: c.outcome, answered_by: c.answeredBy, agent: c.handling?.agentName, device: c.deviceName, sim: c.simSlot != null ? `SIM ${c.simSlot + 1}` : '',
        duration_seconds: c.durationSeconds, primary_inquiry: c.intents?.primary, qualification: c.qualification?.result, callback_requested: Boolean(c.callback?.requested),
        human_requested: Boolean(c.handoff?.requested), summary: c.summary?.text, ...f,
      };
    });
    return `${String.fromCharCode(0xfeff)}${toCsv(headers, data)}`;
  }

  // ---------------------------------------------------------------- owner actions

  async _mine(viewer, id) {
    if (!mongoose.isValidObjectId(id)) throw new NotFoundError('InboundCall', id);
    const c = await InboundCall.findOne({ _id: id, ...scopeOf(viewer) });
    if (!c) throw new NotFoundError('InboundCall', id);
    return c;
  }

  async addNote(viewer, id, text) {
    const c = await this._mine(viewer, id);
    await InboundCall.updateOne({ _id: c._id }, { $push: { notes: { $each: [{ text: String(text).slice(0, 2000), by: viewer.id, at: new Date() }], $slice: -200 } } });
    return this.get(viewer, id);
  }

  /** A person verifies, corrects or rejects a value the agent saved. Never silently. */
  async reviewField(viewer, id, fieldId, { action, value = null }) {
    const c = await this._mine(viewer, id);
    const field = (c.fields || []).find((f) => String(f._id) === String(fieldId) && !f.supersededAt);
    if (!field) throw new NotFoundError('Field', fieldId);
    const now = new Date();
    if (action === 'confirm') {
      await InboundCall.updateOne({ _id: c._id, 'fields._id': field._id }, { $set: { 'fields.$.verification': 'confirmed', 'fields.$.explicit': true } });
    } else if (action === 'reject') {
      await InboundCall.updateOne({ _id: c._id, 'fields._id': field._id }, { $set: { 'fields.$.verification': 'rejected' } });
    } else if (action === 'correct') {
      if (!String(value || '').trim()) throw new ValidationError('A corrected value is required');
      await InboundCall.updateOne({ _id: c._id, 'fields._id': field._id }, { $set: { 'fields.$.supersededAt': now } });
      await InboundCall.updateOne({ _id: c._id }, { $push: { fields: { key: field.key, value: String(value).trim().slice(0, 1000), explicit: true, verification: 'corrected', source: 'user_correction', evidence: `Corrected by a user from "${field.value}"`, at: now } } });
    } else throw new ValidationError('Unknown review action');
    return this.get(viewer, id);
  }

  /** Link an ambiguous (or unlinked) call to one of the candidate leads — never merges leads. */
  async resolveMatch(viewer, id, leadId) {
    const c = await this._mine(viewer, id);
    if (!mongoose.isValidObjectId(leadId) || !await Lead.exists({ _id: leadId, isDeleted: { $ne: true } })) throw new ValidationError('Choose an existing lead');
    if (c.match?.status === 'ambiguous' && !(c.match.leadIds || []).map(String).includes(String(leadId))) throw new ValidationError('Choose one of the matching leads');
    await InboundCall.updateOne({ _id: c._id }, { $set: { leadId, 'match.status': 'existing', 'match.resolvedBy': viewer.id, 'match.resolvedAt': new Date(), 'recommendations.$[r].status': 'executed', 'recommendations.$[r].decidedBy': viewer.id, 'recommendations.$[r].decidedAt': new Date() } }, { arrayFilters: [{ 'r.id': 'REVIEW_CALLER_MATCH' }] });
    return this.get(viewer, id);
  }

  async decideRecommendation(viewer, id, recId, { decision, dueAt = null, note = null, leadId = null, createLead = false }) {
    const c = await this._mine(viewer, id);
    const rec = (c.recommendations || []).find((r) => r.id === recId);
    if (!rec) throw new NotFoundError('Recommendation', recId);
    if (rec.status !== 'pending') throw new ConflictError('This recommendation was already handled');
    if (decision === 'dismiss') {
      await InboundCall.updateOne({ _id: c._id, 'recommendations.id': recId }, { $set: { 'recommendations.$.status': 'dismissed', 'recommendations.$.decidedBy': viewer.id, 'recommendations.$.decidedAt': new Date() } });
    } else if (rec.action === 'REVIEW_CALLER_MATCH') {
      // "Execute" on a match review = link the chosen lead (or create one when none of them is right).
      await this._ensureCallLead(viewer, c, { leadId, createLead, required: true });
      await InboundCall.updateOne({ _id: c._id, 'recommendations.id': recId }, { $set: { 'recommendations.$.status': 'executed', 'recommendations.$.decidedBy': viewer.id, 'recommendations.$.decidedAt': new Date() } });
    } else {
      const call = await this._ensureCallLead(viewer, c, { leadId, createLead, required: true });
      await inboundService._followUpFor(call.toObject(), rec.action, { by: viewer.id, dueAt, note });
      await this._followUpWorkStatus(viewer, call);
    }
    return this.get(viewer, id);
  }

  /**
   * Make sure the call has a lead before a follow-up: keep the linked one, link the lead the user
   * picked, or create one on request (also when the number matched several leads that are not this
   * caller). Without any of these, explain what is needed.
   */
  async _ensureCallLead(viewer, c, { leadId = null, createLead = false, required = false } = {}) {
    if (c.leadId && !leadId) return c;
    if (leadId) {
      await this.resolveMatch(viewer, String(c._id), leadId);
    } else if (createLead) {
      await this.createLead(viewer, String(c._id), { force: true });
    } else if (required) {
      throw new ConflictError(c.match?.status === 'ambiguous'
        ? 'This number matches several leads: choose the right lead or create a new one for this caller'
        : 'Link or create a lead for this caller before scheduling a follow-up');
    }
    return InboundCall.findById(c._id);
  }

  /** Scheduling a follow-up moves an open call to "follow-up scheduled" (a person's action). */
  async _followUpWorkStatus(viewer, call) {
    if (!['new', 'in_progress', null, undefined].includes(call.work?.status)) return;
    await this.updateWork(viewer, String(call._id), { status: 'follow_up', note: null, reason: 'follow_up_scheduled' });
  }

  /** A person reviews the call: change its work status and/or who works it. Always recorded. */
  async updateWork(viewer, id, { status = undefined, assignedTo = undefined, note = null, reason = null }) {
    const c = await this._mine(viewer, id);
    if (status !== undefined && !WORK_STATUSES.includes(status)) throw new ValidationError('Unknown status');
    let assignee = c.assignedTo || null;
    if (assignedTo !== undefined) {
      if (assignedTo && !await User.exists({ _id: assignedTo, isDeleted: { $ne: true } })) throw new ValidationError('Choose an active user');
      assignee = assignedTo || null;
    }
    const changedStatus = status !== undefined && status !== c.work?.status;
    const changedAssignee = String(assignee || '') !== String(c.assignedTo || '');
    if (!changedStatus && !changedAssignee && !note) return this.get(viewer, id);
    const now = new Date();
    await InboundCall.updateOne({ _id: c._id }, {
      $set: {
        ...(changedStatus ? { 'work.status': status, 'work.reason': reason || 'set_by_user' } : {}),
        ...(changedAssignee ? { assignedTo: assignee } : {}),
        'work.updatedAt': now, 'work.updatedBy': viewer.id, 'work.source': 'user',
      },
      $push: { 'work.history': { $each: [{
        from: c.work?.status || null, to: changedStatus ? status : c.work?.status || null,
        assignedFrom: changedAssignee ? c.assignedTo || null : null, assignedTo: changedAssignee ? assignee : null,
        by: viewer.id, source: 'user', note: note ? String(note).slice(0, 1000) : null, reason: reason || (changedStatus ? 'set_by_user' : changedAssignee ? 'reassigned' : 'note'), at: now,
      }], $slice: -100 } },
    });
    if (changedAssignee && assignee && String(assignee) !== String(viewer.id)) {
      inboundService._notify(assignee, 'inbound_calls.assigned', 'NORMAL', 'Incoming call assigned to you',
        `${c.caller?.name || c.caller?.e164 || 'A caller'} was assigned to you${note ? `: ${String(note).slice(0, 200)}` : ''}.`, c, `inbound-assigned-${c._id}-${assignee}-${now.getTime()}`);
    }
    try { global.io?.to(`user:${c.createdBy}`).emit('inbound-call:update', { id: String(c._id), callId: c.internalCallId, event: 'work', status: c.status, workStatus: changedStatus ? status : c.work?.status || null }); } catch { /* best effort */ }
    return this.get(viewer, id);
  }

  async scheduleFollowUp(viewer, id, { dueAt, note = null, action = 'ARRANGE_CALLBACK', leadId = null, createLead = false }) {
    const c = await this._ensureCallLead(viewer, await this._mine(viewer, id), { leadId, createLead, required: true });
    const fu = await inboundService._followUpFor(c.toObject(), action, { by: viewer.id, dueAt, note });
    await this._followUpWorkStatus(viewer, c);
    return { followUpId: String(fu._id), call: await this.get(viewer, id) };
  }

  /** Create the lead by hand (e.g. a missed call from a new number) — same rules as automatic. */
  async createLead(viewer, id, { force = false } = {}) {
    const c = await this._mine(viewer, id);
    if (c.leadId) throw new ConflictError('This call is already linked to a lead');
    if (c.match?.status === 'ambiguous' && !force) throw new ConflictError('The number matches several leads; link one of them, or confirm that none of them is this caller to create a new lead');
    if (!c.caller?.e164) throw new ConflictError('The caller withheld their number');
    const settings = await inboundService.getSettings(c.createdBy);
    await inboundService._ensureLead(c._id, { ...settings, leadCreation: 'all_identified' }, 'manual', { force });
    if (force) await InboundCall.updateOne({ _id: c._id, leadId: { $ne: null } }, { $set: { 'match.status': 'existing', 'match.resolvedBy': viewer.id, 'match.resolvedAt': new Date(), 'recommendations.$[r].status': 'executed', 'recommendations.$[r].decidedBy': viewer.id, 'recommendations.$[r].decidedAt': new Date() } }, { arrayFilters: [{ 'r.id': 'REVIEW_CALLER_MATCH' }] });
    const fresh = await InboundCall.findById(c._id);
    if (fresh.leadId) await inboundService._applyToLead(fresh, settings, fresh.qualification?.result ? fresh.qualification : null);
    return this.get(viewer, id);
  }

  /** Connected phones + their incoming-call readiness and agent assignment. */
  async devices(viewer) {
    const owner = new ObjectId(String(viewer.id));
    const [devices, settings, agents] = await Promise.all([
      PairedDevice.find({ createdBy: owner, deletedAt: null, revokedAt: null }).select('-tokenHash -dialKey.enc').lean(),
      inboundService.getSettings(owner),
      CallingAgent.find({ createdBy: owner, availability: { $ne: 'archived' } }).select('name availability').lean(),
    ]);
    const agentName = new Map(agents.map((a) => [String(a._id), a]));
    const since = new Date(Date.now() - 24 * 3_600_000);
    const counts = await InboundCall.aggregate([{ $match: { createdBy: owner, createdAt: { $gte: since } } }, { $group: { _id: '$deviceId', calls: { $sum: 1 }, ai: { $sum: { $cond: [{ $eq: ['$answeredBy', 'ai'] }, 1, 0] } } } }]);
    const byDevice = new Map(counts.map((c) => [String(c._id), c]));
    return devices.map((d) => {
      const r = deviceReadiness(d, { now: new Date(), callsLastHour: 0, callsToday: 0 });
      const rows = (settings.deviceAgents || []).filter((x) => String(x.deviceId) === String(d._id));
      const assigned = rows.find((x) => x.simSlot == null) || rows[0];
      const agentId = assigned?.agentId || settings.defaultAgentId || null;
      const agent = agentId ? agentName.get(String(agentId)) : null;
      const reasons = [];
      if (!settings.enabled) reasons.push('ai_answering_off');
      if (assigned && assigned.aiEnabled === false) reasons.push('ai_disabled_for_device');
      if (!agent) reasons.push('no_agent');
      else if (agent.availability !== 'active') reasons.push('agent_not_active');
      if (!d.audioVerifiedAt) reasons.push('audio_not_verified');
      if (d.board?.canAnswer !== true) reasons.push('firmware_no_answer');
      if (!r.online) reasons.push('gateway_offline');
      if (!d.board?.connected) reasons.push('board_disconnected');
      if (d.state?.hfp !== 'slc') reasons.push('phone_not_connected');
      return {
        id: String(d._id), name: d.name, phoneLabel: d.phoneLabel, online: r.online, lastHeartbeatAt: d.lastHeartbeatAt,
        bluetooth: d.state?.hfp || 'disconnected', boardConnected: Boolean(d.board?.connected), signal: d.state?.signal, battery: d.state?.battery,
        inCall: Boolean(d.state?.call || d.state?.callsetup), audioVerified: Boolean(d.audioVerifiedAt), firmware: d.board?.firmware || null,
        gatewayVersion: d.gateway?.version || null,
        agent: agent ? { id: String(agentId), name: agent.name, availability: agent.availability } : null,
        sims: (d.sims || []).map((x) => ({ slot: x.slot, label: x.label || '', carrier: x.carrier || '' })).sort((x, y) => x.slot - y.slot),
        simsReportedAt: d.simsReportedAt || null,
        simAgents: rows.map((x) => ({ simSlot: x.simSlot, agentId: x.agentId ? String(x.agentId) : null, aiEnabled: x.aiEnabled !== false })),
        aiAnswering: { ready: reasons.length === 0, reasons },
        last24h: { calls: byDevice.get(String(d._id))?.calls || 0, answeredByAi: byDevice.get(String(d._id))?.ai || 0 },
      };
    });
  }

  /** Incoming calls for a lead's timeline / profile. */
  async forLead(viewer, leadId, limit = 20) {
    const rows = await InboundCall.find({ leadId, ...scopeOf(viewer) }).sort({ createdAt: -1 }).limit(limit).select(LIST_FIELDS).lean();
    const leads = await leadsFor(rows);
    return rows.map((r) => presentRow(r, leads));
  }

  terminal(status) { return TERMINAL_STATUSES.has(status); }
}

export default new InboundQueryService();
