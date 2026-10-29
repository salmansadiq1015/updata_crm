import mongoose from 'mongoose';
import Lead from './lead.model.js';
import LeadCommunication from './leadCommunication.model.js';
import ContactLogEntry from './contactLog.model.js';
import LeadFollowUp from './leadFollowUp.model.js';
import LeadEvent from './leadEvent.model.js';
import CallRecord from '../aiCalling/callRecord.model.js';
import SimSmsMessage from '../simSms/simSmsMessage.model.js';
import SimCallEvent from '../simCall/simCallEvent.model.js';
import MessageRecipient from '../messaging/messageRecipient.model.js';
// Registered for populate('campaignId') on call records / provider messages.
import '../aiCalling/callCampaign.model.js';
import '../messaging/campaign.model.js';
import { AuthorizationError, NotFoundError, ValidationError } from '../../shared/errors/AppError.js';
import { QUALIFICATION_FIELD_BY_KEY } from './leadQualification.constants.js';

/**
 * Unified conversation history for one lead: every recorded exchange and
 * workflow event across channels, merged newest-first with a stable cursor.
 *
 * Sources: mobile/SIM communications, contact-log entries (e-mail, WhatsApp,
 * phone, notes), AI call records (with a transcript excerpt), SIM SMS agent
 * messages, SIM call campaign events, provider messaging (e-mail / SMS /
 * WhatsApp campaigns), qualification answer changes, follow-ups and
 * assignment/SLA events. Records of leads merged INTO this lead
 * (lead.mergedLeadIds) are included, flagged with `mergedFrom`.
 *
 * Ordering is a total order on (at desc, id desc) where id = "<type>:<hex>",
 * so pages never skip or repeat even when timestamps tie across sources. Each
 * source is queried with limit+1 after the cursor; the merged top `limit` is
 * therefore exact.
 *
 * AI call transcripts follow the AI-calling module's privacy rule (calls are
 * owner-scoped): the transcript excerpt is only returned to the call's owner or
 * an AI-calling admin; others see the call outcome and "restricted".
 */

export const TIMELINE_TYPES = Object.freeze([
  'communication', 'contact_log', 'ai_call', 'sms_message', 'sim_call_event',
  'provider_message', 'qualification', 'follow_up', 'workflow',
]);
export const TIMELINE_CHANNELS = Object.freeze(['phone', 'sms', 'email', 'whatsapp', 'other']);

const TRANSCRIPT_EXCERPT_TURNS = 6;
const SIM_CALL_EVENT_TYPES = [
  'task.dialed', 'task.completed', 'task.skipped', 'task.ineligible',
  'task.callback_rescheduled', 'task.callback_cancelled', 'task.callback_due',
];
const SIM_SMS_VISIBLE = ['attempting', 'sent', 'received', 'failed', 'unknown'];
const { ObjectId } = mongoose.Types;

const iso = (d) => (d ? new Date(d).toISOString() : null);
const str = (v) => (v ? String(v._id ?? v) : null);
const clip = (text, max = 600) => {
  if (typeof text !== 'string') return null;
  const t = text.trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};
const channelBucket = (c) => (['phone', 'sms', 'email', 'whatsapp'].includes(c) ? c : 'other');

export function encodeTimelineCursor(entry) {
  return Buffer.from(JSON.stringify({ at: entry.at, id: entry.id })).toString('base64url');
}

export function decodeTimelineCursor(cursor) {
  if (!cursor) return null;
  try {
    const c = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    const [type, hex] = String(c.id || '').split(':');
    if (!TIMELINE_TYPES.includes(type) || !/^[0-9a-f]{24}$/i.test(hex) || Number.isNaN(Date.parse(c.at))) throw new Error('bad');
    return { at: new Date(c.at), atMs: Date.parse(c.at), id: `${type}:${hex.toLowerCase()}`, type, oid: new ObjectId(hex) };
  } catch {
    throw new ValidationError('Invalid cursor', [{ field: 'cursor', message: 'cursor is malformed' }]);
  }
}

