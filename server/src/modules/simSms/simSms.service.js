import mongoose from 'mongoose';
import SimSmsCampaign from './simSmsCampaign.model.js';
import SimSmsConversation from './simSmsConversation.model.js';
import SimSmsMessage from './simSmsMessage.model.js';
import Lead, { LEAD_STATUS } from '../crm/lead.model.js';
import leadCommunicationService from '../crm/leadCommunication.service.js';
import { QUALIFICATION_FIELD_BY_KEY } from '../crm/leadQualification.constants.js';
import { normalizeConfirmedAnswer } from '../crm/leadQualification.service.js';
import MessageSuppression from '../messaging/suppression.model.js';
import LeadChannelConsent from '../messaging/consent.model.js';
import { destinationHash } from '../messaging/destinationHash.js';
import CallSuppression from '../aiCalling/callSuppression.model.js';
import { phoneHash } from '../aiCalling/callAuth.js';
import { ACTION_TO_LEAD_STATUS, PROTECTED_LEAD_STATUSES } from '../aiCalling/aiCalling.constants.js';
import * as engine from '../aiCalling/engine/questionEngine.js';
import { evaluateOutcome } from '../aiCalling/engine/statusRuleEngine.js';
import { windowState, recipientWindow, isValidTimezone } from '../aiCalling/engine/callWindow.js';
import { normalizePhone } from '../businessDiscovery/engine/normalizer.js';
import { isAiConfigured, createOpenAiClient } from '../../shared/ai/llmFactory.js';
import config from '../../config/index.js';
import auditService from '../auth/audit.service.js';
import notificationService from '../notifications/notification.service.js';
import logger from '../../shared/logger/index.js';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../shared/errors/AppError.js';
import { buildMessage, smsEncoding, smsSegments } from './engine/smsCopy.js';
import { interpretReply } from './engine/replyInterpreter.js';
import {
  ACTIVE_CONVERSATION_STATES, ATTEMPT_RESULT_GRACE_MS, LEASE_MS, SIM_SMS_ERROR_CODES,
} from './simSms.constants.js';

const MAX_LEADS = 500;
const PROCESSING_LEASE_MS = 2 * 60_000;
const MAX_TRANSIENT_SEND_FAILURES = 5;
// Backoff before re-sending after a transient radio/network failure (no signal, airplane
// mode). An immediate retry would burn the whole budget while the phone is offline.
export const TRANSIENT_RETRY_DELAYS_MS = [2, 10, 30, 60].map((m) => m * 60_000);
const consentRequired = () => process.env.AI_SMS_REQUIRE_CONSENT !== 'false';

// SmsManager result codes that mean "nothing was transmitted" (safe to retry).
const TRANSIENT_SEND_ERRORS = new Set(['RESULT_ERROR_NO_SERVICE', 'RESULT_ERROR_RADIO_OFF', 'RESULT_ERROR_LIMIT_EXCEEDED', 'RESULT_NETWORK_ERROR', 'RESULT_MODEM_ERROR', 'RESULT_ERROR_GENERIC_FAILURE']);

function conflict(message, code) {
  const err = new AppError(message, 409, code);
  return err;
}

function emit(userId, event, payload) {
  try { global.io?.to(`user:${userId}`).emit(event, payload); } catch { /* best-effort */ }
}

/** E.164 candidates for a lead's SMS destination (lead country, then CH default). */
function leadDestination(lead) {
  const field = lead.mobile ? 'mobile' : (lead.phone ? 'phone' : null);
  if (!field) return { field: null, e164: null, candidates: [], masked: null };
  const raw = String(lead[field]).trim();
  const primary = normalizePhone(raw, lead.address?.country || 'CH');
  const fallback = normalizePhone(raw);
  const candidates = [...new Set([primary, fallback].filter((n) => n.valid).map((n) => n.e164))];
  const digits = raw.replace(/\D/g, '');
  return {
    field, e164: primary.valid ? primary.e164 : null, candidates,
    masked: digits.length >= 4 ? `•••• ${digits.slice(-4)}` : '••••',
  };
}

/** SMS contact gates shared by enrolment, lease time and inbound handling. */
async function smsBlockers(lead, dest) {
  const reasons = [];
  if (!dest.field) return ['NO_DESTINATION'];
  if (!dest.e164) return ['INVALID_NUMBER'];
  const smsHashes = dest.candidates.map((e) => destinationHash('sms', e));
  const callHashes = dest.candidates.map((e) => phoneHash(e));
  const [smsSuppressed, dnc, consent] = await Promise.all([
    MessageSuppression.exists({ channel: 'sms', destinationHash: { $in: smsHashes } }),
    // A "do not contact" recorded from calls blocks SMS too.
    CallSuppression.exists({ phoneHash: { $in: callHashes }, reason: 'do_not_contact' }),
    LeadChannelConsent.findOne({ leadId: lead._id, channel: 'sms' }).select('status expiresAt').lean(),
  ]);
  if (smsSuppressed) reasons.push('SMS_SUPPRESSED');
  if (dnc) reasons.push('DO_NOT_CONTACT');
  if (consent && ['denied', 'revoked'].includes(consent.status)) reasons.push('SMS_CONSENT_DENIED');
  else if (consentRequired()) {
    const valid = consent?.status === 'granted' && (!consent.expiresAt || new Date(consent.expiresAt) > new Date());
    if (!valid) reasons.push(consent?.status === 'granted' ? 'SMS_CONSENT_EXPIRED' : 'SMS_CONSENT_REQUIRED');
  }
  return reasons;
}

function assertQuestionnaire(questionnaire) {
  const questions = questionnaire?.questions || [];
  if (!questions.length) throw new ValidationError('A campaign needs at least one question');
  const keys = new Set();
  for (const q of questions) {
    if (keys.has(q.fieldKey)) throw new ValidationError(`Duplicate question fieldKey: ${q.fieldKey}`);
    keys.add(q.fieldKey);
    if (['single_choice', 'multiple_choice', 'enum'].includes(q.type) && !(q.options || []).length) {
      throw new ValidationError(`Question "${q.fieldKey}" needs options`);
    }
  }
  for (const q of questions) {
    for (const group of ['all', 'any']) {
      for (const clause of q.condition?.[group] || []) {
        if (clause.field && !keys.has(clause.field)) throw new ValidationError(`Condition references unknown field: ${clause.field}`);
      }
    }
  }
}

function startOfLocalDay(timezone, now = new Date()) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(now).map((x) => [x.type, Number(x.value)]));
    return new Date(now.getTime() - (((p.hour * 60 + p.minute) * 60 + p.second) * 1000 + now.getMilliseconds()));
  } catch { const d = new Date(now); d.setUTCHours(0, 0, 0, 0); return d; }
}

/** The question an inbound reply answers, given the engine's next action. */
function openQuestion(questionnaire, state) {
  const action = engine.nextAction(questionnaire, state);
  return { action, question: ['ask', 'clarify', 'confirm'].includes(action.type) ? action.question : null };
}

