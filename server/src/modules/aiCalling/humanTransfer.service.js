import mongoose from 'mongoose';
import CallRecord from './callRecord.model.js';
import CallCampaign from './callCampaign.model.js';
import CallingAgent from './callingAgent.model.js';
import TransferPresence from './transferPresence.model.js';
import Lead from '../crm/lead.model.js';
import User from '../auth/user.model.js';
import auditService from '../auth/audit.service.js';
import notificationService from '../notifications/notification.service.js';
import logger from '../../shared/logger/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/AppError.js';
import { normalizeState } from './engine/questionEngine.js';
import {
  HANDOFF_FALLBACK, clampTimeout, fallbackScript, holdScript, selectTransferTargets,
  withinWorkingHours,
} from './engine/handoffPolicy.js';
import defaultProvider from './providers/humanTransfer.provider.js';

const TEST_PROVIDERS = new Set(['livekit_web', 'web_link_preview']);
const ACCEPTED_ACTIVE_MS = 2 * 3600_000;
const emit = (userId, event, payload) => { try { global.io?.to(`user:${userId}`).emit(event, payload); } catch { /* realtime is best-effort */ } };
const fullName = u => [u?.firstName, u?.lastName].filter(Boolean).join(' ') || u?.email || 'Team member';
const event = (type, userId = null, detail = '') => ({ at: new Date(), type, userId, detail: String(detail || '').slice(0, 500) });

/** Online = at least one connected socket in the user's room (works across nodes with the socket adapter). */
async function socketPresence(userIds) {
  const online = new Set();
  if (!global.io) return online;
  await Promise.all(userIds.map(async (id) => {
    try {
      const sockets = await Promise.race([
        global.io.in(`user:${id}`).fetchSockets(),
        new Promise((resolve) => { setTimeout(() => resolve([]), 2000); }),
      ]);
      if (sockets.length) online.add(String(id));
    } catch { /* unknown = offline: never ring someone we cannot reach */ }
  }));
  return online;
}

/**
 * Human transfer: the AI agent asks for a person, the CRM rings the agent's
 * configured, available, online, in-hours team members with a context card, and
 * the first to accept joins the call (web audio, or SIP transfer to their phone).
 * Nobody / no answer / provider failure → the agent reads a scripted fallback,
 * offers a callback, and a follow-up task is created for the owner after the call.
 */
class HumanTransferService {
  constructor() {
    this.provider = defaultProvider;
    this.presenceProbe = socketPresence;
    this.now = () => new Date();
  }

  // ---- presence (the person's own switch) ------------------------------------
  async getPresence(userId) {
    const doc = await TransferPresence.findOne({ userId }).lean();
    const online = await this.presenceProbe([String(userId)]);
    const presence = doc || { userId, available: false, phone: null, workingHours: { timezone: 'UTC' } };
    return { ...presence, online: online.has(String(userId)), withinHours: withinWorkingHours(presence.workingHours, this.now()) };
  }

  async setPresence(userId, { available, phone, workingHours }, meta = {}) {
    const set = { changedAt: new Date() };
    if (available !== undefined) set.available = Boolean(available);
    if (phone !== undefined) set.phone = phone ? String(phone).replace(/[\s-]/g, '') : null;
    if (workingHours !== undefined) set.workingHours = workingHours || { timezone: 'UTC' };
    await TransferPresence.updateOne({ userId }, { $set: set, $setOnInsert: { userId } }, { upsert: true });
    auditService.logEvent({ eventType: 'ai_calling.transfer.presence', module: 'ai-calling', userId, result: 'success', ipAddress: meta.ipAddress || 'internal', userAgent: meta.userAgent, details: { available: set.available } });
    const presence = await this.getPresence(userId);
    emit(userId, 'ai-calling:transfer-presence', { available: presence.available });
    return presence;
  }

  /** People an owner can pick as transfer targets, with their current reachability. */
  async listTargets() {
    const users = await User.find({ status: 'active' }).select('firstName lastName email').sort({ firstName: 1, lastName: 1 }).limit(300).lean();
    const ids = users.map(u => String(u._id));
    const [presences, online] = await Promise.all([TransferPresence.find({ userId: { $in: ids } }).lean(), this.presenceProbe(ids)]);
    const byUser = new Map(presences.map(p => [String(p.userId), p]));
    const now = this.now();
    return users.map(u => {
      const p = byUser.get(String(u._id));
      return { _id: u._id, name: fullName(u), email: u.email, available: Boolean(p?.available), online: online.has(String(u._id)), withinHours: withinWorkingHours(p?.workingHours, now), hasPhone: Boolean(p?.phone) };
    });
  }