/** Sort comparator: newest first, ties by id descending. */
export function compareEntries(a, b) {
  const d = Date.parse(b.at) - Date.parse(a.at);
  if (d !== 0) return d;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** True when `entry` sorts strictly after the cursor position. */
const afterCursor = (entry, cursor) => !cursor || compareEntries({ at: cursor.at.toISOString(), id: cursor.id }, entry) < 0;

/**
 * Mongo condition for "after the cursor" in one source of type `type` sorted
 * by (field desc, _id desc). Ties on the timestamp are resolved by the entry
 * id, whose prefix is the type, exactly like compareEntries.
 */
function cursorCondition(cursor, type, field) {
  if (!cursor) return {};
  if (type === cursor.type) return { $or: [{ [field]: { $lt: cursor.at } }, { [field]: cursor.at, _id: { $lt: cursor.oid } }] };
  // Same timestamp, different type: ids compare by type first.
  return type > cursor.type ? { [field]: { $lt: cursor.at } } : { [field]: { $lte: cursor.at } };
}

class LeadTimelineService {
  async _leadScope(leadId) {
    const lead = await Lead.findById(leadId).select('_id name mergedLeadIds').lean();
    if (!lead) throw new NotFoundError('Lead', leadId);
    const merged = (lead.mergedLeadIds || []).map((id) => new ObjectId(String(id)));
    return { lead, leadIds: [lead._id, ...merged], mergedSet: new Set(merged.map(String)) };
  }

  /**
   * GET /crm/leads/:leadId/timeline
   * @param {{ cursor?, limit?, types?: string[], channel?: string }} query
   * @param {{ id, canSeeAllTranscripts: boolean }} viewer
   */
  async list(leadId, { cursor = null, limit = 25, types = null, channel = null } = {}, viewer) {
    const { leadIds, mergedSet } = await this._leadScope(leadId);
    const c = decodeTimelineCursor(cursor);
    const want = new Set(types?.length ? types : TIMELINE_TYPES);
    const ctx = { leadIds, mergedSet, cursor: c, limit: limit + 1, channel, viewer };

    const jobs = [];
    const add = (type, fn) => { if (want.has(type)) jobs.push(fn.call(this, ctx)); };
    add('communication', this._communications);
    add('contact_log', this._contactLogs);
    add('ai_call', this._aiCalls);
    add('sms_message', this._smsMessages);
    add('sim_call_event', this._simCallEvents);
    add('provider_message', this._providerMessages);
    add('qualification', this._qualification);
    add('follow_up', this._followUps);
    add('workflow', this._workflowEvents);

    const merged = (await Promise.all(jobs)).flat()
      .filter((e) => (!channel || e.channel === channel) && afterCursor(e, c))
      .sort(compareEntries);
    const page = merged.slice(0, limit);
    await this._attachActors(page);
    const hasNext = merged.length > limit;
    return {
      data: page,
      pagination: { limit, hasNext, nextCursor: hasNext ? encodeTimelineCursor(page[page.length - 1]) : null },
    };
  }

  _skip(ctx, channels) {
    return ctx.channel && !channels.includes(ctx.channel);
  }

  _base(ctx, type, doc, at, extra) {
    const leadId = str(doc.leadId);
    return {
      id: `${type}:${String(doc._id)}`,
      type,
      at: iso(at),
      leadId,
      mergedFrom: ctx.mergedSet.has(leadId) ? leadId : null,
      actor: null,
      actorId: null,
      ...extra,
    };
  }

  async _communications(ctx) {
    if (this._skip(ctx, ['phone', 'sms'])) return [];
    const filter = { leadId: { $in: ctx.leadIds }, ...(ctx.channel ? { channel: ctx.channel } : {}), ...cursorCondition(ctx.cursor, 'communication', 'createdAt') };
    const docs = await LeadCommunication.find(filter).sort({ createdAt: -1, _id: -1 }).limit(ctx.limit)
      .select('leadId createdBy channel direction route mode state outcome sms qualification.answers contactLogId createdAt completedAt destinationMasked observed').lean();
    return docs.map((d) => this._base(ctx, 'communication', d, d.createdAt, {
      channel: d.channel,
      direction: d.direction || 'outbound',
      title: d.route,
      status: d.outcome?.disposition ?? d.state,
      summary: clip(d.outcome?.notes),
      body: d.sms?.body ? clip(d.sms.body, 1600) : null,
      actorId: str(d.createdBy),
      links: { communicationId: String(d._id), contactLogId: str(d.contactLogId) },
      meta: {
        route: d.route, mode: d.mode, state: d.state,
        disposition: d.outcome?.disposition ?? null,
        connected: d.outcome?.connected ?? null,
        doNotContact: Boolean(d.outcome?.doNotContact),
        followUpAt: iso(d.outcome?.followUpAt),
        followUpTimezone: d.outcome?.followUpTimezone ?? null,
        smsSendStatus: d.sms?.sendStatus ?? null,
        destinationMasked: d.destinationMasked ?? null,
        offhookDurationSec: d.observed?.offhookDurationSec ?? null,
        evidence: d.observed?.evidence ?? 'none',
        answerCount: d.qualification?.answers?.length ?? 0,
      },
    }));
  }

  async _contactLogs(ctx) {
    // Entries written by a mobile/SIM communication are shown through that
    // communication; excluding them avoids listing the same exchange twice.
    const linked = await LeadCommunication.distinct('contactLogId', { leadId: { $in: ctx.leadIds }, contactLogId: { $ne: null } });
    const filter = {
      leadId: { $in: ctx.leadIds },
      _id: { $nin: linked },
      ...cursorCondition(ctx.cursor, 'contact_log', 'occurredAt'),
    };
    if (ctx.channel) filter.channel = ctx.channel === 'other' ? { $nin: ['phone', 'sms', 'email', 'whatsapp'] } : ctx.channel;
    const docs = await ContactLogEntry.find(filter).sort({ occurredAt: -1, _id: -1 }).limit(ctx.limit)
      .select('leadId occurredAt employeeId createdBy channel channelLabel subject note agreements openPoints followUpAt').lean();
    return docs.map((d) => this._base(ctx, 'contact_log', d, d.occurredAt, {
      channel: channelBucket(d.channel),
      direction: null,
      title: d.subject || d.channelLabel || d.channel,
      status: null,
      summary: clip(d.note, 300),
      body: clip([d.note, d.agreements && `Agreements: ${d.agreements}`, d.openPoints && `Open points: ${d.openPoints}`].filter(Boolean).join('\n\n'), 5000),
      actorId: str(d.employeeId || d.createdBy),
      links: { contactLogId: String(d._id) },
      meta: { rawChannel: d.channel, channelLabel: d.channelLabel ?? null, followUpAt: iso(d.followUpAt) },
    }));
  }

  async _aiCalls(ctx) {
    if (this._skip(ctx, ['phone'])) return [];
    const filter = { leadId: { $in: ctx.leadIds }, isTest: { $ne: true }, ...cursorCondition(ctx.cursor, 'ai_call', 'createdAt') };
    const docs = await CallRecord.find(filter).sort({ createdAt: -1, _id: -1 }).limit(ctx.limit)
      .select('leadId campaignId createdBy provider state disposition qualification createdAt initiatedAt answeredAt endedAt durationSeconds callNotes transcript transcriptExpiresAt reviewRequired answers.questionFieldKey answers.label answers.validation answers.confirmed')
      .populate('campaignId', 'name').lean();
    const now = new Date();
    return docs.map((d) => {
      const mayRead = ctx.viewer.canSeeAllTranscripts || String(d.createdBy) === String(ctx.viewer.id);
      const expired = d.transcriptExpiresAt && new Date(d.transcriptExpiresAt) <= now;
      const turns = expired ? [] : (d.transcript || []);
      return this._base(ctx, 'ai_call', d, d.createdAt, {
        channel: 'phone',
        direction: 'outbound',
        title: d.campaignId?.name || 'AI call',
        status: d.disposition || d.state,
        summary: clip(d.callNotes?.summary, 600),
        body: null,
        actorId: str(d.createdBy),
        links: { callRecordId: String(d._id), campaignId: str(d.campaignId) },
        transcript: {
          available: turns.length > 0,
          expired: Boolean(expired),
          restricted: !mayRead && turns.length > 0,
          turnCount: turns.length,
          excerpt: mayRead ? turns.slice(0, TRANSCRIPT_EXCERPT_TURNS).map((t, index) => ({ index, role: t.role, text: clip(t.text, 500), at: iso(t.at) })) : [],
        },
        meta: {
          provider: d.provider ?? null,
          state: d.state,
          disposition: d.disposition ?? null,
          qualification: d.qualification ?? null,
          durationSeconds: d.answeredAt || d.durationSeconds ? d.durationSeconds : null,
          reviewRequired: Boolean(d.reviewRequired),
          answers: (d.answers || []).map((a) => ({ fieldKey: a.questionFieldKey, label: a.label, validation: a.validation, confirmed: a.confirmed })),
        },
      });
    });
  }

  async _smsMessages(ctx) {
    if (this._skip(ctx, ['sms'])) return [];
    const filter = { leadId: { $in: ctx.leadIds }, status: { $in: SIM_SMS_VISIBLE }, ...cursorCondition(ctx.cursor, 'sms_message', 'createdAt') };
    const docs = await SimSmsMessage.find(filter).sort({ createdAt: -1, _id: -1 }).limit(ctx.limit)
      .select('leadId conversationId campaignId createdBy direction kind body status questionFieldKey sentAt deliveredAt receivedAt failureCode createdAt').lean();
    return docs.map((d) => this._base(ctx, 'sms_message', d, d.createdAt, {
      channel: 'sms',
      direction: d.direction,
      title: d.direction === 'inbound' ? 'SMS reply' : `AI SMS (${d.kind})`,
      status: d.status,
      summary: clip(d.body, 300),
      body: clip(d.body, 1600),
      actorId: d.direction === 'outbound' ? str(d.createdBy) : null,
      links: { smsMessageId: String(d._id), conversationId: str(d.conversationId), campaignId: str(d.campaignId) },
      meta: {
        kind: d.kind, questionFieldKey: d.questionFieldKey ?? null,
        sentAt: iso(d.sentAt), deliveredAt: iso(d.deliveredAt), receivedAt: iso(d.receivedAt), failureCode: d.failureCode ?? null,
      },
    }));
  }

  async _simCallEvents(ctx) {
    if (this._skip(ctx, ['phone'])) return [];
    const filter = { leadId: { $in: ctx.leadIds }, type: { $in: SIM_CALL_EVENT_TYPES }, ...cursorCondition(ctx.cursor, 'sim_call_event', 'at') };
    const docs = await SimCallEvent.find(filter).sort({ at: -1, _id: -1 }).limit(ctx.limit).lean();
    return docs.map((d) => this._base(ctx, 'sim_call_event', d, d.at, {
      channel: 'phone',
      direction: null,
      title: d.type,
      status: null,
      summary: null,
      body: null,
      actorId: str(d.actor),
      links: { campaignId: str(d.campaignId), taskId: str(d.taskId) },
      meta: { eventType: d.type, details: d.details ?? null },
    }));
  }

  async _providerMessages(ctx) {
    if (this._skip(ctx, ['sms', 'email', 'whatsapp'])) return [];
    const filter = {
      leadId: { $in: ctx.leadIds }, status: { $ne: 'draft' },
      ...(ctx.channel ? { channel: ctx.channel } : {}),
      ...cursorCondition(ctx.cursor, 'provider_message', 'createdAt'),
    };
    const docs = await MessageRecipient.find(filter).sort({ createdAt: -1, _id: -1 }).limit(ctx.limit)
      .select('leadId campaignId channel status rendered.subject rendered.bodyText provider sentAt deliveredAt readAt failedAt error createdBy createdAt')
      .populate('campaignId', 'name').lean();
    return docs.map((d) => this._base(ctx, 'provider_message', d, d.createdAt, {
      channel: d.channel,
      direction: 'outbound',
      title: d.rendered?.subject || d.campaignId?.name || `${d.channel} message`,
      status: d.status,
      summary: clip(d.rendered?.bodyText, 300),
      body: clip(d.rendered?.bodyText, 5000),
      actorId: str(d.createdBy),
      links: { campaignId: str(d.campaignId), messageRecipientId: String(d._id) },
      meta: {
        provider: d.provider ?? null, campaignName: d.campaignId?.name ?? null,
        sentAt: iso(d.sentAt), deliveredAt: iso(d.deliveredAt), readAt: iso(d.readAt), failedAt: iso(d.failedAt),
        errorCode: d.error?.code ?? null,
      },
    }));
  }

  async _qualification(ctx) {
    if (ctx.channel) return [];
    const leads = await Lead.find({ _id: { $in: ctx.leadIds } })
      .setOptions({ includeDeleted: true })
      .select('_id +qualification.history').lean();
    const out = [];
    for (const lead of leads) {
      for (const h of lead.qualification?.history || []) {
        if (!h._id || !h.changedAt) continue;
        const entry = this._base(ctx, 'qualification', { _id: h._id, leadId: lead._id }, h.changedAt, {
          channel: null,
          direction: null,
          title: QUALIFICATION_FIELD_BY_KEY.get(h.fieldKey)?.label || h.fieldKey,
          status: h.current?.status ?? null,
          summary: null,
          body: null,
          actorId: str(h.changedBy),
          links: {
            historyId: String(h._id),
            communicationId: str(h.communicationId),
            callRecordId: str(h.callRecordId || h.transcriptRef?.callRecordId),
            smsMessageId: str(h.smsMessageId),
          },
          meta: {
            fieldKey: h.fieldKey,
            previous: h.previous ? { value: h.previous.value ?? null, status: h.previous.status } : null,
            current: { value: h.current?.value ?? null, status: h.current?.status ?? null },
            source: h.source ?? h.current?.source ?? null,
            evidence: h.current?.evidence ?? null,
            transcriptRef: h.transcriptRef ? {
              callRecordId: str(h.transcriptRef.callRecordId), turnIndex: h.transcriptRef.turnIndex ?? null,
              startMs: h.transcriptRef.startMs ?? null, quote: h.transcriptRef.quote ?? null,
            } : null,
            correctionOf: str(h.correctionOf),
            reason: h.reason ?? null,
          },
        });
        if (afterCursor(entry, ctx.cursor)) out.push(entry);
      }
    }
    return out.sort(compareEntries).slice(0, ctx.limit);
  }

  async _followUps(ctx) {
    const filter = { leadId: { $in: ctx.leadIds }, ...cursorCondition(ctx.cursor, 'follow_up', 'createdAt') };
    if (ctx.channel) filter.channel = ctx.channel === 'other' ? { $nin: ['phone', 'sms', 'email', 'whatsapp'] } : ctx.channel;
    const docs = await LeadFollowUp.find(filter).sort({ createdAt: -1, _id: -1 }).limit(ctx.limit)
      .select('leadId ownerId createdBy dueAt nextDueAt timezone channel note status completedAt cancelReason source createdAt').lean();
    return docs.map((d) => this._base(ctx, 'follow_up', d, d.createdAt, {
      channel: d.channel ? channelBucket(d.channel) : null,
      direction: null,
      title: 'Follow-up',
      status: d.status,
      summary: clip(d.note, 300),
      body: null,
      actorId: str(d.createdBy),
      links: {
        followUpId: String(d._id),
        communicationId: str(d.source?.communicationId),
        callRecordId: str(d.source?.callRecordId),
        contactLogId: str(d.source?.contactLogId),
      },
      meta: {
        dueAt: iso(d.dueAt), nextDueAt: iso(d.nextDueAt), timezone: d.timezone ?? null, ownerId: str(d.ownerId),
        sourceType: d.source?.type ?? null, completedAt: iso(d.completedAt), cancelReason: d.cancelReason ?? null,
        requestedTimeText: d.source?.requestedTimeText ?? null,
      },
    }));
  }

  async _workflowEvents(ctx) {
    if (ctx.channel) return [];
    const filter = { leadId: { $in: ctx.leadIds }, ...cursorCondition(ctx.cursor, 'workflow', 'at') };
    const docs = await LeadEvent.find(filter).sort({ at: -1, _id: -1 }).limit(ctx.limit).lean();
    return docs.map((d) => this._base(ctx, 'workflow', d, d.at, {
      channel: null,
      direction: null,
      title: d.type,
      status: null,
      summary: null,
      body: null,
      actorId: str(d.actor),
      links: {},
      meta: { eventType: d.type, details: d.details ?? null },
    }));
  }

  async _attachActors(entries) {
    const ids = [...new Set(entries.map((e) => e.actorId).filter(Boolean))];
    if (!ids.length) return;
    const User = mongoose.models.User;
    const users = await User.find({ _id: { $in: ids } }).select('firstName lastName email').lean();
    const names = new Map(users.map((u) => [String(u._id), [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || null]));
    for (const e of entries) e.actor = e.actorId ? { id: e.actorId, name: names.get(e.actorId) ?? null } : null;
  }

  /**
   * Full transcript of one AI call on this lead (or a lead merged into it), for
   * the "open transcript at turn" link. Same visibility rule as the excerpt.
   */
  async callTranscript(leadId, callId, viewer) {
    const { leadIds } = await this._leadScope(leadId);
    const call = await CallRecord.findOne({ _id: callId, leadId: { $in: leadIds } })
      .select('leadId createdBy campaignId transcript transcriptExpiresAt disposition createdAt endedAt durationSeconds')
      .populate('campaignId', 'name agentSnapshot.name agentConfig.agentName').lean();
    if (!call) throw new NotFoundError('CallRecord', callId);
    if (!viewer.canSeeAllTranscripts && String(call.createdBy) !== String(viewer.id)) {
      throw new AuthorizationError('Only the call owner or an AI-calling admin can read this transcript');
    }
    const expired = call.transcriptExpiresAt && new Date(call.transcriptExpiresAt) <= new Date();
    return {
      callRecordId: String(call._id),
      campaignName: call.campaignId?.name ?? null,
      agentName: call.campaignId?.agentSnapshot?.name || call.campaignId?.agentConfig?.agentName || null,
      disposition: call.disposition ?? null,
      startedAt: iso(call.createdAt),
      expired: Boolean(expired),
      turns: expired ? [] : (call.transcript || []).map((t, index) => ({ index, itemId: t.itemId, role: t.role, text: t.text, interrupted: Boolean(t.interrupted), at: iso(t.at) })),
    };
  }
}

const leadTimelineService = new LeadTimelineService();
export default leadTimelineService;