/** Map an SMS conversation end to the leadCommunication disposition vocabulary. */
function communicationDisposition(disposition, qualification) {
  if (disposition === 'do_not_contact') return 'do_not_contact';
  if (disposition === 'callback_requested') return 'callback_requested';
  if (disposition === 'declined' || qualification === 'unqualified') return 'not_interested';
  if (disposition === 'no_answer') return 'no_answer';
  if (qualification === 'qualified') return 'interested';
  if (qualification === 'review') return 'human_follow_up';
  return 'sent';
}

class SimSmsService {
  // ------------------------------------------------------------- campaigns
  async createCampaign(input, actor, meta = {}) {
    assertQuestionnaire(input.questionnaire);
    if (input.settings?.timezone && !isValidTimezone(input.settings.timezone)) throw new ValidationError('Invalid timezone');
    const leadIds = [...new Set((input.leadIds || []).map(String))];
    if (!leadIds.length) throw new ValidationError('Select at least one lead');
    if (leadIds.length > MAX_LEADS) throw new ValidationError(`A SIM SMS campaign is limited to ${MAX_LEADS} leads (personal SIM sending limits)`);

    const leads = await Lead.find({ _id: { $in: leadIds }, isDeleted: false })
      .select('_id name contactName phone mobile address.country status').lean();
    if (!leads.length) throw new ValidationError('Selected leads are unavailable');

    const campaign = await SimSmsCampaign.create({
      name: input.name,
      isTest: Boolean(input.isTest),
      questionnaire: input.questionnaire,
      statusRules: input.statusRules || [],
      agent: input.agent || {},
      settings: input.settings || {},
      subscriptionId: input.subscriptionId ?? null,
      createdBy: actor,
    });

    const seen = new Set();
    const docs = [];
    for (const lead of leads) {
      const dest = leadDestination(lead);
      const reasons = await smsBlockers(lead, dest);
      const hash = dest.e164 ? destinationHash('sms', dest.e164) : null;
      if (hash && seen.has(hash)) reasons.push('DUPLICATE_NUMBER');
      if (hash) seen.add(hash);
      docs.push({
        campaignId: campaign._id, leadId: lead._id, createdBy: actor,
        destinationField: dest.field || 'mobile', destinationHash: hash, destinationMasked: dest.masked,
        country: lead.address?.country || null,
        state: reasons.length ? 'ineligible' : 'queued',
        eligibility: { eligible: !reasons.length, reasons },
        conversationState: engine.initConversationState(),
      });
    }
    await SimSmsConversation.insertMany(docs, { ordered: false });
    await this.refreshSummary(campaign._id);
    auditService.logEvent({
      eventType: 'sim_sms.campaign.created', userId: actor, ipAddress: meta.ipAddress || 'internal', result: 'success',
      module: 'sim-sms', details: { campaignId: campaign._id, leads: leads.length, isTest: campaign.isTest },
    });
    return this.getCampaign(campaign._id, actor);
  }

  async getCampaign(id, actor) {
    const campaign = await SimSmsCampaign.findOne({ _id: id, createdBy: actor }).lean();
    if (!campaign) throw new NotFoundError('SimSmsCampaign', id);
    return campaign;
  }

  async listCampaigns(actor, { page = 1, limit = 25, status } = {}) {
    const filter = { createdBy: actor, ...(status ? { status } : {}) };
    const [data, total] = await Promise.all([
      SimSmsCampaign.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      SimSmsCampaign.countDocuments(filter),
    ]);
    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async _transition(id, actor, from, set, meta, eventType) {
    const updated = await SimSmsCampaign.findOneAndUpdate(
      { _id: id, createdBy: actor, status: { $in: from } }, { $set: set }, { returnDocument: 'after' },
    );
    if (!updated) {
      if (!await SimSmsCampaign.exists({ _id: id, createdBy: actor })) throw new NotFoundError('SimSmsCampaign', id);
      throw conflict(`Campaign cannot move to ${set.status} from its current status`, SIM_SMS_ERROR_CODES.INVALID_TRANSITION);
    }
    auditService.logEvent({ eventType, userId: actor, ipAddress: meta.ipAddress || 'internal', result: 'success', module: 'sim-sms', details: { campaignId: id } });
    return updated;
  }

  async startCampaign(id, actor, meta = {}) {
    const eligible = await SimSmsConversation.countDocuments({ campaignId: id, createdBy: actor, state: { $in: ACTIVE_CONVERSATION_STATES } });
    if (!eligible) {
      await this.getCampaign(id, actor);
      throw conflict('Campaign has no eligible leads to message', SIM_SMS_ERROR_CODES.INVALID_TRANSITION);
    }
    await this._transition(id, actor, ['draft', 'paused'], { status: 'running', startedAt: new Date() }, meta, 'sim_sms.campaign.started');
    emit(actor, 'sim-sms:outbox', { campaignId: String(id) });
    return this.getCampaign(id, actor);
  }

  async pauseCampaign(id, actor, meta = {}) {
    await this._transition(id, actor, ['running'], { status: 'paused' }, meta, 'sim_sms.campaign.paused');
    // Un-attempted messages go back to pending so they are not sent while paused.
    await SimSmsMessage.updateMany({ campaignId: id, status: 'leased' }, { $set: { status: 'pending', deviceId: null, leaseUntil: null } });
    return this.getCampaign(id, actor);
  }

  async cancelCampaign(id, actor, meta = {}) {
    await this._transition(id, actor, ['draft', 'running', 'paused'], { status: 'cancelled', completedAt: new Date() }, meta, 'sim_sms.campaign.cancelled');
    // Messages already being transmitted ('attempting') cannot be recalled; everything else stops.
    await SimSmsMessage.updateMany({ campaignId: id, status: { $in: ['pending', 'leased'] } }, { $set: { status: 'cancelled', leaseUntil: null } });
    await SimSmsConversation.updateMany({ campaignId: id, state: { $in: ACTIVE_CONVERSATION_STATES } }, { $set: { state: 'cancelled' } });
    await this.refreshSummary(id);
    return this.getCampaign(id, actor);
  }

  async listConversations(campaignId, actor, { page = 1, limit = 50, state } = {}) {
    await this.getCampaign(campaignId, actor);
    const filter = { campaignId, ...(state ? { state } : {}) };
    const [data, total] = await Promise.all([
      SimSmsConversation.find(filter).sort({ updatedAt: -1, _id: 1 }).skip((page - 1) * limit).limit(limit)
        .populate('leadId', 'leadNumber name status').select('-conversationState').lean(),
      SimSmsConversation.countDocuments(filter),
    ]);
    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  /** Full transcript + collected answers for one conversation (owner only). */
  async getConversation(id, actor) {
    const conversation = await SimSmsConversation.findOne({ _id: id, createdBy: actor })
      .populate('leadId', 'leadNumber name status').populate('campaignId', 'name questionnaire').lean();
    if (!conversation) throw new NotFoundError('SimSmsConversation', id);
    const messages = await SimSmsMessage.find({ conversationId: id }).sort({ createdAt: 1 })
      .select('direction kind body status sentAt deliveredAt receivedAt failureCode questionFieldKey interpretation createdAt').lean();
    const state = engine.normalizeState(conversation.conversationState);
    const questions = conversation.campaignId?.questionnaire?.questions || [];
    const answers = questions.filter((q) => state.answers[q.fieldKey]).map((q) => ({
      fieldKey: q.fieldKey, label: q.label, ...state.answers[q.fieldKey],
    }));
    return { conversation, messages, answers };
  }

  /** All SIM SMS conversations of one lead (company-wide lead, owner-scoped conversations). */
  async leadConversations(leadId, actor) {
    const conversations = await SimSmsConversation.find({ leadId, createdBy: actor }).sort({ createdAt: -1 }).limit(20)
      .populate('campaignId', 'name').select('-conversationState').lean();
    const ids = conversations.map((c) => c._id);
    const messages = ids.length
      ? await SimSmsMessage.find({ conversationId: { $in: ids } }).sort({ createdAt: 1 }).limit(500)
        .select('conversationId direction kind body status sentAt receivedAt createdAt').lean()
      : [];
    return conversations.map((c) => ({ ...c, messages: messages.filter((m) => String(m.conversationId) === String(c._id)) }));
  }

  // ------------------------------------------------------------- conversation engine
  /**
   * Read-modify-write a conversation's engine state with optimistic concurrency.
   * `mutate(state, conversation, campaign)` returns { state, set? }.
   */
  async _mutate(conversationId, mutate) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const conversation = await SimSmsConversation.findById(conversationId);
      if (!conversation) throw new NotFoundError('SimSmsConversation', conversationId);
      const campaign = await SimSmsCampaign.findById(conversation.campaignId).lean();
      const version = conversation.stateVersion || 0;
      const out = await mutate(engine.normalizeState(conversation.conversationState), conversation, campaign);
      if (!out) return { conversation, campaign, state: engine.normalizeState(conversation.conversationState) };
      const res = await SimSmsConversation.updateOne(
        { _id: conversationId, stateVersion: version || { $in: [0, null] } },
        { $set: { conversationState: out.state, ...(out.set || {}) }, $inc: { stateVersion: 1 } },
      );
      if (res.modifiedCount === 1) return { conversation, campaign, state: out.state };
    }
    throw new ConflictError('Conversation changed concurrently; retry');
  }