  async setAgentTransfer(agentId, actor, { enabled, targetUserIds = [], timeoutSeconds, allowPhoneTransfer = true, version }, meta = {}) {
    const ids = [...new Set(targetUserIds.map(String))];
    if (enabled && !ids.length) throw new ValidationError('Choose at least one team member to receive transfers');
    if (ids.length) {
      const found = await User.countDocuments({ _id: { $in: ids }, status: 'active' });
      if (found !== ids.length) throw new ValidationError('Some selected team members are not active users');
    }
    const updated = await CallingAgent.findOneAndUpdate({ _id: agentId, createdBy: actor, ...(version != null ? { version } : {}) }, {
      $set: { transfer: { enabled: Boolean(enabled), targetUserIds: ids, timeoutSeconds: clampTimeout(timeoutSeconds), allowPhoneTransfer: Boolean(allowPhoneTransfer) }, updatedBy: actor },
      $inc: { version: 1 },
    }, { returnDocument: 'after' }).lean();
    if (!updated) throw new ConflictError('Agent changed or was not found. Reload before saving');
    auditService.logEvent({ eventType: 'ai_calling.agent.transfer_configured', module: 'ai-calling', userId: actor, result: 'success', ipAddress: meta.ipAddress || 'internal', userAgent: meta.userAgent, details: { agentId: String(agentId), enabled: Boolean(enabled), targets: ids.length } });
    return { transfer: updated.transfer, version: updated.version };
  }

  /** Transfer config for a call (via its campaign's agent); null when the agent has none. */
  async configForCampaign(campaign) {
    if (!campaign?.agentId) return null;
    const agent = await CallingAgent.findById(campaign.agentId).select('transfer').lean();
    return agent?.transfer?.enabled && agent.transfer.targetUserIds?.length ? agent.transfer : null;
  }

  async _offerCard(call, campaign) {
    const lead = await Lead.findById(call.leadId).select('leadNumber name status address').lean();
    const state = normalizeState(call.conversationState);
    const questions = new Map((campaign?.questionnaire?.questions || []).map(q => [q.fieldKey, q.label || q.fieldKey]));
    const captured = Object.entries(state.answers || {}).filter(([, a]) => a?.validation === 'valid')
      .map(([fieldKey, a]) => ({ fieldKey, label: questions.get(fieldKey) || fieldKey, value: a.rawAnswer || String(a.normalizedValue ?? '') })).slice(0, 20);
    return {
      recordId: String(call._id), callId: call.internalCallId,
      agentName: campaign?.agentSnapshot?.name || campaign?.agentConfig?.agentName || 'AI agent',
      campaignName: campaign?.name || '',
      lead: lead ? { _id: String(lead._id), name: lead.name, leadNumber: lead.leadNumber, city: lead.address?.city || null, status: lead.status } : null,
      reason: call.handoff?.reason || '', summary: call.handoff?.summary || '',
      transcript: (call.transcript || []).slice(-12).map(t => ({ role: t.role, text: t.text, at: t.at })),
      captured,
      extracted: (call.intelligence?.items || []).filter(i => !String(i.status).endsWith('rejected')).slice(0, 12).map(i => ({ category: i.category, value: i.value, quote: i.quote })),
      expiresAt: call.handoff?.expiresAt || null,
    };
  }

  // ---- worker side (per-call token) ----------------------------------------
  async _loadLive(internalCallId) {
    const call = await CallRecord.findOne({ internalCallId });
    if (!call) throw new NotFoundError('CallRecord', internalCallId);
    const campaign = await CallCampaign.findById(call.campaignId).lean();
    return { call, campaign };
  }

  _fallbackFor(campaign) {
    return fallbackScript(campaign?.agentConfig?.language, { company: campaign?.agentConfig?.organizationName });
  }

  _publicStatus(handoff, campaign, extra = {}) {
    const fallback = HANDOFF_FALLBACK.has(handoff?.status) ? (handoff.fallback?.script ? { script: handoff.fallback.script, language: handoff.fallback.language } : this._fallbackFor(campaign)) : null;
    return {
      status: handoff?.status || 'none', mode: handoff?.mode || null, expiresAt: handoff?.expiresAt || null,
      targetName: extra.targetName || null, fallback: fallback ? { script: fallback.script || fallback.text, language: fallback.language } : null,
      ...extra,
    };
  }