  async _queueOutbound(conversation, campaign, kind, { question = null, previousValue = null } = {}) {
    const lead = await Lead.findById(conversation.leadId).select('name contactName').lean();
    const body = buildMessage({ kind, agent: campaign.agent || {}, lead: lead || {}, question, previousValue }).slice(0, 1600);
    // At most one unsent outbound per conversation: supersede any pending/leased one.
    await SimSmsMessage.updateMany(
      { conversationId: conversation._id, direction: 'outbound', status: { $in: ['pending', 'leased'] } },
      { $set: { status: 'cancelled', leaseUntil: null } },
    );
    return SimSmsMessage.create({
      conversationId: conversation._id, campaignId: campaign._id, leadId: conversation.leadId, createdBy: conversation.createdBy,
      direction: 'outbound', kind, body, segments: smsSegments(body), encoding: smsEncoding(body),
      questionFieldKey: question?.fieldKey || null, status: 'pending', subscriptionId: campaign.subscriptionId ?? null,
    });
  }

  /**
   * Generate the next outbound for a conversation from the engine's next action.
   * finish/end produce the closing message and complete the conversation.
   */
  async _advance(conversationId, { firstMessage = false } = {}) {
    const conversation = await SimSmsConversation.findById(conversationId);
    const campaign = await SimSmsCampaign.findById(conversation.campaignId).lean();
    const state = engine.normalizeState(conversation.conversationState);
    const action = engine.nextAction(campaign.questionnaire, state);
    if (action.type === 'ask' || action.type === 'clarify' || action.type === 'confirm') {
      const kind = firstMessage ? 'opening' : ({ ask: 'question', clarify: 'clarify', confirm: 'confirm' })[action.type];
      const previousValue = action.type === 'confirm' ? state.answers[action.question.fieldKey]?.normalizedValue : null;
      await this._queueOutbound(conversation, campaign, kind, { question: action.question, previousValue });
      await SimSmsConversation.updateOne({ _id: conversationId }, { $set: { state: 'awaiting_send', replyDeadlineAt: null } });
      return { queued: kind };
    }
    // finish / end
    const reason = action.reason || 'finished';
    if (reason === 'do_not_contact') {
      await this._queueOutbound(conversation, campaign, 'stop_ack');
      await SimSmsConversation.updateOne({ _id: conversationId }, { $set: { state: 'stopped', replyDeadlineAt: null } });
    } else {
      await this._queueOutbound(conversation, campaign, 'closing');
      await SimSmsConversation.updateOne({ _id: conversationId }, { $set: { state: 'completed', replyDeadlineAt: null } });
    }
    await this.processResults(conversationId);
    return { queued: reason === 'do_not_contact' ? 'stop_ack' : 'closing', ended: reason };
  }

  /** Materialise the opening message for queued conversations of the owner's running campaigns. */
  async _materializeOpenings(actor, now = new Date(), limit = 5) {
    const running = await SimSmsCampaign.find({ createdBy: actor, status: 'running' }).select('_id settings').lean();
    let created = 0;
    for (const campaign of running) {
      if (created >= limit) break;
      const queued = await SimSmsConversation.find({
        campaignId: campaign._id, state: 'queued', $or: [{ notBefore: null }, { notBefore: { $lte: now } }],
      }).sort({ createdAt: 1 }).limit(limit - created).select('_id country').lean();
      for (const c of queued) {
        const local = recipientWindow(c.country, { now });
        if (!local.open) { await SimSmsConversation.updateOne({ _id: c._id }, { $set: { notBefore: new Date(now.getTime() + local.delayMs) } }); continue; }
        // markDisclosed: the opening text itself carries the identity + opt-out disclosure.
        const claimed = await SimSmsConversation.findOneAndUpdate(
          { _id: c._id, state: 'queued' }, { $set: { state: 'awaiting_send' } }, { returnDocument: 'after' },
        );
        if (!claimed) continue;
        await this._mutate(c._id, (s) => ({ state: engine.markDisclosed(s) }));
        await this._advance(c._id, { firstMessage: true });
        created += 1;
      }
    }
    return created;
  }

  // ------------------------------------------------------------- device transport
  /** Recover leases that expired before an attempt, and attempts whose result was lost. */
  async _recoverLeases(now = new Date(), filter = {}) {
    const released = await SimSmsMessage.updateMany(
      { ...filter, status: 'leased', leaseUntil: { $lt: now } },
      { $set: { status: 'pending', deviceId: null, leaseUntil: null } },
    );
    const lost = await SimSmsMessage.find({
      ...filter, status: 'attempting', attemptedAt: { $lt: new Date(now.getTime() - ATTEMPT_RESULT_GRACE_MS) },
    }).select('_id conversationId createdBy').limit(100).lean();
    for (const m of lost) await this._markUnknown(m, 'RESULT_LOST');
    return { released: released.modifiedCount || 0, unknown: lost.length };
  }

  async _markUnknown(message, code) {
    const res = await SimSmsMessage.updateOne({ _id: message._id, status: { $in: ['attempting', 'leased'] } }, { $set: { status: 'unknown', failureCode: code, leaseUntil: null } });
    if (!res.modifiedCount) return;
    // We cannot know whether the lead received it: never re-send automatically.
    await SimSmsConversation.updateOne({ _id: message.conversationId, state: { $in: ACTIVE_CONVERSATION_STATES } }, { $set: { state: 'needs_attention' } });
    notificationService.create({
      channels: ['IN_APP'], recipientIds: [message.createdBy], type: 'sim_sms.needs_attention', category: 'CRM', priority: 'NORMAL',
      payload: { title: 'SMS send result unknown', message: 'A message may or may not have been sent from your phone. It was not re-sent automatically.', conversationId: String(message.conversationId) },
      sourceModule: 'sim-sms', sourceEvent: 'SEND_UNKNOWN', sourceEntityType: 'SimSmsMessage', sourceEntityId: message._id,
      idempotencyKey: `sim-sms-unknown-${message._id}`,
    }, message.createdBy).catch(() => {});
  }

  /** Gates re-checked when a message is handed to the phone. Returns null or a reason. */
  async _leaseGate(message, campaign, now) {
    if (!campaign || campaign.status !== 'running') return 'CAMPAIGN_NOT_RUNNING';
    const conversation = await SimSmsConversation.findById(message.conversationId).lean();
    if (!conversation || !['awaiting_send', 'completed', 'stopped'].includes(conversation.state)) return 'CONVERSATION_INACTIVE';
    const lead = await Lead.findOne({ _id: message.leadId, isDeleted: false }).select('_id name phone mobile address.country').lean();
    if (!lead) return 'LEAD_UNAVAILABLE';
    const dest = leadDestination(lead);
    if (!dest.e164 || destinationHash('sms', dest.e164) !== conversation.destinationHash) return 'NUMBER_CHANGED';
    // stop_ack must still go out after an opt-out; every other message re-checks the gates.
    if (message.kind !== 'stop_ack') {
      const blockers = await smsBlockers(lead, dest);
      if (blockers.length) return blockers[0];
    }
    const win = windowState({ timezone: campaign.settings?.timezone, callWindow: campaign.settings?.sendWindow, daysOfWeek: campaign.settings?.daysOfWeek }, now);
    if (!win.open && message.kind !== 'stop_ack') return { defer: win.delayMs };
    const local = recipientWindow(conversation.country, { now });
    if (!local.open && message.kind !== 'stop_ack') return { defer: local.delayMs };
    return { ok: true, to: dest.e164, leadName: lead.name };
  }

  /**
   * The phone asks for the next message to send. Leases at most ONE message
   * (pacing is enforced server-side) and returns `retryAfterMs` for the next poll.
   */
  async lease(actor, { deviceId }, now = new Date()) {
    await this._recoverLeases(now, { createdBy: actor });
    await this._materializeOpenings(actor, now);

    // Pacing: one send per minSecondsBetweenSends across the owner's phone.
    const last = await SimSmsMessage.findOne({ createdBy: actor, direction: 'outbound', attemptedAt: { $ne: null } })
      .sort({ attemptedAt: -1 }).select('attemptedAt campaignId').lean();

    const candidates = await SimSmsMessage.find({
      createdBy: actor, direction: 'outbound', status: 'pending', $or: [{ notBefore: null }, { notBefore: { $lte: now } }],
    })
      .sort({ createdAt: 1 }).limit(20).lean();
    let soonestDefer = null;
    for (const message of candidates) {
      const campaign = await SimSmsCampaign.findById(message.campaignId).lean();
      const minGap = (campaign?.settings?.minSecondsBetweenSends ?? 20) * 1000;
      if (last?.attemptedAt && now - last.attemptedAt < minGap) {
        return { message: null, retryAfterMs: minGap - (now - last.attemptedAt) };
      }
      const sentToday = await SimSmsMessage.countDocuments({
        campaignId: message.campaignId, direction: 'outbound', attemptedAt: { $gte: startOfLocalDay(campaign?.settings?.timezone || 'UTC', now) },
      });
      if (campaign && sentToday >= (campaign.settings?.maxMessagesPerDay ?? 100)) continue;

      const gate = await this._leaseGate(message, campaign, now);
      if (typeof gate === 'string') {
        await SimSmsMessage.updateOne({ _id: message._id, status: 'pending' }, { $set: { status: 'cancelled', failureCode: gate } });
        if (gate !== 'CAMPAIGN_NOT_RUNNING') {
          await SimSmsConversation.updateOne({ _id: message.conversationId, state: { $in: ACTIVE_CONVERSATION_STATES } }, { $set: { state: 'ineligible', 'eligibility.eligible': false, 'eligibility.reasons': [gate] } });
          await this.refreshSummary(message.campaignId);
        }
        continue;
      }
      if (gate.defer) { soonestDefer = Math.min(soonestDefer ?? Infinity, gate.defer); continue; }

      const leased = await SimSmsMessage.findOneAndUpdate(
        { _id: message._id, status: 'pending' },
        { $set: { status: 'leased', deviceId, leaseUntil: new Date(now.getTime() + LEASE_MS) } },
        { returnDocument: 'after' },
      ).lean();
      if (!leased) continue;
      return {
        message: {
          id: String(leased._id), conversationId: String(leased.conversationId), campaignId: String(leased.campaignId),
          leadId: String(leased.leadId), leadName: gate.leadName, to: gate.to, body: leased.body,
          segments: leased.segments, subscriptionId: leased.subscriptionId, kind: leased.kind,
          leaseUntil: leased.leaseUntil,
        },
        retryAfterMs: minGap,
      };
    }
    return { message: null, retryAfterMs: soonestDefer != null ? Math.min(soonestDefer, 15 * 60_000) : 60_000 };
  }

  /** The phone is about to call SmsManager. After this the message is never handed out again. */
  async markAttempting(actor, messageId, { deviceId }) {
    const updated = await SimSmsMessage.findOneAndUpdate(
      { _id: messageId, createdBy: actor, status: 'leased', deviceId, leaseUntil: { $gte: new Date() } },
      { $set: { status: 'attempting', attemptedAt: new Date(), leaseUntil: null } },
      { returnDocument: 'after' },
    ).lean();
    if (updated) return { proceed: true };
    const current = await SimSmsMessage.findOne({ _id: messageId, createdBy: actor }).select('status deviceId').lean();
    if (!current) throw new NotFoundError('SimSmsMessage', messageId);
    if (current.status === 'attempting' && current.deviceId === deviceId) return { proceed: false, reason: 'already_attempting' };
    throw conflict('This message is no longer leased to this device; do not send it', SIM_SMS_ERROR_CODES.NOT_LEASED_TO_DEVICE);
  }