  async _finishWithFallback(callId, campaign, status, { reason = null, failure = null, from = ['ringing'] } = {}) {
    const fb = this._fallbackFor(campaign);
    const now = this.now();
    const updated = await CallRecord.findOneAndUpdate({ _id: callId, 'handoff.status': { $in: from } }, {
      $set: {
        'handoff.status': status, 'handoff.completedAt': now,
        'handoff.fallback.script': fb.text, 'handoff.fallback.language': fb.language, 'handoff.fallback.offeredAt': now,
        ...(failure ? { 'handoff.failure': failure } : {}),
      },
      $push: { 'handoff.events': { $each: [event(status, null, reason || failure?.message || ''), event('fallback_offered', null, fb.language)] } },
    }, { returnDocument: 'after' }).lean();
    if (updated) for (const userId of updated.handoff.offeredTo || []) emit(userId, 'ai-calling:transfer-closed', { recordId: String(callId), status });
    return updated;
  }

  /** Worker tool: the agent asks for a person. Idempotent per call (one transfer attempt). */
  async requestTransfer(internalCallId, { reason = '', summary = '' } = {}) {
    const { call, campaign } = await this._loadLive(internalCallId);
    if (call.handoff?.requestedAt) {
      return this._publicStatus(call.handoff, campaign, { repeated: true, hold: holdScript(campaign?.agentConfig?.language) });
    }
    if (call.endedAt || call.resultsProcessedAt) throw new ConflictError('This call has already ended');
    const now = this.now();
    const config = await this.configForCampaign(campaign);
    const base = { requestedAt: now, reason: String(reason).slice(0, 500), summary: String(summary).slice(0, 2000), offeredTo: [], declinedBy: [], skipped: [], events: [event('requested', null, reason)] };
    const fb = this._fallbackFor(campaign);
    const unavailable = async (code, skipped = []) => {
      const handoff = { ...base, status: 'unavailable', skipped, completedAt: now, failure: { code, message: null },
        fallback: { script: fb.text, language: fb.language, offeredAt: now }, events: [...base.events, event('unavailable', null, code), event('fallback_offered', null, fb.language)] };
      const written = await CallRecord.findOneAndUpdate({ _id: call._id, 'handoff.requestedAt': { $in: [null] } }, { $set: { handoff: handoff } }, { returnDocument: 'after' }).lean();
      return this._publicStatus((written || await CallRecord.findById(call._id).lean()).handoff, campaign, { reason: code });
    };
    if (!config) return unavailable('NOT_CONFIGURED');
    const caps = this.provider.capabilities(call, { phone: 'probe', allowPhoneTransfer: config.allowPhoneTransfer !== false });
    if (!caps.web && !caps.phone) return unavailable('TRANSPORT_UNSUPPORTED');

    const targets = config.targetUserIds.map(String);
    const [presences, online, busyRows] = await Promise.all([
      TransferPresence.find({ userId: { $in: targets } }).lean(),
      this.presenceProbe(targets),
      CallRecord.find({ 'handoff.targetUserId': { $in: targets }, 'handoff.status': 'accepted', 'handoff.completedAt': null, 'handoff.acceptedAt': { $gt: new Date(now.getTime() - ACCEPTED_ACTIVE_MS) }, _id: { $ne: call._id } }).select('handoff.targetUserId').lean(),
    ]);
    const { eligible, skipped } = selectTransferTargets({ targetUserIds: targets, presences, online, busy: new Set(busyRows.map(r => String(r.handoff.targetUserId))), now });
    if (!eligible.length) return unavailable('NO_AVAILABLE_HUMAN', skipped);

    const timeoutSeconds = clampTimeout(config.timeoutSeconds);
    const handoff = { ...base, status: 'ringing', offeredTo: eligible.map(e => new mongoose.Types.ObjectId(e.userId)), skipped, expiresAt: new Date(now.getTime() + timeoutSeconds * 1000),
      events: [...base.events, ...eligible.map(e => event('offered', e.userId))] };
    const written = await CallRecord.findOneAndUpdate({ _id: call._id, 'handoff.requestedAt': { $in: [null] }, endedAt: null }, { $set: { handoff } }, { returnDocument: 'after' }).lean();
    if (!written) {
      const latest = await CallRecord.findById(call._id).lean();
      if (latest?.handoff) return this._publicStatus(latest.handoff, campaign, { repeated: true });
      throw new ConflictError('This call has already ended');
    }
    const card = await this._offerCard(written, campaign);
    const presenceByUser = new Map(presences.map(p => [String(p.userId), p]));
    for (const target of eligible) {
      const modes = this.provider.capabilities(written, { phone: presenceByUser.get(target.userId)?.phone, allowPhoneTransfer: config.allowPhoneTransfer !== false });
      emit(target.userId, 'ai-calling:transfer-offer', { ...card, modes });
    }
    logger.info('AI call transfer requested', { module: 'ai-calling', callId: internalCallId, offered: eligible.length, skipped: skipped.length });
    return { status: 'ringing', expiresAt: handoff.expiresAt, timeoutSeconds, offered: eligible.length, hold: holdScript(campaign?.agentConfig?.language), fallback: null };
  }