  /** Device-reported send result (idempotent). */
  async reportResult(actor, messageId, { deviceId, status, errorCode = null, at = null }) {
    const message = await SimSmsMessage.findOne({ _id: messageId, createdBy: actor });
    if (!message) throw new NotFoundError('SimSmsMessage', messageId);
    if (message.status === status) return { duplicate: true };
    if (!['attempting', 'unknown'].includes(message.status) || (message.deviceId && message.deviceId !== deviceId)) {
      throw conflict(`Cannot record "${status}" for a message in status "${message.status}"`, SIM_SMS_ERROR_CODES.INVALID_TRANSITION);
    }
    const when = at ? new Date(at) : new Date();
    if (status === 'unknown') { await this._markUnknown(message, errorCode || 'DEVICE_REPORTED_UNKNOWN'); return { status }; }

    if (status === 'sent') {
      await SimSmsMessage.updateOne({ _id: message._id }, { $set: { status: 'sent', sentAt: when, failureCode: null } });
      const campaign = await SimSmsCampaign.findById(message.campaignId).select('settings').lean();
      const waitsForReply = !['closing', 'stop_ack'].includes(message.kind);
      await SimSmsConversation.updateOne(
        { _id: message.conversationId, state: { $in: ['awaiting_send', 'needs_attention'] } },
        { $set: {
          lastOutboundAt: when,
          ...(waitsForReply ? { state: 'awaiting_reply', replyDeadlineAt: new Date(when.getTime() + (campaign?.settings?.replyTimeoutHours ?? 48) * 3_600_000) } : {}),
        } },
      );
      await SimSmsConversation.updateOne({ _id: message.conversationId, state: { $in: ['completed', 'stopped'] } }, { $set: { lastOutboundAt: when } });
    } else {
      // failed: SmsManager reported a definite failure — nothing was transmitted.
      await SimSmsMessage.updateOne({ _id: message._id }, { $set: { status: 'failed', failureCode: errorCode || 'UNKNOWN_FAILURE' } });
      const failures = await SimSmsMessage.countDocuments({ conversationId: message.conversationId, status: 'failed' });
      if (TRANSIENT_SEND_ERRORS.has(errorCode) && failures < MAX_TRANSIENT_SEND_FAILURES && !['closing', 'stop_ack'].includes(message.kind)) {
        const delay = TRANSIENT_RETRY_DELAYS_MS[Math.min(failures - 1, TRANSIENT_RETRY_DELAYS_MS.length - 1)];
        await SimSmsMessage.create({
          conversationId: message.conversationId, campaignId: message.campaignId, leadId: message.leadId, createdBy: message.createdBy,
          direction: 'outbound', kind: message.kind, body: message.body, segments: message.segments, encoding: message.encoding,
          questionFieldKey: message.questionFieldKey, status: 'pending', subscriptionId: message.subscriptionId,
          notBefore: new Date(Date.now() + delay),
        });
      } else if (!['closing', 'stop_ack'].includes(message.kind)) {
        await SimSmsConversation.updateOne({ _id: message.conversationId, state: { $in: ACTIVE_CONVERSATION_STATES } }, { $set: { state: 'failed', disposition: 'failed' } });
      }
    }
    await this.refreshSummary(message.campaignId);
    emit(actor, 'sim-sms:message', { messageId: String(message._id), status });
    return { status };
  }

  async reportDelivery(actor, messageId, { at = null }) {
    const res = await SimSmsMessage.updateOne(
      { _id: messageId, createdBy: actor, direction: 'outbound', status: 'sent', deliveredAt: null },
      { $set: { deliveredAt: at ? new Date(at) : new Date() } },
    );
    return { updated: res.modifiedCount === 1 };
  }

  /** Numbers the phone should watch for replies (active conversations of this owner). */
  async watchList(actor) {
    const conversations = await SimSmsConversation.find({
      createdBy: actor, state: { $in: ['awaiting_send', 'awaiting_reply', 'needs_attention'] },
    }).select('leadId').limit(MAX_LEADS * 2).lean();
    const leads = await Lead.find({ _id: { $in: conversations.map((c) => c.leadId) } }).select('phone mobile address.country').lean();
    // Numbers texted an SMS-link invitation are watched too, so a "STOP" reply opts them out.
    const { default: linkAssistant } = await import('../linkAssistant/linkAssistant.service.js');
    const linkNumbers = await linkAssistant.watchNumbers(actor).catch(() => []);
    return [...new Set([...leads.map((l) => leadDestination(l).e164).filter(Boolean), ...linkNumbers])];
  }

  // ------------------------------------------------------------- inbound
  _classifier() {
    if (!isAiConfigured()) return null;
    return async (system, user) => {
      const client = await createOpenAiClient();
      const response = await client.chat.completions.create({
        model: config.ai.model || 'gpt-4o', temperature: 0, max_tokens: 200,
        ...(config.ai.baseUrl ? {} : { response_format: { type: 'json_object' } }),
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }, { timeout: 15_000 });
      const raw = response?.choices?.[0]?.message?.content || '';
      return JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    };
  }

  /**
   * A reply received on the owner's phone. Matched to the owner's conversation
   * by number, de-duplicated by the device key, interpreted, and the next
   * outbound is generated. Replies from unknown numbers are not stored.
   */
  async receiveInbound(actor, { deviceMessageKey, from, matchedTo = null, body, receivedAt = null }, deps = {}) {
    const candidates = [matchedTo, from].filter(Boolean)
      .flatMap((n) => [normalizePhone(n, 'CH'), normalizePhone(n)])
      .filter((n) => n.valid).map((n) => n.e164);
    const hashes = [...new Set(candidates)].map((e) => destinationHash('sms', e));
    if (!hashes.length) return { matched: false };

    const conversation = await SimSmsConversation.findOne({
      createdBy: actor, destinationHash: { $in: hashes }, state: { $in: ['awaiting_reply', 'awaiting_send', 'needs_attention', 'completed', 'stopped', 'expired'] },
    }).sort({ lastOutboundAt: -1, updatedAt: -1 });
    // Not an SMS-agent conversation: it may be a STOP reply to an SMS-link campaign.
    if (!conversation) {
      const { default: linkAssistant } = await import('../linkAssistant/linkAssistant.service.js');
      return linkAssistant.inboundSmsReply(actor, { from, body, deviceMessageKey, receivedAt });
    }

    let inbound;
    try {
      inbound = await SimSmsMessage.create({
        conversationId: conversation._id, campaignId: conversation.campaignId, leadId: conversation.leadId, createdBy: actor,
        direction: 'inbound', kind: 'inbound', body: String(body || '').slice(0, 1600), status: 'received',
        deviceMessageKey, receivedAt: receivedAt ? new Date(receivedAt) : new Date(),
      });
    } catch (error) {
      if (error?.code === 11000) return { matched: true, duplicate: true };
      throw error;
    }
    await SimSmsConversation.updateOne({ _id: conversation._id }, { $set: { lastInboundAt: inbound.receivedAt } });

    const campaign = await SimSmsCampaign.findById(conversation.campaignId).lean();
    const active = ['awaiting_reply', 'awaiting_send', 'needs_attention'].includes(conversation.state);
    const state = engine.normalizeState(conversation.conversationState);
    const { action, question } = openQuestion(campaign.questionnaire, state);
    const classify = deps.classify !== undefined ? deps.classify : this._classifier();
    const interpretation = await interpretReply(action.type === 'confirm' ? { ...question, type: 'boolean', text: 'Is that right?' } : question, inbound.body, { classify });
    await SimSmsMessage.updateOne({ _id: inbound._id }, { $set: { interpretation: { intent: interpretation.intent, validation: interpretation.validation, source: interpretation.source, questionFieldKey: question?.fieldKey || null } } });

    // Opt-out is honoured in every state, even after the conversation ended.
    if (interpretation.intent === 'stop') {
      await this._optOut(conversation, actor);
      // The same opt-out closes the lead's SMS-link conversations and is logged once.
      const { default: linkAssistant } = await import('../linkAssistant/linkAssistant.service.js');
      await linkAssistant.optOutLead({
        leadId: conversation.leadId, actor, source: 'sim_sms_agent', keyword: String(inbound.body).trim().slice(0, 40).toUpperCase(),
        dedupeKey: `sms:${deviceMessageKey}:${conversation.leadId}`, receivedAt: inbound.receivedAt,
        exceptSmsConversationId: conversation._id,
      }).catch((e) => logger.warn('link opt-out propagation failed', { module: 'sim-sms', error: e.message }));
      if (active) {
        await this._mutate(conversation._id, (s) => ({ state: engine.endConversation(s, 'do_not_contact') }));
        await this._advance(conversation._id);
      }
      await this.refreshSummary(conversation.campaignId);
      return { matched: true, intent: 'stop' };
    }
    if (!active || !question || campaign.status === 'cancelled') {
      await this.refreshSummary(conversation.campaignId);
      return { matched: true, intent: interpretation.intent, ignored: 'conversation_not_active' };
    }

    await this._mutate(conversation._id, (s) => {
      if (interpretation.intent === 'decline') return { state: engine.endConversation(s, 'declined') };
      if (interpretation.intent === 'callback') {
        return { state: { ...engine.endConversation(s, 'callback_requested'), control: { callbackRequestedAt: null, callbackText: inbound.body.slice(0, 500) } } };
      }
      if (action.type === 'confirm') {
        return interpretation.intent === 'answer' && interpretation.normalizedValue === true
          ? { state: engine.markConfirmed(s, question.fieldKey) }
          : { state: engine.applyAnswer(s, question.fieldKey, { validation: 'invalid', normalizedValue: null, rawAnswer: inbound.body }) };
      }
      const validation = interpretation.intent === 'answer' ? 'valid' : (interpretation.intent === 'unknown' ? 'unknown' : 'invalid');
      return {
        state: engine.applyAnswer(s, question.fieldKey, {
          validation, normalizedValue: validation === 'valid' ? interpretation.normalizedValue : null, rawAnswer: inbound.body,
        }),
      };
    });
    await SimSmsConversation.updateOne({ _id: conversation._id }, { $set: { remindersSent: 0 } });
    const next = await this._advance(conversation._id);
    await this.refreshSummary(conversation.campaignId);
    emit(actor, 'sim-sms:outbox', { campaignId: String(conversation.campaignId) });
    return { matched: true, intent: interpretation.intent, next };
  }

  /** STOP: suppress SMS for this number and record the consent revocation. */
  async _optOut(conversation, actor) {
    const lead = await Lead.findById(conversation.leadId).select('_id phone mobile address.country').lean();
    const dest = lead ? leadDestination(lead) : { candidates: [] };
    for (const e164 of dest.candidates) {
      await MessageSuppression.updateOne(
        { channel: 'sms', destinationHash: destinationHash('sms', e164) },
        { $setOnInsert: { leadId: conversation.leadId, reason: 'opt_out', source: 'sim_sms_reply', suppressedAt: new Date(), createdBy: actor } },
        { upsert: true },
      );
    }
    await LeadChannelConsent.updateOne(
      { leadId: conversation.leadId, channel: 'sms' },
      { $set: { status: 'revoked', evidence: 'Lead replied STOP to an SMS sent from the agent phone', source: 'sim_sms_reply', capturedAt: new Date(), changedBy: actor } },
      { upsert: true },
    );
    // Every other pending SMS to this lead (any campaign of any user) stops.
    await this.cancelLeadConversations(conversation.leadId, { exceptId: conversation._id });
  }

  /**
   * The lead opted out: cancel every queued SMS-agent message to them and make their
   * active conversations ineligible (any campaign of any user). Idempotent.
   */
  async cancelLeadConversations(leadId, { exceptId = null } = {}) {
    const filter = { leadId, state: { $in: ACTIVE_CONVERSATION_STATES } };
    if (exceptId) filter._id = { $ne: exceptId };
    const others = await SimSmsConversation.find(filter).select('_id campaignId').lean();
    if (!others.length) return { cancelled: 0 };
    await SimSmsMessage.updateMany({ conversationId: { $in: others.map((o) => o._id) }, status: { $in: ['pending', 'leased'] } }, { $set: { status: 'cancelled', failureCode: 'OPTED_OUT' } });
    await SimSmsConversation.updateMany({ _id: { $in: others.map((o) => o._id) } }, { $set: { state: 'ineligible', 'eligibility.eligible': false, 'eligibility.reasons': ['SMS_SUPPRESSED'] } });
    for (const campaignId of new Set(others.map((o) => String(o.campaignId)))) await this.refreshSummary(campaignId);
    return { cancelled: others.length };
  }