  /** Worker poll: current outcome; enforces the ring timeout server-side. */
  async transferStatus(internalCallId) {
    const { call, campaign } = await this._loadLive(internalCallId);
    let handoff = call.handoff;
    if (!handoff?.requestedAt) return { status: 'none' };
    if (handoff.status === 'ringing' && handoff.expiresAt && handoff.expiresAt <= this.now()) {
      const updated = await this._finishWithFallback(call._id, campaign, 'timeout', { reason: 'Nobody accepted in time' });
      handoff = updated?.handoff || (await CallRecord.findById(call._id).lean()).handoff;
    }
    let targetName = null;
    if (handoff.targetUserId) targetName = fullName(await User.findById(handoff.targetUserId).select('firstName lastName email').lean());
    return this._publicStatus(handoff, campaign, { targetName, joinedAt: handoff.joinedAt || null });
  }

  /** Worker: the accepted person chose their phone; perform the SIP transfer now (after the agent's handover line). */
  async executePhoneTransfer(internalCallId) {
    const { call, campaign } = await this._loadLive(internalCallId);
    const h = call.handoff;
    if (h?.status !== 'accepted' || h.mode !== 'phone') throw new ConflictError('No accepted phone transfer is waiting');
    if (h.joinedAt) return { status: 'transferred' };
    const presence = await TransferPresence.findOne({ userId: h.targetUserId }).lean();
    const result = await this.provider.transferSip({ roomName: call.roomName, participantIdentity: `sip-${internalCallId}`, phone: presence?.phone });
    if (result.ok) {
      await CallRecord.updateOne({ _id: call._id, 'handoff.joinedAt': null }, { $set: { 'handoff.joinedAt': this.now() }, $push: { 'handoff.events': event('sip_transferred', h.targetUserId) } });
      return { status: 'transferred' };
    }
    const updated = await this._finishWithFallback(call._id, campaign, 'failed', { failure: { code: result.code, message: result.message }, from: ['accepted'] });
    emit(h.targetUserId, 'ai-calling:transfer-closed', { recordId: String(call._id), status: 'failed', message: result.message });
    logger.warn('SIP transfer failed', { module: 'ai-calling', callId: internalCallId, code: result.code });
    return this._publicStatus(updated?.handoff || { ...h, status: 'failed' }, campaign, { failure: result.code });
  }

  /** Worker or the person's browser: the human is in the room. */
  async markJoined(filter, userId = null) {
    await CallRecord.updateOne({ ...filter, 'handoff.status': 'accepted', 'handoff.joinedAt': null }, { $set: { 'handoff.joinedAt': this.now() }, $push: { 'handoff.events': event('joined', userId) } });
    return { acknowledged: true };
  }

  // ---- the person receiving the offer -----------------------------------------
  async listOffers(actor) {
    const rows = await CallRecord.find({ 'handoff.status': 'ringing', 'handoff.offeredTo': actor, 'handoff.declinedBy': { $ne: actor }, 'handoff.expiresAt': { $gt: this.now() }, endedAt: null }).limit(10).lean();
    const presence = await TransferPresence.findOne({ userId: actor }).lean();
    return Promise.all(rows.map(async (call) => {
      const campaign = await CallCampaign.findById(call.campaignId).lean();
      const config = await this.configForCampaign(campaign);
      return { ...await this._offerCard(call, campaign), modes: this.provider.capabilities(call, { phone: presence?.phone, allowPhoneTransfer: config?.allowPhoneTransfer !== false }) };
    }));
  }