  // ------------------------------------------------------------- results → CRM
  /**
   * Exactly-once CRM sync for a finished conversation, through the existing
   * leadCommunication completion path (contact log, last-contacted stamp,
   * audited status change, qualification merge, suppression).
   */
  async processResults(conversationId) {
    const now = new Date();
    const conversation = await SimSmsConversation.findOneAndUpdate(
      { _id: conversationId, resultsProcessedAt: null, $or: [{ processingLeaseUntil: null }, { processingLeaseUntil: { $lt: now } }] },
      { $set: { processingLeaseUntil: new Date(now.getTime() + PROCESSING_LEASE_MS) } },
      { returnDocument: 'after' },
    );
    if (!conversation) return { duplicate: true };
    const campaign = await SimSmsCampaign.findById(conversation.campaignId).lean();
    const state = engine.normalizeState(conversation.conversationState);
    const prog = engine.progress(campaign.questionnaire, state);

    let disposition;
    if (state.endedReason === 'do_not_contact') disposition = 'do_not_contact';
    else if (state.endedReason === 'callback_requested') disposition = 'callback_requested';
    else if (state.endedReason === 'declined') disposition = 'declined';
    else if (prog.answered > 0 && prog.unresolvedRequired.length === 0) disposition = 'answered_completed';
    else if (prog.answered > 0) disposition = 'answered_partial';
    else disposition = 'no_answer';

    const validValues = {};
    for (const q of campaign.questionnaire.questions || []) {
      const e = state.answers?.[q.fieldKey];
      if (e?.validation === 'valid') validValues[q.fieldKey] = e.normalizedValue;
    }
    const outcome = evaluateOutcome({
      statusRules: campaign.statusRules, answers: validValues, disposition,
      hasUnresolvedRequired: prog.unresolvedRequired.length > 0, control: state.control || {},
    });

    await SimSmsConversation.updateOne({ _id: conversationId }, { $set: {
      disposition, qualification: outcome.qualification, reviewRequired: outcome.requiresReview,
    } });

    if (!campaign.isTest) {
      try {
        await this._syncToLead({ conversation, campaign, state, disposition, outcome });
      } catch (error) {
        // Leave the claim to expire: the sweep retries the (idempotent) sync.
        logger.warn('SIM SMS lead sync failed; will retry', { module: 'sim-sms', conversationId: String(conversationId), error: error.message });
        return { processed: false, error: error.message };
      }
    }
    await SimSmsConversation.updateOne({ _id: conversationId }, { $set: { resultsProcessedAt: new Date(), processingLeaseUntil: null } });
    await this.refreshSummary(conversation.campaignId);
    return { processed: true, disposition, qualification: outcome.qualification };
  }

  async _syncToLead({ conversation, campaign, state, disposition, outcome }) {
    const operationId = conversation.communicationOperationId || `simsms_${conversation._id}`;
    if (!conversation.communicationOperationId) {
      await SimSmsConversation.updateOne({ _id: conversation._id }, { $set: { communicationOperationId: operationId } });
    }
    const lead = await Lead.findById(conversation.leadId).select('status').lean();
    if (!lead) return;

    let statusChange = ACTION_TO_LEAD_STATUS[outcome.action] ?? null;
    if (outcome.requiresReview || PROTECTED_LEAD_STATUSES.has(lead.status)) statusChange = null;
    if (lead.status === LEAD_STATUS.QUALIFIED && statusChange === LEAD_STATUS.CONTACTED) statusChange = null;
    if (statusChange && await this._statusChangedByHumanSince(conversation.leadId, conversation.createdAt)) statusChange = null;
    if (statusChange === lead.status) statusChange = null;

    // Only questions that map to the lead's qualification schema are merged into
    // Lead.qualification; every answer stays in the conversation transcript.
    const answers = [];
    for (const q of campaign.questionnaire.questions || []) {
      const e = state.answers?.[q.fieldKey];
      if (!e || e.validation !== 'valid' || !QUALIFICATION_FIELD_BY_KEY.has(q.fieldKey)) continue;
      try {
        answers.push(normalizeConfirmedAnswer({
          fieldKey: q.fieldKey, status: 'answered', value: Array.isArray(e.normalizedValue) ? e.normalizedValue.join(', ') : e.normalizedValue,
          source: 'sms_agent', evidence: String(e.rawAnswer || '').slice(0, 2000),
        }));
      } catch { /* incompatible with the qualification field type — kept in the transcript only */ }
    }

    const transcript = await SimSmsMessage.find({ conversationId: conversation._id, status: { $in: ['sent', 'received'] } })
      .sort({ createdAt: 1 }).select('direction body').lean();
    const notes = [
      `AI SMS agent (sent from the agent's phone SIM) — campaign "${campaign.name}". Result: ${outcome.qualification} (${disposition}).`,
      ...transcript.map((m) => `${m.direction === 'outbound' ? '→' : '←'} ${m.body}`),
    ].join('\n').slice(0, 5000);
    const lastOut = [...transcript].reverse().find((m) => m.direction === 'outbound');

    await leadCommunicationService.create(String(conversation.leadId), {
      operationId, channel: 'sms', route: 'sim_sms_agent', mode: 'ai_agent', destinationField: conversation.destinationField,
      startedAt: conversation.createdAt,
    }, conversation.createdBy, {}, { skipEligibility: true });
    await leadCommunicationService.complete(String(conversation.leadId), operationId, {
      outcome: {
        disposition: communicationDisposition(disposition, outcome.qualification),
        connected: state.answers && Object.keys(state.answers).length ? 'yes' : (conversation.lastInboundAt ? 'yes' : 'no'),
        notes, followUpAt: null, followUpTimezone: null, statusChange, doNotContact: disposition === 'do_not_contact',
      },
      sms: lastOut ? { templateId: null, body: lastOut.body, encoding: smsEncoding(lastOut.body), segments: smsSegments(lastOut.body), sendStatus: 'sent_by_app' } : null,
      qualification: { answers },
    }, conversation.createdBy, {});

    if (outcome.action === 'schedule_callback' || outcome.requiresReview) {
      notificationService.create({
        channels: ['IN_APP'], recipientIds: [conversation.createdBy],
        type: outcome.requiresReview ? 'sim_sms.needs_review' : 'sim_sms.callback_requested', category: 'CRM', priority: 'HIGH',
        payload: {
          title: outcome.requiresReview ? 'SMS conversation needs review' : 'Lead asked to be called back (SMS)',
          message: outcome.callback?.note || outcome.reason, leadId: String(conversation.leadId), conversationId: String(conversation._id),
        },
        sourceModule: 'sim-sms', sourceEvent: outcome.requiresReview ? 'NEEDS_REVIEW' : 'CALLBACK', sourceEntityType: 'SimSmsConversation', sourceEntityId: conversation._id,
        idempotencyKey: `sim-sms-${outcome.requiresReview ? 'review' : 'callback'}-${conversation._id}`,
      }, conversation.createdBy).catch(() => {});
    }
  }

  async _statusChangedByHumanSince(leadId, since) {
    try {
      const AuditLog = mongoose.models.AuditLog;
      if (!AuditLog || !since) return false;
      return Boolean(await AuditLog.exists({
        eventType: 'lead.updated', timestamp: { $gt: since },
        'details.leadId': { $in: [leadId, String(leadId)] }, 'details.changedFields': 'status',
      }));
    } catch { return false; }
  }

  // ------------------------------------------------------------- sweep
  /** Reply timeouts, reminders, lease recovery, crashed syncs, campaign completion. Idempotent. */
  async sweep(now = new Date()) {
    const result = { reminders: 0, expired: 0, resynced: 0, completedCampaigns: 0 };
    const lease = await this._recoverLeases(now);
    Object.assign(result, lease);

    const overdue = await SimSmsConversation.find({ state: 'awaiting_reply', replyDeadlineAt: { $lt: now } }).limit(200);
    for (const c of overdue) {
      const campaign = await SimSmsCampaign.findById(c.campaignId).lean();
      if (!campaign || campaign.status !== 'running') continue;
      if ((c.remindersSent || 0) < (campaign.settings?.maxReminders ?? 1)) {
        const { question } = openQuestion(campaign.questionnaire, engine.normalizeState(c.conversationState));
        const claimed = await SimSmsConversation.findOneAndUpdate(
          { _id: c._id, state: 'awaiting_reply', remindersSent: c.remindersSent || 0 },
          { $set: { state: 'awaiting_send', replyDeadlineAt: null }, $inc: { remindersSent: 1 } }, { returnDocument: 'after' },
        );
        if (claimed && question) { await this._queueOutbound(claimed, campaign, 'reminder', { question }); result.reminders += 1; }
      } else {
        const claimed = await SimSmsConversation.findOneAndUpdate(
          { _id: c._id, state: 'awaiting_reply' }, { $set: { state: 'expired', replyDeadlineAt: null } }, { returnDocument: 'after' },
        );
        if (claimed) { await this.processResults(c._id); result.expired += 1; }
      }
      await this.refreshSummary(c.campaignId);
    }

    const crashed = await SimSmsConversation.find({
      resultsProcessedAt: null, state: { $in: ['completed', 'stopped', 'expired'] },
      $or: [{ processingLeaseUntil: null }, { processingLeaseUntil: { $lt: now } }],
      updatedAt: { $lt: new Date(now.getTime() - 60_000) },
    }).select('_id').limit(100).lean();
    for (const c of crashed) { await this.processResults(c._id); result.resynced += 1; }

    const running = await SimSmsCampaign.find({ status: 'running' }).select('_id').lean();
    for (const campaign of running) {
      const active = await SimSmsConversation.exists({ campaignId: campaign._id, state: { $in: ACTIVE_CONVERSATION_STATES } });
      const unsent = await SimSmsMessage.exists({ campaignId: campaign._id, status: { $in: ['pending', 'leased', 'attempting'] } });
      if (!active && !unsent) {
        await SimSmsCampaign.updateOne({ _id: campaign._id, status: 'running' }, { $set: { status: 'completed', completedAt: now } });
        result.completedCampaigns += 1;
      }
    }
    return result;
  }

  async refreshSummary(campaignId) {
    const cid = new mongoose.Types.ObjectId(String(campaignId));
    const [states, quals, msgs] = await Promise.all([
      SimSmsConversation.aggregate([{ $match: { campaignId: cid } }, { $group: { _id: '$state', n: { $sum: 1 } } }]),
      SimSmsConversation.aggregate([{ $match: { campaignId: cid, qualification: { $ne: null } } }, { $group: { _id: '$qualification', n: { $sum: 1 } } }]),
      SimSmsMessage.aggregate([{ $match: { campaignId: cid } }, { $group: { _id: { d: '$direction', s: '$status' }, n: { $sum: 1 } } }]),
    ]);
    const s = Object.fromEntries(states.map((r) => [r._id, r.n]));
    const q = Object.fromEntries(quals.map((r) => [r._id, r.n]));
    const m = (d, st) => msgs.filter((r) => r._id.d === d && (!st || r._id.s === st)).reduce((a, r) => a + r.n, 0);
    const total = states.reduce((a, r) => a + r.n, 0);
    const summary = {
      total, eligible: total - (s.ineligible || 0), ineligible: s.ineligible || 0,
      active: (s.queued || 0) + (s.awaiting_send || 0) + (s.awaiting_reply || 0), awaitingReply: s.awaiting_reply || 0,
      completed: s.completed || 0, stopped: s.stopped || 0, expired: s.expired || 0,
      needsAttention: s.needs_attention || 0, failed: s.failed || 0,
      qualified: q.qualified || 0, review: q.review || 0,
      messagesSent: m('outbound', 'sent'), repliesReceived: m('inbound'),
    };
    // The most recent failure, unless a later message went out fine (then it's resolved).
    const [lastFailed, lastSent, nextRetry] = await Promise.all([
      SimSmsMessage.findOne({ campaignId: cid, direction: 'outbound', status: 'failed' }).sort({ attemptedAt: -1 }).select('failureCode attemptedAt').lean(),
      SimSmsMessage.findOne({ campaignId: cid, direction: 'outbound', status: 'sent' }).sort({ sentAt: -1 }).select('sentAt').lean(),
      SimSmsMessage.findOne({ campaignId: cid, direction: 'outbound', status: 'pending', notBefore: { $ne: null } }).sort({ notBefore: 1 }).select('notBefore').lean(),
    ]);
    summary.sendFailures = m('outbound', 'failed');
    summary.lastSendError = lastFailed && (!lastSent || lastSent.sentAt < lastFailed.attemptedAt)
      ? { code: lastFailed.failureCode, at: lastFailed.attemptedAt, nextRetryAt: nextRetry?.notBefore ?? null }
      : { code: null, at: null, nextRetryAt: null };
    const campaign = await SimSmsCampaign.findOneAndUpdate({ _id: cid }, { $set: { summary } }, { returnDocument: 'after' }).select('createdBy').lean();
    if (campaign) emit(campaign.createdBy, 'sim-sms:summary', { campaignId: String(cid), summary });
    return summary;
  }

  /** Human decision on a conversation parked by an unknown send result. */
  async resolveAttention(conversationId, actor, { action }) {
    const conversation = await SimSmsConversation.findOne({ _id: conversationId, createdBy: actor, state: 'needs_attention' });
    if (!conversation) throw new NotFoundError('SimSmsConversation', conversationId);
    if (action === 'resend') {
      const last = await SimSmsMessage.findOne({ conversationId, direction: 'outbound', status: 'unknown' }).sort({ createdAt: -1 }).lean();
      if (!last) throw new ValidationError('Nothing to resend');
      await SimSmsMessage.create({ ...last, _id: undefined, status: 'pending', deviceId: null, attemptedAt: null, sentAt: null, failureCode: null, createdAt: undefined, updatedAt: undefined });
      await SimSmsConversation.updateOne({ _id: conversationId }, { $set: { state: 'awaiting_send' } });
    } else if (action === 'mark_sent') {
      await SimSmsConversation.updateOne({ _id: conversationId }, { $set: { state: 'awaiting_reply', replyDeadlineAt: new Date(Date.now() + 48 * 3_600_000) } });
    } else {
      await SimSmsConversation.updateOne({ _id: conversationId }, { $set: { state: 'cancelled' } });
    }
    await this.refreshSummary(conversation.campaignId);
    return { resolved: action };
  }
}

export const __test__ = { leadDestination, communicationDisposition, openQuestion };
export default new SimSmsService();