  async accept(recordId, actor, { mode = 'web' } = {}, meta = {}) {
    const call = await CallRecord.findById(recordId).lean();
    if (!call?.handoff) throw new NotFoundError('Transfer', recordId);
    const campaign = await CallCampaign.findById(call.campaignId).lean();
    const config = await this.configForCampaign(campaign);
    const presence = await TransferPresence.findOne({ userId: actor }).lean();
    const caps = this.provider.capabilities(call, { phone: presence?.phone, allowPhoneTransfer: config?.allowPhoneTransfer !== false });
    if (!caps[mode]) throw new ValidationError(mode === 'phone' ? 'Phone transfer is not available for this call (needs a SIP call, a configured trunk and your phone number)' : 'Joining from the CRM is not available for this call');
    let join = null;
    if (mode === 'web') {
      join = this.provider.joinToken({ roomName: call.roomName, userId: actor, name: fullName(await User.findById(actor).select('firstName lastName email').lean()) });
      if (!join.ok) throw new ValidationError(join.message);
    }
    const now = this.now();
    const updated = await CallRecord.findOneAndUpdate({
      _id: recordId, endedAt: null, 'handoff.status': 'ringing', 'handoff.offeredTo': actor, 'handoff.declinedBy': { $ne: actor }, 'handoff.expiresAt': { $gt: now },
    }, {
      $set: { 'handoff.status': 'accepted', 'handoff.targetUserId': actor, 'handoff.acceptedAt': now, 'handoff.mode': mode },
      $push: { 'handoff.events': event('accepted', actor, mode) },
    }, { returnDocument: 'after' }).lean();
    if (!updated) {
      const latest = await CallRecord.findById(recordId).select('handoff endedAt').lean();
      const why = latest?.endedAt ? 'The call has already ended' : latest?.handoff?.status === 'accepted' ? 'A colleague already accepted this transfer' : 'This transfer is no longer waiting';
      throw new ConflictError(why);
    }
    for (const userId of updated.handoff.offeredTo || []) if (String(userId) !== String(actor)) emit(userId, 'ai-calling:transfer-closed', { recordId: String(recordId), status: 'taken' });
    auditService.logEvent({ eventType: 'ai_calling.transfer.accepted', module: 'ai-calling', userId: actor, result: 'success', ipAddress: meta.ipAddress || 'internal', userAgent: meta.userAgent, details: { callId: String(recordId), mode } });
    return { status: 'accepted', mode, ...(join ? { join: { url: join.url, token: join.token, roomName: join.roomName, identity: join.identity } } : {}) };
  }

  async decline(recordId, actor, meta = {}) {
    const updated = await CallRecord.findOneAndUpdate({ _id: recordId, 'handoff.status': 'ringing', 'handoff.offeredTo': actor }, {
      $addToSet: { 'handoff.declinedBy': actor }, $push: { 'handoff.events': event('declined', actor) },
    }, { returnDocument: 'after' }).lean();
    if (!updated) throw new ConflictError('This transfer is no longer waiting');
    emit(actor, 'ai-calling:transfer-closed', { recordId: String(recordId), status: 'declined' });
    const declined = new Set((updated.handoff.declinedBy || []).map(String));
    if ((updated.handoff.offeredTo || []).every(id => declined.has(String(id)))) {
      const campaign = await CallCampaign.findById(updated.campaignId).lean();
      await this._finishWithFallback(recordId, campaign, 'declined', { reason: 'Everyone declined' });
    }
    auditService.logEvent({ eventType: 'ai_calling.transfer.declined', module: 'ai-calling', userId: actor, result: 'success', ipAddress: meta.ipAddress || 'internal', userAgent: meta.userAgent, details: { callId: String(recordId) } });
    return { declined: true };
  }

  // ---- after the call ----------------------------------------------------------
  /**
   * Post-call (from processCallResults): close a transfer still ringing, stamp a
   * finished human conversation, and for a failed transfer create the follow-up
   * (once — claimed atomically) and tell the owner.
   */
  async afterCall(callId) {
    let call = await CallRecord.findById(callId).lean();
    if (!call?.handoff?.requestedAt) return { handoff: false };
    const campaign = await CallCampaign.findById(call.campaignId).lean();
    if (call.handoff.status === 'ringing') call = await this._finishWithFallback(call._id, campaign, 'timeout', { reason: 'The call ended before anyone accepted' }) || await CallRecord.findById(callId).lean();
    if (call.handoff.status === 'accepted' && !call.handoff.joinedAt) {
      // Accepted, but the person never reached the caller (web join or SIP transfer did not happen).
      call = await this._finishWithFallback(call._id, campaign, 'failed', { failure: { code: 'HUMAN_NEVER_JOINED', message: 'The person accepted but never joined the call' }, from: ['accepted'] }) || await CallRecord.findById(callId).lean();
    }
    if (call.handoff.status === 'accepted') {
      await CallRecord.updateOne({ _id: callId, 'handoff.completedAt': null }, { $set: { 'handoff.completedAt': call.endedAt || this.now() }, $push: { 'handoff.events': event('completed') } });
      return { handoff: true, status: 'accepted' };
    }
    if (!HANDOFF_FALLBACK.has(call.handoff.status)) return { handoff: true, status: call.handoff.status };
    const claimed = await CallRecord.findOneAndUpdate({ _id: callId, 'handoff.fallback.followUp.state': { $in: [null] } }, { $set: { 'handoff.fallback.followUp.state': 'creating', 'handoff.fallback.followUp.at': this.now() } }, { returnDocument: 'after' }).lean();
    if (!claimed) return { handoff: true, status: call.handoff.status, followUp: 'already_handled' };
    const control = normalizeState(claimed.conversationState).control || {};
    const preferredTime = [control.callbackRequestedAt, control.callbackText].filter(Boolean).join(' · ').slice(0, 300) || null;
    const lead = await Lead.findById(claimed.leadId).select('name leadNumber').lean();
    const owner = claimed.createdBy;
    const isTest = Boolean(campaign?.isTest || claimed.isTest || TEST_PROVIDERS.has(claimed.provider));
    let followUp = { state: 'skipped', kind: null, id: null, preferredTime, reason: 'test_call' };
    if (!isTest) {
      try {
        // Lands in the unified follow-up inbox. Without an exact requested time it
        // is due now (never a guessed time); the stated text is kept verbatim.
        const { default: leadFollowUpService } = await import('../crm/leadFollowUp.service.js');
        const exact = control.callbackRequestedAt && !Number.isNaN(Date.parse(control.callbackRequestedAt)) ? new Date(control.callbackRequestedAt) : null;
        const fullLead = await Lead.findById(claimed.leadId).select('assignedTo').lean();
        const doc = await leadFollowUpService.upsertFromSource({
          sourceKey: `ai_call_transfer:${claimed._id}`,
          leadId: claimed.leadId,
          ownerId: fullLead?.assignedTo || owner,
          dueAt: exact || claimed.endedAt || this.now(),
          channel: 'phone',
          note: [
            `AI call transfer not completed (${claimed.handoff.status.replaceAll('_', ' ')}).`,
            claimed.handoff.reason ? `Reason given: ${claimed.handoff.reason}` : null,
            claimed.handoff.summary ? `Agent summary: ${claimed.handoff.summary}` : null,
          ].filter(Boolean).join(' '),
          source: { type: 'ai_call', callRecordId: claimed._id, requestedTimeText: exact ? null : (preferredTime || null) },
        });
        followUp = { state: 'created', kind: 'follow_up', id: doc?._id || null, preferredTime, reason: null };
      } catch (error) {
        logger.warn('Transfer follow-up failed', { module: 'ai-calling', callId: String(callId), error: error.message });
        followUp = { state: 'failed', kind: 'follow_up', id: null, preferredTime, reason: String(error.message).slice(0, 300) };
      }
    }
    await CallRecord.updateOne({ _id: callId }, { $set: { 'handoff.fallback.followUp': { ...followUp, at: this.now() } }, $push: { 'handoff.events': event(`follow_up_${followUp.state}`, null, followUp.reason || '') } });
    notificationService.create({
      channels: ['IN_APP'], recipientIds: [owner], type: 'ai_calling.transfer_fallback', category: 'CRM', priority: 'HIGH',
      payload: {
        title: `Transfer not completed: ${lead?.name || 'AI call'}`,
        message: `Nobody took the call (${claimed.handoff.status}). Preferred callback time: ${preferredTime || 'not stated'}.${followUp.state === 'created' ? ' A follow-up was added to the inbox.' : ''}`,
        callId: String(callId), leadId: String(claimed.leadId),
      },
      sourceModule: 'ai-calling', sourceEvent: 'TRANSFER_FALLBACK', sourceEntityType: 'CallRecord', sourceEntityId: claimed._id,
      idempotencyKey: `ai-call-transfer-fallback-${callId}`,
    }, owner).catch((e) => logger.warn('transfer fallback notification failed', { module: 'ai-calling', error: e.message }));
    emit(owner, 'ai-calling:call', { campaignId: String(claimed.campaignId), callId: claimed.internalCallId, handoff: claimed.handoff.status });
    return { handoff: true, status: claimed.handoff.status, followUp: followUp.state };
  }
}

export default new HumanTransferService();
