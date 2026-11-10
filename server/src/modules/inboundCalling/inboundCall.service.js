/**
 * Incoming Call Orchestrator — the ONE place that moves an incoming call through its lifecycle.
 *
 *   phone rings ─HFP RING/+CLIP─▶ ESP32 ─USB─▶ gateway ── POST /gateway/inbound/ring ──▶ ring()
 *       ring(): persist session (idempotent) → identify caller → rules → one decision
 *         • ai_answer: dispatch the voice agent into `inbound-<id>`; the gateway joins as
 *           `sip-<id>`, waits for the agent, answers (ATA) and bridges the call audio
 *         • human / ignore: the phone keeps ringing; the gateway still reports what happened
 *   gateway events (idempotent) ── gatewayEvent() ──▶ state machine (answered, audio, ended…)
 *   voice agent tools ── agent*() ──▶ caller info, questions, intent, callback, handoff, transcript
 *   ended + agent done (or sweep) ── finalize(): outcome → intents → qualification →
 *       recommendations → lead create/update → follow-ups → notifications (exactly once)
 *
 * Invariants:
 *   - one session per ring (unique dedupeKey), one AI session per call (only ring() dispatches);
 *   - status only moves along engine/stateMachine.js; replays and stale events are ignored;
 *   - every caller detail is persisted when it is said, so an interrupted call keeps it;
 *   - "AI connected" requires the agent session AND an open audio link;
 *   - nothing is sent to the caller (SMS/e-mail) automatically; tasks are internal.
 */

import { leadActiveCall } from '../aiCalling/leadCallLock.js';
import crypto from 'node:crypto';
import mongoose from 'mongoose';

import InboundCall from './inboundCall.model.js';
import InboundSettings from './inboundSettings.model.js';
import InboundCallEvent from './inboundCallEvent.model.js';
import CallingAgent from '../aiCalling/callingAgent.model.js';
import CallSuppression from '../aiCalling/callSuppression.model.js';
import PairedDevice from '../pairedPhone/pairedDevice.model.js';
import Lead, { LEAD_STATUS, LEAD_SOURCE, LEAD_TYPE } from '../crm/lead.model.js';
import livekit from '../aiCalling/providers/livekitSip.provider.js';
import { providerSettings } from '../aiCalling/voiceProvider.service.js';
import knowledgeService from '../aiCalling/knowledge.service.js';
import { buildKnowledgeSection } from '../aiCalling/engine/knowledgeCompliance.js';
import { phoneHash } from '../aiCalling/callAuth.js';
import notificationService from '../notifications/notification.service.js';
import auditService from '../auth/audit.service.js';
import logger from '../../shared/logger/index.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import { ConflictError, NotFoundError, ServiceUnavailableError, ValidationError } from '../../shared/errors/AppError.js';

import {
  planTransition, TERMINAL_STATUSES, RINGING_STATUSES, LIVE_STATUSES, ACTIVE_STATUSES, deriveOutcome, endStatusFor,
} from './engine/stateMachine.js';
import { parseCallerNumber, classifyMatch, nationalTail } from './engine/callerMatch.js';
import { decideHandling, RULE_ACTIONS } from './engine/ruleEngine.js';
import { resolveIntents, normalizeCategory, classifyText } from './engine/intents.js';
import { evaluateQualification } from './engine/qualification.js';
import { recommend, ACTION_FOLLOW_UP } from './engine/recommendations.js';
import { buildReceptionistPrompt, buildGreeting, CALLER_FIELDS, CALLER_FIELD_KEYS } from './engine/receptionistPrompt.js';
import { issueInboundAgentToken } from './inboundAuth.js';
import { priceInboundCall } from './inboundCost.service.js';
import { autoWorkStatus } from './engine/workStatus.js';
import { normalizeQuestions, validateAnswer, STANDARD_KEYS } from './engine/closingQuestions.js';
import User from '../auth/user.model.js';

const aiCalling = () => import('../aiCalling/aiCalling.service.js').then((m) => m.default);
const leadService = () => import('../crm/lead.service.js').then((m) => m.default);
const followUps = () => import('../crm/leadFollowUp.service.js').then((m) => m.default);
const qualificationService = () => import('../crm/leadQualification.service.js').then((m) => m.default);
const pairedPhone = () => import('../pairedPhone/pairedPhone.service.js').then((m) => m.default);

const PROCESSING_LEASE_MS = 60_000;
const AGENT_END_GRACE_MS = 20_000;
const PROTECTED_LEAD_STATUSES = new Set([LEAD_STATUS.CONVERTED, LEAD_STATUS.QUALIFIED]);
const escapeRegex = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const GATEWAY_EVENT_TYPES = Object.freeze([
  'ringing', 'answering', 'answered', 'answered_elsewhere', 'audio_opened', 'audio_lost', 'agent_unavailable',
  'command_done', 'ended', 'outcome_unknown', 'stats',
]);

function emit(ownerId, event, payload) {
  try { global.io?.to(`user:${ownerId}`).emit(event, payload); } catch { /* realtime is best-effort */ }
}

function apiBase() {
  return process.env.PUBLIC_API_BASE_URL || `http://localhost:${process.env.PORT || 9097}`;
}

const activeFields = (call) => (call.fields || []).filter((f) => !f.supersededAt && f.verification !== 'rejected');
const fieldValue = (call, key) => activeFields(call).find((f) => f.key === key)?.value || null;

class InboundCallService {
  // ================================================================== settings

  async getSettings(owner) {
    const doc = await InboundSettings.findOneAndUpdate(
      { createdBy: owner },
      { $setOnInsert: { createdBy: owner } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    ).lean();
    return doc;
  }

  async updateSettings(owner, patch, meta = {}) {
    const current = await this.getSettings(owner);
    // Rules are edited only through saveRule/deleteRule.
    const { version, rules: _rules, ...changes } = patch;
    if (version != null && version !== current.version) throw new ConflictError('Incoming call settings changed elsewhere. Reload before saving.');
    if (changes.blockedNumbers) changes.blockedNumbers = this._normalizeNumbers(changes.blockedNumbers, changes.defaultRegion || current.defaultRegion);
    for (const id of [changes.defaultAgentId, ...(changes.deviceAgents || []).map((d) => d.agentId)].filter(Boolean)) await this._assertAgent(owner, id);
    for (const row of changes.deviceAgents || []) await this._assertDevice(owner, row.deviceId);
    const set = {};
    for (const [k, v] of Object.entries(changes)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof mongoose.Types.ObjectId)) {
        for (const [k2, v2] of Object.entries(v)) set[`${k}.${k2}`] = v2;
      } else set[k] = v;
    }
    const updated = await InboundSettings.findOneAndUpdate(
      { createdBy: owner, version: current.version },
      { $set: { ...set, updatedBy: owner }, $inc: { version: 1 } },
      { returnDocument: 'after', runValidators: true },
    ).lean();
    if (!updated) throw new ConflictError('Incoming call settings changed elsewhere. Reload before saving.');
    this._audit('inbound_calls.settings_updated', owner, meta, { keys: Object.keys(changes) });
    emit(owner, 'inbound-call:settings', { version: updated.version, enabled: updated.enabled });
    return updated;
  }

  async saveRule(owner, input, meta = {}) {
    const settings = await this.getSettings(owner);
    if (!RULE_ACTIONS.includes(input.action)) throw new ValidationError('Unknown rule action');
    if (input.agentId) await this._assertAgent(owner, input.agentId);
    for (const id of input.conditions?.deviceIds || []) await this._assertDevice(owner, id);
    const rule = {
      id: input.id || crypto.randomUUID(),
      name: input.name,
      enabled: input.enabled !== false,
      priority: input.priority ?? 100,
      conditions: {
        callerType: input.conditions?.callerType || 'any',
        numbers: this._normalizeNumbers(input.conditions?.numbers || [], settings.defaultRegion),
        numberPrefixes: (input.conditions?.numberPrefixes || []).map((p) => String(p).replace(/[^\d+]/g, '')).filter(Boolean),
        deviceIds: input.conditions?.deviceIds || [],
        simSlots: input.conditions?.simSlots || [],
        withinBusinessHours: typeof input.conditions?.withinBusinessHours === 'boolean' ? input.conditions.withinBusinessHours : null,
        leadStatuses: input.conditions?.leadStatuses || [],
      },
      action: input.action,
      agentId: input.action === 'ai_answer' ? (input.agentId || null) : null,
      createdAt: new Date(),
    };
    const exists = (settings.rules || []).some((r) => r.id === rule.id);
    if (!exists && (settings.rules || []).length >= 50) throw new ValidationError('At most 50 incoming call rules');
    const update = exists
      ? { $set: { 'rules.$[r]': { ...rule, createdAt: settings.rules.find((r) => r.id === rule.id).createdAt }, updatedBy: owner }, $inc: { version: 1 } }
      : { $push: { rules: rule }, $set: { updatedBy: owner }, $inc: { version: 1 } };
    const updated = await InboundSettings.findOneAndUpdate({ createdBy: owner }, update, {
      returnDocument: 'after', runValidators: true, ...(exists ? { arrayFilters: [{ 'r.id': rule.id }] } : {}),
    }).lean();
    this._audit(exists ? 'inbound_calls.rule_updated' : 'inbound_calls.rule_created', owner, meta, { ruleId: rule.id, action: rule.action });
    return updated;
  }

  async deleteRule(owner, ruleId, meta = {}) {
    const updated = await InboundSettings.findOneAndUpdate({ createdBy: owner }, { $pull: { rules: { id: ruleId } }, $inc: { version: 1 } }, { returnDocument: 'after' }).lean();
    this._audit('inbound_calls.rule_deleted', owner, meta, { ruleId });
    return updated;
  }

  /** Dry run: what would happen if this number called now. Nothing is persisted. */
  async testRules(owner, { number = '', deviceId = null, simSlot = null, at = null }) {
    const settings = await this.getSettings(owner);
    const caller = parseCallerNumber(number, settings.defaultRegion);
    const match = await this._identify(caller, settings.defaultRegion);
    const device = deviceId ? await PairedDevice.findOne({ _id: deviceId, createdBy: owner, deletedAt: null }).lean() : null;
    const availability = await this._availability(owner, settings, deviceId ? [deviceId] : []);
    const decision = decideHandling({
      settings, caller, match, now: at ? new Date(at) : new Date(), availability,
      device: { id: device?._id || deviceId, simSlot, audioVerified: device ? Boolean(device.audioVerifiedAt) : true },
    });
    return { caller: { e164: caller.e164, presentation: caller.presentation }, match: { status: match.status, leadIds: match.leadIds }, decision };
  }

  _normalizeNumbers(list, region) {
    return [...new Set((list || []).map((n) => parseCallerNumber(String(n), region).e164).filter(Boolean))].slice(0, 500);
  }

  async _assertAgent(owner, agentId) {
    if (!mongoose.isValidObjectId(agentId) || !await CallingAgent.exists({ _id: agentId, createdBy: owner, availability: { $ne: 'archived' } })) {
      throw new ValidationError('Choose one of your calling agents');
    }
  }

  async _assertDevice(owner, deviceId) {
    if (!mongoose.isValidObjectId(deviceId) || !await PairedDevice.exists({ _id: deviceId, createdBy: owner, deletedAt: null })) {
      throw new ValidationError('Choose one of your connected phones');
    }
  }

  /** The Android app on the paired phone reports its SIM cards (owner session, owner's device only). */
  async reportSims(owner, deviceId, { sims = [] }, meta = {}) {
    await this._assertDevice(owner, deviceId);
    const clean = [...new Map(sims.map((s) => [s.slot, { slot: s.slot, label: String(s.label || '').slice(0, 80), carrier: String(s.carrier || '').slice(0, 80) }])).values()].sort((a, b) => a.slot - b.slot);
    await PairedDevice.updateOne({ _id: deviceId, createdBy: owner }, { $set: { sims: clean, simsReportedAt: new Date() } });
    // Per-SIM agent rows for a SIM that no longer exists would never match: drop them.
    const slots = new Set(clean.map((s) => s.slot));
    const settings = await this.getSettings(owner);
    const stale = (settings.deviceAgents || []).filter((r) => String(r.deviceId) === String(deviceId) && r.simSlot != null && !slots.has(r.simSlot));
    if (stale.length && clean.length) {
      await InboundSettings.updateOne({ createdBy: owner }, { $pull: { deviceAgents: { deviceId: new mongoose.Types.ObjectId(String(deviceId)), simSlot: { $in: stale.map((r) => r.simSlot) } } }, $inc: { version: 1 } });
    }
    this._audit('inbound_calls.sims_reported', owner, meta, { deviceId: String(deviceId), sims: clean.length });
    emit(owner, 'paired-phone:device', { deviceId: String(deviceId), event: 'sims' });
    return { sims: clean, removedSimAgents: stale.length && clean.length ? stale.length : 0 };
  }

  // ================================================================== identification

  async _identify(caller, region) {
    if (!caller.e164) return { status: 'unknown', leadId: null, leadIds: [], leadStatus: null, doNotContact: false };
    const tail = nationalTail(caller.e164);
    const or = [{ normalizedPhone: caller.e164 }];
    if (tail) {
      const loose = new RegExp(`${tail.split('').map(escapeRegex).join('\\D*')}\\s*$`);
      or.push({ phone: loose }, { mobile: loose });
    }
    const candidates = await Lead.find({ isDeleted: { $ne: true }, $or: or })
      .select('_id name status phone mobile normalizedPhone assignedTo').limit(20).lean();
    const result = classifyMatch(caller.e164, candidates, region);
    const lead = result.leadId ? candidates.find((c) => String(c._id) === result.leadId) : null;
    const doNotContact = Boolean(await CallSuppression.exists({ phoneHash: phoneHash(caller.e164) }));
    return { ...result, leadStatus: lead?.status || null, leadName: lead?.name || null, assignedTo: lead?.assignedTo || null, doNotContact };
  }

  async _availability(owner, settings, deviceIds = []) {
    const agentIds = [settings.defaultAgentId, ...(settings.deviceAgents || []).map((d) => d.agentId), ...(settings.rules || []).map((r) => r.agentId)]
      .filter(Boolean).map(String);
    const [agents, activeAiSessions, voicePaused] = await Promise.all([
      agentIds.length ? CallingAgent.find({ _id: { $in: [...new Set(agentIds)] }, createdBy: owner }).select('_id availability name').lean() : [],
      InboundCall.countDocuments({ createdBy: owner, 'handling.mode': 'ai', processedAt: null, status: { $in: [...ACTIVE_STATUSES].filter((s) => s !== 'WRAPPING_UP') } }),
      aiCalling().then((s) => s.isVoicePaused()).catch(() => false),
    ]);
    return { agents: new Map(agents.map((a) => [String(a._id), a])), activeAiSessions, voicePaused, deviceIds };
  }

  // ================================================================== gateway: ring

  /**
   * The gateway saw the phone ring. Idempotent per (device, sessionId): a retried report returns
   * the SAME decision (with a fresh room token) and never a second session or agent.
   */
  async ring(device, { sessionId, number = '', simSlot = null, at = null, waiting = false }) {
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(String(sessionId || ''))) throw new ValidationError('sessionId is required');
    const owner = device.createdBy;
    const dedupeKey = `${device._id}:${sessionId}`;
    const existing = await InboundCall.findOne({ dedupeKey }).lean();
    if (existing) {
      // A call that waited behind another call and is now ringing on its own: decide again
      // (the AI may be free now). Same session, so the caller is never counted twice.
      if (existing.callWaiting && !waiting && existing.handling?.aiBlockedBy === 'call_waiting' && existing.status === 'RINGING' && !existing.answeredBy) {
        const settings = await this.getSettings(owner);
        await InboundCall.updateOne({ _id: existing._id }, { $set: { callWaiting: false }, $push: { events: { $each: [{ type: 'call_waiting_released', at: new Date(), detail: 'The other call ended; the phone is ringing for this caller' }], $slice: -100 } } });
        await this._decide(await InboundCall.findById(existing._id).lean(), device, settings, { waiting: false });
        const fresh = await InboundCall.findById(existing._id).lean();
        this._emit(fresh, 'ringing');
        return this._ringResponse(fresh, device);
      }
      return this._ringResponse(existing, device);
    }

    const settings = await this.getSettings(owner);
    const caller = parseCallerNumber(number, settings.defaultRegion);
    // HFP does not say which SIM rang; a phone with exactly one SIM answers that question itself.
    const sims = device.sims || [];
    if (!Number.isInteger(simSlot) && sims.length === 1) simSlot = sims[0].slot;
    const sim = sims.find((s) => s.slot === simSlot);
    const detectedAt = at ? new Date(at) : new Date();
    const internalCallId = `in_${crypto.randomBytes(12).toString('hex')}`;
    let call;
    try {
      call = await InboundCall.create({
        createdBy: owner, internalCallId, dedupeKey, deviceId: device._id, deviceName: device.name,
        simSlot: Number.isInteger(simSlot) ? simSlot : null, simLabel: sim?.label || sim?.carrier || device.phoneLabel || null,
        caller: { raw: caller.raw, e164: caller.e164, presentation: caller.presentation },
        detectedAt, lastEventAt: new Date(),
        gateway: { sessionId },
        callWaiting: Boolean(waiting),
        transitions: [{ from: null, to: 'DETECTED', at: detectedAt, reason: 'phone_ringing', source: 'gateway' }],
      });
    } catch (error) {
      if (error?.code === 11000) return this._ringResponse(await InboundCall.findOne({ dedupeKey }).lean(), device);
      throw error;
    }
    await this._event(call._id, `gw:ring:${dedupeKey}`, 'gateway', 'ring', { number: caller.e164 ? 'present' : caller.presentation, simSlot, waiting: Boolean(waiting) });
    await this._transition(call._id, 'RECEIVED', { reason: 'session_created', source: 'system' });
    await this._transition(call._id, 'IDENTIFYING', { source: 'system' });
    await this._decide(call.toObject(), device, settings, { waiting });
    const fresh = await InboundCall.findById(call._id).lean();
    this._emit(fresh, 'ringing');
    this._audit('inbound_calls.ring', owner, {}, { callId: internalCallId, decision: fresh.handling.mode, reason: fresh.handling.reason });
    return this._ringResponse(fresh, device);
  }

  /** Identify the caller, choose ONE handling, and start the AI agent when chosen. */
  async _decide(call, device, settings, { waiting = false } = {}) {
    const owner = device.createdBy;
    const caller = { e164: call.caller?.e164 || null, presentation: call.caller?.presentation || 'private' };
    const simSlot = call.simSlot;
    const internalCallId = call.internalCallId;
    const match = await this._identify(caller, settings.defaultRegion);
    const availability = await this._availability(owner, settings, [device._id]);
    // The phone is already in a CRM call (an outbound AI call, or another incoming call): the single
    // Bluetooth audio link is taken, so the AI can never take this one.
    const otherLive = await InboundCall.exists({ deviceId: device._id, _id: { $ne: call._id }, processedAt: null, status: { $in: [...LIVE_STATUSES, 'ANSWERING'] } });
    const deviceBusy = Boolean(device.currentCallId) || Boolean(otherLive);
    // One call per lead: an AI agent is already calling this lead from another line (cloud SIP or
    // another paired phone). The AI never takes a second conversation with the same lead; a person does.
    const leadOnOutbound = match.leadId ? (await leadActiveCall(match.leadId, { exceptInboundCallId: call._id })).kind === 'outbound' : false;
    let decision = decideHandling({
      settings, caller, match, availability,
      device: { id: device._id, simSlot: Number.isInteger(simSlot) ? simSlot : null, audioVerified: Boolean(device.audioVerifiedAt) },
    });
    // A waiting call (the phone is in another call) rings for a person; it is never ignored.
    if (waiting) decision = { ...decision, action: 'human', agentId: null, reason: 'call_waiting', aiBlockedBy: 'call_waiting' };
    // The busy phone is the real reason even when the AI session cap also blocks it.
    if (deviceBusy && decision.aiBlockedBy === 'ai_session_limit') decision = { ...decision, reason: 'device_busy', aiBlockedBy: 'device_busy' };
    if (decision.action === 'ai_answer' && deviceBusy) decision = { ...decision, action: settings.fallbackAction === 'ignore' ? 'ignore' : 'human', agentId: null, reason: 'device_busy', aiBlockedBy: 'device_busy' };
    if (decision.action === 'ai_answer' && leadOnOutbound) decision = { ...decision, action: 'human', agentId: null, reason: 'lead_on_outbound_call', aiBlockedBy: 'lead_on_outbound_call' };
    // Firmware without ANSWER (or a gateway too old to report it) cannot pick up the call.
    if (decision.action === 'ai_answer' && device.board?.canAnswer !== true) decision = { ...decision, action: settings.fallbackAction === 'ignore' ? 'ignore' : 'human', agentId: null, reason: 'firmware_no_answer', aiBlockedBy: 'firmware_no_answer' };
    if (decision.action === 'ai_answer' && !livekit.livekitReady) decision = { ...decision, action: settings.fallbackAction === 'ignore' ? 'ignore' : 'human', agentId: null, reason: 'voice_unavailable', aiBlockedBy: 'livekit_not_configured' };

    const agent = decision.agentId ? await CallingAgent.findById(decision.agentId).select('name agentConfig').lean() : null;
    const set = {
      match: { status: match.status, leadIds: match.leadIds || [] },
      leadId: match.leadId || null,
      assignedTo: match.assignedTo || null,
      'caller.name': match.leadName || null,
      doNotContact: Boolean(match.doNotContact),
      handling: {
        mode: decision.action === 'ai_answer' ? 'ai' : decision.action,
        agentId: decision.agentId || null, agentName: agent?.name || null,
        ruleId: decision.ruleId || null, ruleName: decision.ruleName || null, reason: decision.reason || null,
        aiBlockedBy: decision.aiBlockedBy || null, callerType: decision.callerType, inBusinessHours: decision.inBusinessHours,
        answerAfterMs: decision.answerAfterMs, decidedAt: new Date(),
      },
    };
    await InboundCall.updateOne({ _id: call._id }, { $set: set });

    if (settings.leadCreation === 'all_identified' && match.status === 'new' && caller.e164) {
      await this._ensureLead(call._id, settings, 'identified_on_ring').catch((e) => logger.warn('Inbound lead creation on ring failed', { module: 'inbound-calls', error: e.message }));
    }

    if (decision.action === 'ai_answer') {
      const roomName = `inbound-${internalCallId}`;
      const cfg = agent?.agentConfig || {};
      await InboundCall.updateOne({ _id: call._id }, { $set: { roomName, aiStatus: 'waiting', language: { initial: cfg.language || 'en', current: cfg.language || 'en', switches: [] } } });
      // A released waiting call is already RINGING; the gateway's `answering` moves it on.
      await this._transition(call._id, 'QUEUED', { reason: 'ai_answer_scheduled' });
      // LiveKit's CreateDispatch can take seconds; the gateway does not need to wait for it (it
      // joins the room and answers only once the agent reports ready). A failed dispatch leaves
      // the call ringing for a person: the gateway reports agent_unavailable when nobody is ready.
      void this._dispatchAgent(call._id, roomName, internalCallId, cfg, settings);
    } else {
      await this._transition(call._id, 'RINGING', { reason: decision.reason });
    }
  }

  async _dispatchAgent(id, roomName, internalCallId, cfg, settings) {
    const started = Date.now();
    const dispatch = await livekit.dispatchAgent({
      roomName,
      metadata: {
        callId: internalCallId, direction: 'inbound', mode: 'pstn', transport: 'paired_phone',
        agentToolApi: `${apiBase()}/api/v1/inbound-calls/agent`,
        agentToken: issueInboundAgentToken(internalCallId, (cfg.maxCallSeconds || 300) + 1200),
        voice: cfg.voice, language: cfg.language,
      },
    }).catch((error) => ({ outcome: 'rejected', errorMessage: error.message }));
    logger.info('Incoming call agent dispatch', { module: 'inbound-calls', callId: internalCallId, outcome: dispatch.outcome, ms: Date.now() - started });
    if (dispatch.outcome === 'accepted') return;
    livekit.endCall?.({ roomName })?.catch?.(() => {});
    await InboundCall.updateOne({ _id: id, answeredBy: null }, { $set: {
      'handling.mode': settings.fallbackAction === 'ignore' ? 'ignore' : 'human', 'handling.aiBlockedBy': 'agent_dispatch_failed',
      aiStatus: 'unavailable', error: { code: 'AGENT_DISPATCH_FAILED', message: String(dispatch.errorMessage || dispatch.outcome).slice(0, 500), at: new Date() },
    } }).catch(() => {});
    await this._transition(id, 'RINGING', { reason: 'agent_dispatch_failed' }).catch(() => {});
    const fresh = await InboundCall.findById(id).lean().catch(() => null);
    this._emit(fresh, 'agent_dispatch_failed');
  }

  async _ringResponse(call) {
    const settings = await InboundSettings.findOne({ createdBy: call.createdBy }).select('ringTimeoutSeconds').lean();
    const base = { callId: call.internalCallId, status: call.status, ringTimeoutSeconds: settings?.ringTimeoutSeconds || 45 };
    const live = call.handling?.mode === 'ai' && call.roomName && !TERMINAL_STATUSES.has(call.status) && !call.answeredBy;
    if (!live) return { ...base, action: call.handling?.mode === 'ignore' ? 'ignore' : 'let_ring' };
    const agent = call.handling.agentId ? await CallingAgent.findById(call.handling.agentId).select('agentConfig').lean() : null;
    const maxCallSeconds = agent?.agentConfig?.maxCallSeconds || 300;
    const pp = await pairedPhone();
    return {
      ...base,
      action: 'answer_ai',
      answerAfterMs: call.handling.answerAfterMs ?? 4000,
      maxCallSeconds,
      roomName: call.roomName,
      livekit: { url: livekit.url, identity: `sip-${call.internalCallId}`, token: pp._gatewayRoomToken(call.roomName, call.internalCallId, maxCallSeconds + 900) },
    };
  }

  // ================================================================== gateway: events

  async _owned(filter) {
    const call = await InboundCall.findOne(filter);
    if (!call) throw new NotFoundError('InboundCall', filter.internalCallId || filter._id);
    return call;
  }

  /** Gateway → CRM: idempotent per eventId; stale events for finished calls are ignored. */
  async gatewayEvent(device, internalCallId, { eventId, type, at, data = {} }) {
    const call = await this._owned({ internalCallId, deviceId: device._id });
    const occurredAt = at ? new Date(at) : new Date();
    if (type === 'stats') {
      await InboundCall.updateOne({ _id: call._id }, { $set: { 'gateway.audio': sanitizeStats(data), lastEventAt: new Date() } });
      emit(call.createdBy, 'inbound-call:audio', { callId: internalCallId, audio: sanitizeStats(data) });
      return { ok: true };
    }
    const first = await this._event(call._id, `gw:${eventId}`, 'gateway', type, data, occurredAt);
    if (!first) return { ok: true, duplicate: true };
    const handler = {
      ringing: () => this._transition(call._id, 'RINGING', { source: 'gateway' }),
      answering: () => this._onAnswering(call, occurredAt),
      answered: () => this._onAnswered(call, occurredAt),
      answered_elsewhere: () => this._onAnsweredElsewhere(call, occurredAt),
      audio_opened: () => this._onAudio(call, true, data, occurredAt),
      audio_lost: () => this._onAudio(call, false, data, occurredAt),
      agent_unavailable: () => this._onAgentUnavailable(call, data),
      command_done: () => this._onCommandDone(call, data, occurredAt),
      ended: () => this._onEnded(call, data, occurredAt),
      outcome_unknown: () => this._onUnknown(call, data, occurredAt),
    }[type];
    if (!handler) throw new ValidationError(`Unknown inbound gateway event: ${type}`);
    await handler();
    const fresh = await InboundCall.findById(call._id).lean();
    this._emit(fresh, type);
    return { ok: true, status: fresh.status };
  }

  async _onAnswering(call) {
    await this._transition(call._id, 'ANSWERING', { source: 'gateway', reason: 'ai_answering' });
    await InboundCall.updateOne({ _id: call._id, aiStatus: 'waiting' }, { $set: { aiStatus: 'connecting' } });
  }

  async _onAnswered(call, at) {
    await this._transition(call._id, 'ANSWERED', { source: 'gateway', reason: 'answered_by_gateway', set: { answeredAt: at, answeredBy: 'ai', audioStatus: 'connecting', ringSeconds: secondsBetween(call.detectedAt, at) } });
    await this._transition(call._id, 'CONNECTING_AUDIO', { source: 'gateway' });
    await InboundCall.updateOne({ _id: call._id, aiStatus: { $in: ['waiting', 'connecting'] } }, { $set: { aiStatus: 'connecting' } });
    // Early lead: an interrupted call must still leave the caller in the CRM.
    const settings = await this.getSettings(call.createdBy);
    if (settings.leadCreation !== 'never') await this._ensureLead(call._id, settings, 'ai_answered').catch((e) => logger.warn('Inbound early lead creation failed', { module: 'inbound-calls', callId: call.internalCallId, error: e.message }));
    await this._maybeAiActive(call._id);
  }

  async _onAnsweredElsewhere(call, at) {
    const wasAi = call.handling?.mode === 'ai';
    await this._transition(call._id, 'HUMAN_ACTIVE', { source: 'gateway', reason: 'answered_on_phone', set: {
      answeredAt: call.answeredAt || at, humanAt: at, answeredBy: call.answeredBy || 'human', ringSeconds: call.ringSeconds ?? secondsBetween(call.detectedAt, at),
      ...(wasAi && !call.answeredBy ? { aiStatus: 'ended' } : {}),
    } });
    if (wasAi && !call.answeredBy && call.roomName) livekit.endCall({ roomName: call.roomName }).catch(() => {});
  }

  async _onAudio(call, opened, data, at) {
    if (opened) {
      await InboundCall.updateOne({ _id: call._id }, { $set: { audioStatus: 'connected', 'gateway.codec': data.codec || null } });
      await this._maybeAiActive(call._id);
    } else {
      await InboundCall.updateOne({ _id: call._id }, {
        $set: { audioStatus: 'lost' },
        $push: { events: { $each: [{ type: 'audio_lost', at, detail: String(data.detail || 'audio link lost').slice(0, 300) }], $slice: -100 } },
      });
    }
  }

  /** AI is "connected" only when the agent session started AND the call audio is flowing. */
  async _maybeAiActive(id) {
    const call = await InboundCall.findById(id).select('status agentJoinedAt audioStatus').lean();
    if (!call?.agentJoinedAt || call.audioStatus !== 'connected') return;
    if (['ANSWERED', 'CONNECTING_AUDIO'].includes(call.status)) {
      await this._transition(id, 'AI_ACTIVE', { reason: 'agent_and_audio_ready', set: { aiStatus: 'connected', aiConnectedAt: new Date() } });
    }
  }

  async _onAgentUnavailable(call, data) {
    await InboundCall.updateOne({ _id: call._id }, { $set: {
      'handling.mode': 'human', 'handling.aiBlockedBy': String(data.code || 'agent_not_ready').slice(0, 60), aiStatus: 'unavailable',
      error: { code: 'AGENT_UNAVAILABLE', message: String(data.detail || 'The voice agent was not ready before the ring timeout; the call was left for a person.').slice(0, 500), at: new Date() },
    } });
    await this._transition(call._id, 'RINGING', { source: 'gateway', reason: 'agent_unavailable' });
    if (call.roomName) livekit.endCall({ roomName: call.roomName }).catch(() => {});
  }

  async _onCommandDone(call, data, at) {
    await InboundCall.updateOne({ _id: call._id }, { $set: { 'gateway.command.ackedAt': at } });
    if (data.type === 'takeover') {
      await this._transition(call._id, 'HUMAN_ACTIVE', { source: 'gateway', reason: 'owner_took_over', set: {
        humanAt: at, aiStatus: 'handed_off', audioStatus: 'closed', 'handoff.status': 'taken_over', 'handoff.takenOverAt': at,
      } });
    }
  }

  async _onEnded(call, data, at) {
    const fresh = await InboundCall.findById(call._id).lean();
    const reason = String(data.reason || 'ended').slice(0, 60);
    const answered = Boolean(fresh.answeredAt || LIVE_STATUSES.has(fresh.status));
    const to = endStatusFor(fresh.status, { answered, reason });
    const durationSeconds = fresh.answeredAt ? secondsBetween(fresh.answeredAt, at) : 0;
    const set = {
      endedAt: at, endReason: reason, durationSeconds, audioStatus: fresh.audioStatus === 'none' ? 'none' : 'closed',
      ringSeconds: fresh.ringSeconds ?? secondsBetween(fresh.detectedAt, answered ? fresh.answeredAt : at),
      ...(fresh.handling?.mode === 'ai' && !['handed_off', 'unavailable', 'failed'].includes(fresh.aiStatus) ? { aiStatus: answered && fresh.answeredBy === 'ai' ? 'ended' : fresh.aiStatus === 'waiting' ? 'unavailable' : 'ended' } : {}),
    };
    if (!TERMINAL_STATUSES.has(fresh.status)) await this._transition(call._id, to, { source: 'gateway', reason, set });
    if (fresh.roomName) livekit.endCall({ roomName: fresh.roomName }).catch(() => {});
    const now = await InboundCall.findById(call._id).select('status answeredBy agentEnd handling').lean();
    // An AI call waits briefly for the agent's summary (/end); the sweep finalizes it otherwise.
    if (now.status !== 'WRAPPING_UP' || now.answeredBy !== 'ai' || now.agentEnd?.at) await this.finalize(call._id);
  }

  async _onUnknown(call, data, at) {
    const detail = String(data.detail || 'The gateway lost track of the call').slice(0, 300);
    await this._transition(call._id, 'INTERRUPTED', { source: 'gateway', reason: 'outcome_unknown', set: {
      endedAt: at, endReason: 'outcome_unknown', audioStatus: 'lost', error: { code: 'GATEWAY_OUTCOME_UNKNOWN', message: detail, at },
      durationSeconds: call.answeredAt ? secondsBetween(call.answeredAt, at) : 0,
    } });
    if (call.roomName) livekit.endCall({ roomName: call.roomName }).catch(() => {});
    await this.finalize(call._id);
  }

  /** Owner commands for the gateway, delivered with its heartbeat. */
  async pendingCommands(deviceId) {
    const calls = await InboundCall.find({ deviceId, processedAt: null, 'gateway.command.kind': { $ne: null }, 'gateway.command.ackedAt': null, status: { $nin: [...TERMINAL_STATUSES] } })
      .select('internalCallId gateway.command').limit(5).lean();
    return calls.map((c) => ({ type: c.gateway.command.kind, callId: c.internalCallId, inbound: true }));
  }

  // ================================================================== owner call control

  async control(owner, id, kind, meta = {}) {
    const call = await this._ownedByOwner(owner, id);
    if (TERMINAL_STATUSES.has(call.status) || call.status === 'WRAPPING_UP') throw new ConflictError('The call has already ended');
    const ringing = RINGING_STATUSES.has(call.status);
    const allowed = {
      reject: ringing, // phone still ringing: decline it (AT+CHUP)
      answer: ringing && call.handling?.mode !== 'ai' && call.status !== 'ANSWERING', // let the AI take a ringing call now
      takeover: ['AI_ACTIVE', 'CONNECTING_AUDIO', 'ANSWERED', 'TRANSFERRING'].includes(call.status), // audio to the handset
      hangup: !ringing,
    }[kind];
    if (!allowed) throw new ConflictError(`Cannot ${kind} a call that is ${call.status.toLowerCase().replace(/_/g, ' ')}`);
    if (call.gateway?.command?.kind === kind && !call.gateway.command.ackedAt) return { ok: true, duplicate: true };
    if (kind === 'answer') {
      // Owner override: hand this ringing call to the AI. Same availability checks as a rule.
      return this._ownerAnswer(owner, call, meta);
    }
    await InboundCall.updateOne({ _id: call._id }, { $set: { 'gateway.command': { kind, requestedAt: new Date(), requestedBy: owner, ackedAt: null } } });
    if (kind === 'takeover') await this._transition(call._id, 'TRANSFERRING', { source: 'owner', reason: 'owner_takeover' });
    if (kind === 'hangup' && call.roomName) livekit.endCall({ roomName: call.roomName }).catch(() => {});
    await this._event(call._id, `owner:${kind}:${call._id}:${Date.now()}`, 'owner', kind, { by: String(owner) });
    this._audit(`inbound_calls.${kind}`, owner, meta, { callId: call.internalCallId });
    this._emit(await InboundCall.findById(call._id).lean(), `command_${kind}`);
    return { ok: true };
  }

  async _ownerAnswer(owner, call, meta) {
    const settings = await this.getSettings(owner);
    const device = await PairedDevice.findById(call.deviceId).lean();
    if (device?.board?.canAnswer !== true) throw new ConflictError('This phone bridge cannot answer calls yet: update the ESP32 firmware to 0.1.4 or later');
    const availability = await this._availability(owner, { ...settings, enabled: true }, [call.deviceId]);
    const forced = decideHandling({
      settings: { ...settings, enabled: true, rules: [], blockedNumbers: settings.blockedNumbers },
      caller: call.caller, match: { status: call.match?.status, doNotContact: call.doNotContact }, availability,
      device: { id: call.deviceId, simSlot: call.simSlot, audioVerified: Boolean(device?.audioVerifiedAt) },
    });
    if (forced.action !== 'ai_answer') throw new ConflictError(`The AI cannot take this call: ${String(forced.aiBlockedBy || forced.reason).replace(/_/g, ' ')}`);
    const agent = await CallingAgent.findById(forced.agentId).select('name agentConfig').lean();
    const roomName = `inbound-${call.internalCallId}`;
    const dispatch = await livekit.dispatchAgent({ roomName, metadata: {
      callId: call.internalCallId, direction: 'inbound', mode: 'pstn', transport: 'paired_phone',
      agentToolApi: `${apiBase()}/api/v1/inbound-calls/agent`, agentToken: issueInboundAgentToken(call.internalCallId, (agent.agentConfig?.maxCallSeconds || 300) + 1200),
      voice: agent.agentConfig?.voice, language: agent.agentConfig?.language,
    } }).catch((e) => ({ outcome: 'rejected', errorMessage: e.message }));
    if (dispatch.outcome !== 'accepted') throw new ConflictError('The voice agent could not be started for this call');
    await InboundCall.updateOne({ _id: call._id }, { $set: {
      roomName, aiStatus: 'waiting', 'handling.mode': 'ai', 'handling.agentId': agent._id, 'handling.agentName': agent.name, 'handling.reason': 'owner_answer', 'handling.answerAfterMs': 0,
      'gateway.command': { kind: 'answer', requestedAt: new Date(), requestedBy: owner, ackedAt: null },
      language: { initial: agent.agentConfig?.language || 'en', current: agent.agentConfig?.language || 'en', switches: [] },
    } });
    this._audit('inbound_calls.owner_answer', owner, meta, { callId: call.internalCallId });
    this._emit(await InboundCall.findById(call._id).lean(), 'command_answer');
    return { ok: true };
  }

  /** Room details for the gateway when the owner asked the AI to answer (heartbeat command). */
  async answerJob(device, internalCallId) {
    const call = await this._owned({ internalCallId, deviceId: device._id });
    if (call.gateway?.command?.kind !== 'answer') throw new ConflictError('No answer request for this call');
    return this._ringResponse(call.toObject(), device);
  }

  // ================================================================== browser test

  /**
   * Talk to an incoming agent from the browser, as if you were calling the phone. Same worker,
   * receptionist mode, tools and post-call analysis; recorded as a test (`isTest`), never shown in
   * history/analytics, and it never creates or changes leads, follow-ups or notifications.
   */
  async startBrowserTest(owner, agentId, meta = {}) {
    if (!mongoose.isValidObjectId(agentId)) throw new NotFoundError('CallingAgent', agentId);
    const agent = await CallingAgent.findOne({ _id: agentId, createdBy: owner, availability: { $ne: 'archived' } }).lean();
    if (!agent) throw new NotFoundError('CallingAgent', agentId);
    if (!livekit.livekitReady) throw new ServiceUnavailableError('Voice is not configured (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET).');
    const settings = await this.getSettings(owner);
    const cfg = agent.agentConfig || {};
    const internalCallId = `in_${crypto.randomBytes(12).toString('hex')}`;
    const roomName = `inbound-test-${internalCallId}`;
    const now = new Date();
    const call = await InboundCall.create({
      createdBy: owner, internalCallId, dedupeKey: `test:${internalCallId}`, source: 'simulation', isTest: true,
      caller: { raw: null, e164: null, presentation: 'unavailable', name: 'Browser test' }, match: { status: 'unknown' },
      handling: { mode: 'ai', agentId: agent._id, agentName: agent.name, reason: 'browser_test', decidedAt: now, answerAfterMs: 0 },
      status: 'CONNECTING_AUDIO', answeredBy: 'ai', answeredAt: now, audioStatus: 'connected', aiStatus: 'connecting', roomName,
      language: { initial: cfg.language || 'en', current: cfg.language || 'en', switches: [] },
      transitions: [{ from: null, to: 'CONNECTING_AUDIO', at: now, reason: 'browser_test', source: 'owner' }],
    });
    const fail = async (message) => {
      await InboundCall.updateOne({ _id: call._id }, { $set: { status: 'FAILED', aiStatus: 'failed', endedAt: new Date(), processedAt: new Date(), error: { code: 'TEST_NOT_STARTED', message, at: new Date() } } });
      await livekit.endCall({ roomName }).catch(() => {});
      throw new ServiceUnavailableError(message);
    };
    const dispatch = await livekit.dispatchAgent({ roomName, metadata: {
      callId: internalCallId, direction: 'inbound', mode: 'web', transport: 'browser_test',
      agentToolApi: `${apiBase()}/api/v1/inbound-calls/agent`, agentToken: issueInboundAgentToken(internalCallId, (cfg.maxCallSeconds || 300) + 1200),
      voice: cfg.voice, language: cfg.language,
    } }).catch((error) => ({ outcome: 'rejected', errorMessage: error.message }));
    if (dispatch.outcome !== 'accepted') await fail(`The voice agent could not be dispatched: ${dispatch.errorMessage || dispatch.outcome}`);
    const worker = livekit.waitForAgentWorker ? await livekit.waitForAgentWorker({ roomName }) : 'unknown';
    if (worker === 'no_worker' || worker === 'failed') {
      await fail(worker === 'failed' ? 'The voice agent worker failed to start the test. Check the worker logs.' : `No voice agent worker is online for "${livekit.agentName}". Start the agent worker (cd server/agent-worker && npm run dev).`);
    }
    // The worker must load this test from THIS API (another environment's worker may share the agent name).
    const deadline = Date.now() + 10_000;
    while (!(await InboundCall.exists({ _id: call._id, agentContextAt: { $ne: null } }))) {
      if (Date.now() > deadline) await fail(`The voice agent never loaded this test from this CRM (${apiBase()}). Make sure the agent worker for "${livekit.agentName}" points at this API and no other environment's worker uses that name.`);
      await new Promise((r) => { setTimeout(r, 250); });
    }
    this._audit('inbound_calls.browser_test', owner, meta, { agentId: String(agent._id), callId: internalCallId, settingsVersion: settings.version });
    const token = livekit.issueJoinToken({ roomName, identity: `admin-${owner}`, name: 'Tester', ttlSeconds: (cfg.maxCallSeconds || 300) + 120 });
    return { id: String(call._id), callId: internalCallId, roomName, url: livekit.wsUrl, token };
  }

  // ================================================================== voice agent tools

  async _agentCall(internalCallId, { mutable = true } = {}) {
    const call = await InboundCall.findOne({ internalCallId });
    if (!call) throw new NotFoundError('InboundCall', internalCallId);
    if (mutable && call.processedAt) throw new ConflictError('This call has already been processed');
    return call;
  }

  async agentContext(internalCallId) {
    const call = await this._agentCall(internalCallId, { mutable: false });
    await InboundCall.updateOne({ _id: call._id, agentContextAt: null }, { $set: { agentContextAt: new Date() } });
    const settings = await this.getSettings(call.createdBy);
    const agent = call.handling?.agentId ? await CallingAgent.findById(call.handling.agentId).lean() : null;
    if (!agent) throw new ConflictError('No agent is assigned to this call');
    let knowledgeSection = null;
    try {
      const { snapshot } = await knowledgeService.resolveForAgent(agent);
      knowledgeSection = buildKnowledgeSection(snapshot, { language: agent.agentConfig?.language });
    } catch (error) {
      logger.warn('Inbound call knowledge unavailable', { module: 'inbound-calls', callId: internalCallId, error: error.message });
    }
    const lead = call.leadId ? await Lead.findById(call.leadId).select('name leadNumber').lean() : null;
    const known = call.match?.status === 'existing' && lead;
    const fields = activeFields(call);
    return {
      callId: internalCallId,
      direction: 'inbound',
      persistTranscript: true,
      voiceProviders: await providerSettings({ worker: true, isTest: Boolean(call.isTest) }),
      participantIdentity: call.isTest ? `admin-${call.createdBy}` : `sip-${internalCallId}`,
      agentConfig: { ...agent.agentConfig, agentName: agent.agentConfig?.agentName || agent.name },
      languageRevision: call.language?.switches?.length || 0,
      conversationLanguage: { initial: call.language?.initial || agent.agentConfig?.language || 'en', current: call.language?.current || agent.agentConfig?.language || 'en', switches: [] },
      greeting: buildGreeting({ agent, settings }),
      disclosure: null,
      systemPrompt: buildReceptionistPrompt({ agent, caller: { known: Boolean(known), name: known ? lead.name : null }, knowledgeSection, settings, handoffAvailable: true }),
      transfer: { enabled: false },
      callerFields: CALLER_FIELDS,
      transcriptionContext: { questions: [] },
      conversationMemory: {
        language: call.language?.current || null,
        collected: Object.fromEntries(fields.map((f) => [f.key, f.value])),
        declined: (call.declinedFields || []).map((d) => d.key),
        closingQuestions: normalizeQuestions(agent.inbound?.closingQuestions || []).map((x) => x.key),
        questionsAsked: (call.questions || []).length,
        callbackRequested: Boolean(call.callback?.requested),
        humanRequested: Boolean(call.handoff?.requested),
      },
      nextAction: { type: 'converse' },
    };
  }

  /** The worker saw the phone line active and started its voice session. */
  async agentAnswered(internalCallId) {
    const call = await this._agentCall(internalCallId);
    await InboundCall.updateOne({ _id: call._id, agentJoinedAt: null }, { $set: { agentJoinedAt: new Date() } });
    await this._maybeAiActive(call._id);
    this._emit(await InboundCall.findById(call._id).lean(), 'agent_joined');
    return { ok: true };
  }

  /** The questions configured on this call's agent (closing questions), normalised. */
  async _agentQuestions(call) {
    if (!call.handling?.agentId) return [];
    const agent = await CallingAgent.findById(call.handling.agentId).select('inbound.closingQuestions').lean();
    return normalizeQuestions(agent?.inbound?.closingQuestions || []);
  }

  async agentRecordInfo(internalCallId, { fields = [] }) {
    const call = await this._agentCall(internalCallId);
    const questions = await this._agentQuestions(call);
    const byKey = new Map(questions.map((x) => [x.key, x]));
    const region = (await InboundSettings.findOne({ createdBy: call.createdBy }).select('defaultRegion').lean())?.defaultRegion || 'CH';
    const saved = [];
    const rejected = [];
    const declined = [];
    const lastCaller = [...(call.transcript || [])].reverse().find((t) => t.role === 'caller');
    for (const f of fields.slice(0, 20)) {
      const key = String(f.key || '').trim();
      const question = byKey.get(key);
      if (!CALLER_FIELD_KEYS.includes(key) && !question) { rejected.push({ key, reason: 'unknown_field' }); continue; }
      if (f.declined) {
        if (!(call.declinedFields || []).some((d) => d.key === key)) {
          await InboundCall.updateOne({ _id: call._id }, { $push: { declinedFields: { key, at: new Date(), evidence: lastCaller?.text?.slice(0, 1000) || null } } });
        }
        declined.push({ key });
        continue;
      }
      const type = question?.type || STANDARD_KEYS[key] || 'text';
      const checked = validateAnswer(type, f.value, { region, options: question?.options || [] });
      if (!checked.ok) { rejected.push({ key, reason: checked.reason }); continue; }
      const value = checked.value;
      const current = activeFields(call).find((x) => x.key === key);
      if (current && current.value === value && current.explicit === (f.explicit !== false)) { saved.push({ key, unchanged: true }); continue; }
      const now = new Date();
      await InboundCall.updateOne({ _id: call._id }, { $set: { 'fields.$[old].supersededAt': now } }, { arrayFilters: [{ 'old.key': key, 'old.supersededAt': null }] });
      await InboundCall.updateOne({ _id: call._id }, { $push: { fields: {
        key, label: question?.label || null, value, explicit: f.explicit !== false, confidence: Number.isFinite(f.confidence) ? Math.max(0, Math.min(1, f.confidence)) : null,
        evidence: f.evidence ? String(f.evidence).slice(0, 1000) : (lastCaller?.text?.slice(0, 1000) || null),
        transcriptItemId: lastCaller?.itemId || null, askedQuestion: f.askedQuestion ? String(f.askedQuestion).slice(0, 500) : (question?.question || null), at: now,
      } }, $set: { lastEventAt: now } });
      if (key === 'full_name' && f.explicit !== false) await InboundCall.updateOne({ _id: call._id, 'match.status': { $ne: 'existing' } }, { $set: { 'caller.name': value.slice(0, 200) } });
      saved.push({ key });
    }
    this._emit(await InboundCall.findById(call._id).lean(), 'info');
    const fresh = await InboundCall.findById(call._id).select('fields declinedFields').lean();
    const pending = questions.filter((x) => !activeFields(fresh).some((f) => f.key === x.key) && !(fresh.declinedFields || []).some((d) => d.key === x.key));
    const reasons = new Set(rejected.map((r) => r.reason));
    const retry = reasons.has('invalid_email') ? 'The email address did not look valid. Ask them to spell it again, once.'
      : reasons.has('invalid_phone') ? 'That phone number was incomplete. Ask them to repeat it digit by digit, once.'
        : reasons.has('not_an_option') ? 'That answer is not one of the listed options. Ask once more and offer the options.'
          : reasons.has('incomplete_address') ? 'The address seems incomplete. Ask for street, city and postal code, once.' : null;
    const next = pending.length ? ` Closing questions still to ask (when the caller's request is handled): ${pending.map((x) => x.key).join(', ')}.` : '';
    return { saved, rejected, declined, pendingClosingQuestions: pending.map((x) => x.key), instruction: `${retry || 'Saved. Continue the conversation.'}${next}` };
  }

  async agentRecordQuestion(internalCallId, { text, category = null, answerStatus = 'answered', answerSummary = null, requestId = null }) {
    const call = await this._agentCall(internalCallId);
    if (requestId && (call.questions || []).some((q) => q.requestId === requestId)) return { ok: true, duplicate: true };
    const normalized = normalizeCategory(category);
    const lastCaller = [...(call.transcript || [])].reverse().find((t) => t.role === 'caller');
    await InboundCall.updateOne({ _id: call._id }, { $push: { questions: { $each: [{
      requestId, text: String(text).slice(0, 1000), category: normalized || classifyText(text), categorySource: normalized ? 'ai' : 'rules',
      answerStatus, answerSummary: answerSummary ? String(answerSummary).slice(0, 1000) : null, transcriptItemId: lastCaller?.itemId || null, at: new Date(),
    }], $slice: -100 } }, $set: { lastEventAt: new Date() } });
    this._emit(await InboundCall.findById(call._id).lean(), 'question');
    return { ok: true };
  }

  async agentSetIntent(internalCallId, { primary, secondary = [] }) {
    const call = await this._agentCall(internalCallId);
    const p = normalizeCategory(primary);
    if (!p) throw new ValidationError('Unknown inquiry category');
    await InboundCall.updateOne({ _id: call._id }, { $set: { 'intents.agentPrimary': p, 'intents.agentSecondary': secondary.map(normalizeCategory).filter(Boolean).slice(0, 6), 'intents.primary': p, 'intents.source': 'ai' } });
    return { ok: true };
  }

  async agentRequestCallback(internalCallId, { when = null, note = null }) {
    const call = await this._agentCall(internalCallId);
    await InboundCall.updateOne({ _id: call._id }, { $set: { callback: { requested: true, whenText: when ? String(when).slice(0, 300) : null, note: note ? String(note).slice(0, 1000) : null, at: new Date() } },
      $push: { events: { $each: [{ type: 'callback_requested', at: new Date(), detail: when ? String(when).slice(0, 300) : null }], $slice: -100 } } });
    return { ok: true, instruction: 'Confirm that a team member will call them back, repeat the time if they gave one, then continue or close the call.' };
  }

  /**
   * The caller asked for a person (or the agent escalated). The owner is alerted at once; they
   * can take over on the phone (the audio moves to the handset). If nobody takes over within the
   * wait time the agent is told to offer a callback — it never claims a transfer happened.
   */
  async agentRequestHuman(internalCallId, { reason = '', summary = '' }) {
    const call = await this._agentCall(internalCallId);
    const settings = await this.getSettings(call.createdBy);
    if (!call.handoff?.requested) {
      await InboundCall.updateOne({ _id: call._id }, { $set: { handoff: { requested: true, reason: String(reason).slice(0, 500), summary: String(summary).slice(0, 2000), requestedAt: new Date(), status: 'waiting' } },
        $push: { events: { $each: [{ type: 'human_requested', at: new Date(), detail: String(reason).slice(0, 300) }], $slice: -100 } } });
      if (settings.automation?.notifyHandoff !== false) {
        this._notify(call.createdBy, 'inbound_calls.handoff', 'HIGH', 'Caller wants to speak to a person',
          `${call.caller?.name || call.caller?.e164 || 'A caller'} asked for a person${reason ? `: ${reason}` : ''}. Open the call to take over on the phone.`,
          call, `inbound-handoff-${call._id}`);
      }
      emit(call.createdBy, 'inbound-call:handoff', { callId: call.internalCallId, id: String(call._id), reason, waitSeconds: settings.handoffWaitSeconds });
    }
    const fresh = await InboundCall.findById(call._id).select('handoff').lean();
    if (fresh.handoff.status === 'taken_over') return { status: 'taken_over', instruction: 'A team member has taken the call. Stop speaking.' };
    const waited = Date.now() - new Date(fresh.handoff.requestedAt).getTime();
    if (waited >= settings.handoffWaitSeconds * 1000) {
      await InboundCall.updateOne({ _id: call._id, 'handoff.status': 'waiting' }, { $set: { 'handoff.status': 'callback_offered', callback: { requested: true, whenText: null, note: 'Asked for a person; nobody was available to take over.', at: new Date() } } });
      return { status: 'callback_offered', instruction: 'Nobody could take the call right now. Apologise, offer a callback from a team member, ask when suits them (call request_callback with the time), then close politely.' };
    }
    return { status: 'waiting', waitSeconds: Math.ceil((settings.handoffWaitSeconds * 1000 - waited) / 1000),
      instruction: 'Tell them you have alerted a team member who may pick up in a moment, and keep helping meanwhile. Do NOT say they are being transferred. If they would rather not wait, offer a callback.' };
  }

  async agentDoNotContact(internalCallId) {
    const call = await this._agentCall(internalCallId);
    await InboundCall.updateOne({ _id: call._id }, { $set: { doNotContact: true }, $push: { events: { $each: [{ type: 'do_not_contact', at: new Date() }], $slice: -100 } } });
    return { ok: true, instruction: 'Confirm they will not be contacted, then close the call politely.' };
  }

  async agentTranscript(internalCallId, { role, text, itemId, interrupted = false, at = null }) {
    const call = await InboundCall.findOne({ internalCallId }).select('_id processedAt transcript.itemId language.current').lean();
    if (!call) throw new NotFoundError('InboundCall', internalCallId);
    if ((call.transcript || []).some((t) => t.itemId === itemId)) return { ok: true, duplicate: true };
    const turn = { itemId, role: role === 'assistant' ? 'assistant' : 'caller', text: String(text).slice(0, 4000), interrupted: Boolean(interrupted), language: call.language?.current || null, at: at ? new Date(at) : new Date() };
    // Transcript keeps arriving for a few seconds after the line drops; accept it until processed.
    await InboundCall.updateOne({ _id: call._id, 'transcript.itemId': { $ne: itemId } }, { $push: { transcript: { $each: [turn], $slice: -600 } }, $set: { lastEventAt: new Date() } });
    emit((await InboundCall.findById(call._id).select('createdBy').lean()).createdBy, 'inbound-call:transcript', { callId: internalCallId, turn });
    return { ok: true };
  }

  async agentActivity(internalCallId, { agentState = null, speaker = null }) {
    const call = await InboundCall.findOne({ internalCallId }).select('_id createdBy status').lean();
    if (!call) throw new NotFoundError('InboundCall', internalCallId);
    const set = { agentActivity: { state: agentState, speaker: speaker === 'customer' ? 'caller' : speaker, at: new Date() } };
    await InboundCall.updateOne({ _id: call._id }, { $set: set });
    // Conditional on the status at write time: an activity report racing the hang-up must not
    // turn an ended call back into "listening".
    if (call.status === 'AI_ACTIVE') {
      set.aiStatus = agentState === 'speaking' ? 'speaking' : 'listening';
      await InboundCall.updateOne({ _id: call._id, status: 'AI_ACTIVE' }, { $set: { aiStatus: set.aiStatus } });
    }
    emit(call.createdBy, 'inbound-call:activity', { callId: internalCallId, agentState, speaker: set.agentActivity.speaker, aiStatus: set.aiStatus || null });
    return { ok: true };
  }

  async agentLanguage(internalCallId, { language, explicit = false, confidence = null, evidence = null }) {
    const call = await this._agentCall(internalCallId, { mutable: false });
    const lang = String(language || '').trim().slice(0, 12);
    const current = call.language?.current || call.language?.initial || 'en';
    const switches = call.language?.switches || [];
    // Switch on an explicit request, a high-confidence detection, or the same detected language on
    // two caller turns in a row. A single borrowed word or one misheard utterance is not enough.
    if (!lang || lang === current) {
      if (call.language?.candidate) await InboundCall.updateOne({ _id: call._id }, { $set: { 'language.candidate': null, 'language.candidateCount': 0 } });
      return { language: current, revision: switches.length };
    }
    const count = call.language?.candidate === lang ? (call.language.candidateCount || 0) + 1 : 1;
    const sure = explicit || (Number.isFinite(confidence) && confidence >= 0.85) || count >= 2;
    if (!sure) {
      await InboundCall.updateOne({ _id: call._id }, { $set: { 'language.candidate': lang, 'language.candidateCount': count } });
      return { language: current, revision: switches.length };
    }
    await InboundCall.updateOne({ _id: call._id }, {
      $set: { 'language.current': lang, 'language.candidate': null, 'language.candidateCount': 0 },
      $push: { 'language.switches': { from: current, to: lang, at: new Date(), explicit: Boolean(explicit), evidence: evidence ? String(evidence).slice(0, 300) : null }, events: { $each: [{ type: 'language_switch', at: new Date(), detail: `${current} → ${lang}` }], $slice: -100 } },
    });
    return { language: lang, revision: switches.length + 1 };
  }

  async agentBehavior(internalCallId, payload = {}) {
    const type = String(payload.type || '').slice(0, 40);
    if (['interruption', 'silence'].includes(type)) {
      await InboundCall.updateOne({ internalCallId, processedAt: null }, { $push: { events: { $each: [{ type, at: new Date() }], $slice: -100 } } });
    }
    return { ok: true };
  }

  async agentProviderAttempt(internalCallId, attempt = {}) {
    await InboundCall.updateOne({ internalCallId }, { $set: { aiVoice: { provider: attempt.provider || null, model: attempt.model || null, status: attempt.status || null, at: new Date() } } });
    return { ok: true };
  }

  /** The agent finished (goodbye said, max duration, failure). Closing the room makes the gateway hang up. */
  async agentEnd(internalCallId, body = {}) {
    const call = await InboundCall.findOne({ internalCallId });
    if (!call) throw new NotFoundError('InboundCall', internalCallId);
    if (call.processedAt || call.agentEnd?.at) return { ok: true, duplicate: true };
    const n = body.callNotes || {};
    const list = (v) => (Array.isArray(v) ? v.map((x) => String(x).slice(0, 500)).filter(Boolean).slice(0, 10) : []);
    const set = {
      agentEnd: { at: new Date(), disposition: body.disposition || null, failureCode: body.failureCode || null },
      ...(body.cost ? { cost: { amount: Number(body.cost.amount) || 0, currency: body.cost.currency || 'USD', breakdown: body.cost.breakdown || null } } : {}),
      ...(body.quality ? { quality: body.quality } : {}),
    };
    if (n.summary || n.reason) {
      set.summary = {
        reason: n.reason ? String(n.reason).slice(0, 1000) : null,
        text: n.summary ? String(n.summary).slice(0, 4000) : null,
        requirements: list(n.requirements), concerns: list(n.concerns), objections: list(n.objections || n.blockers),
        unresolvedQuestions: list(n.unresolved_questions || n.unresolvedQuestions),
        tone: ['positive', 'neutral', 'hesitant', 'negative'].includes(n.behavior?.tone || n.tone) ? (n.behavior?.tone || n.tone) : null,
        toneEvidence: (n.behavior?.evidence || n.tone_evidence) ? String(n.behavior?.evidence || n.tone_evidence).slice(0, 300) : null,
        notInterested: Boolean(n.not_interested || n.notInterested),
        generatedBy: 'ai_agent', at: new Date(),
      };
    }
    if (body.failureCode) set.error = { code: String(body.failureCode).slice(0, 100), message: String(body.failureMessage || '').slice(0, 500), at: new Date() };
    if (body.failureCode) set.aiStatus = 'failed';
    await InboundCall.updateOne({ _id: call._id, 'agentEnd.at': null }, { $set: set });
    if (call.roomName) livekit.endCall({ roomName: call.roomName }).catch(() => {});
    if (call.isTest && !TERMINAL_STATUSES.has(call.status) && call.status !== 'WRAPPING_UP') {
      const endedAt = new Date();
      await this._transition(call._id, 'WRAPPING_UP', { reason: 'browser_test_ended', set: { endedAt, endReason: 'browser_test_ended', audioStatus: 'closed', aiStatus: body.failureCode ? 'failed' : 'ended', durationSeconds: secondsBetween(call.answeredAt, endedAt) } });
    }
    const fresh = await InboundCall.findById(call._id).select('status').lean();
    if (TERMINAL_STATUSES.has(fresh.status) || fresh.status === 'WRAPPING_UP') await this.finalize(call._id);
    return { ok: true };
  }

  // ================================================================== post-call processing

  /** Exactly once per call (atomic lease); safe to call from every path. */
  async finalize(id) {
    const now = new Date();
    const claimed = await InboundCall.findOneAndUpdate(
      { _id: id, processedAt: null, $or: [{ processingLeaseUntil: null }, { processingLeaseUntil: { $lt: now } }] },
      { $set: { processingLeaseUntil: new Date(now.getTime() + PROCESSING_LEASE_MS) } },
      { returnDocument: 'after' },
    );
    if (!claimed) return null;
    try {
      if (claimed.status === 'WRAPPING_UP') await this._transition(id, 'COMPLETED', { reason: 'call_finished' });
      else if (!TERMINAL_STATUSES.has(claimed.status)) {
        await this._transition(id, LIVE_STATUSES.has(claimed.status) ? 'INTERRUPTED' : 'MISSED', { reason: 'no_end_report', set: { endedAt: claimed.endedAt || now, endReason: claimed.endReason || 'no_end_report' } });
      }
      const call = await InboundCall.findById(id);
      const settings = await this.getSettings(call.createdBy);
      const outcome = deriveOutcome({ status: call.status, answeredBy: call.answeredBy, handedOff: call.handoff?.status === 'taken_over', aiConnected: Boolean(call.aiConnectedAt) });
      const intents = resolveIntents({
        agentIntent: { primary: call.intents?.agentPrimary, secondary: call.intents?.agentSecondary },
        questions: call.questions || [], callbackRequested: call.callback?.requested, humanRequested: call.handoff?.requested,
      });
      const fields = activeFields(call);
      const callerTurns = (call.transcript || []).filter((t) => t.role === 'caller').length;
      const conversation = call.answeredBy === 'ai' || fields.length > 0 || callerTurns > 0;
      const qualification = conversation ? evaluateQualification({
        fields, intents, callbackRequested: call.callback?.requested, humanRequested: call.handoff?.requested,
        notInterested: call.summary?.notInterested, callerTurns, criteria: settings.qualification,
      }) : null;
      const unresolved = [...(call.questions || []).filter((q) => ['unanswered', 'deferred'].includes(q.answerStatus)).map((q) => q.text), ...(call.summary?.unresolvedQuestions || [])];
      const recs = recommend({
        status: call.status, outcome, intents, qualification: qualification || {}, callbackRequested: call.callback?.requested,
        humanRequested: call.handoff?.requested, matchStatus: call.match?.status, presentation: call.caller?.presentation, unresolvedQuestions: unresolved,
      });
      const previous = new Map((call.recommendations || []).map((r) => [r.id, r]));
      const recommendations = recs.map((r) => previous.get(r.id) || { ...r, status: 'pending' });

      const usage = call.cost?.breakdown?.usage;
      const priced = usage && !call.cost?.breakdown?.tokens ? priceInboundCall({ usage, durationSeconds: call.durationSeconds || 0, isTest: call.isTest, reported: call.cost }) : null;
      const set = {
        ...(priced ? { cost: priced } : {}),
        ...(['waiting', 'connecting', 'connected', 'speaking', 'listening'].includes(call.aiStatus) ? { aiStatus: call.answeredBy === 'ai' ? 'ended' : 'unavailable' } : {}),
        outcome,
        intents: { ...(call.intents?.toObject?.() || call.intents || {}), primary: intents.primary, secondary: intents.secondary, source: intents.source },
        recommendations,
        ...(qualification ? { qualification: { ...qualification, evaluatedAt: new Date() } } : {}),
      };
      if (!call.summary?.text && conversation) set.summary = { ...(call.summary?.toObject?.() || {}), ...systemSummary(call, intents, fields), generatedBy: 'system', at: new Date() };
      if (call.handoff?.status === 'waiting') set['handoff.status'] = 'expired';
      await InboundCall.updateOne({ _id: id }, { $set: set });

      if (call.isTest) {
        await InboundCall.updateOne({ _id: id }, { $set: { processedAt: new Date(), processingLeaseUntil: null } });
        return InboundCall.findById(id).lean();
      }
      // Lead: create (policy) and enrich; then follow-ups; then notifications.
      const leadCreationAllowed = settings.leadCreation === 'all_identified' || (settings.leadCreation === 'ai_answered' && call.answeredBy === 'ai');
      if (leadCreationAllowed) await this._ensureLead(id, settings, 'post_call');
      const withLead = await InboundCall.findById(id);
      if (withLead.leadId) await this._applyToLead(withLead, settings, qualification);
      await this._automaticFollowUps(await InboundCall.findById(id), settings);
      if (call.doNotContact && call.caller?.e164) {
        await CallSuppression.updateOne({ phoneHash: phoneHash(call.caller.e164) }, { $setOnInsert: {
          phoneHash: phoneHash(call.caller.e164), leadId: withLead.leadId || null, reason: 'do_not_contact', source: 'inbound_call', note: `Asked during incoming call ${call.internalCallId}`, suppressedAt: new Date(), createdBy: call.createdBy,
        } }, { upsert: true }).catch(() => {});
      }
      await this._routeWork(id);
      this._notifyOutcome(await InboundCall.findById(id).lean(), settings);
      await InboundCall.updateOne({ _id: id }, { $set: { processedAt: new Date(), processingLeaseUntil: null } });
      const done = await InboundCall.findById(id).lean();
      this._emit(done, 'processed');
      // Workflow Automation "incoming AI call" trigger. Fire-and-forget, after processedAt is committed.
      try {
        eventBus.publish(EVENT_TYPES.INBOUND_CALL_PROCESSED, {
          inboundCallId: String(done._id), leadId: done.leadId ? String(done.leadId) : null, ownerId: done.createdBy ? String(done.createdBy) : null,
          outcome: done.outcome || null, answeredBy: done.answeredBy || null, qualification: done.qualification?.result || null,
          doNotContact: Boolean(done.doNotContact), matchStatus: done.match?.status || null,
        }, { source: 'inbound-calls' });
      } catch (e) { logger.warn('Inbound call event publish failed', { module: 'inbound-calls', id: String(id), error: e.message }); }
      return done;
    } catch (error) {
      logger.error('Inbound call post-processing failed (the sweep retries)', { module: 'inbound-calls', id: String(id), error: error.message, stack: error.stack });
      await InboundCall.updateOne({ _id: id }, { $set: { processingLeaseUntil: null }, $inc: { processingErrors: 1 } });
      throw error;
    }
  }

  /** Create the caller's lead once (atomic claim). Never for private numbers or ambiguous matches. */
  async _ensureLead(id, settings, reason, { force = false } = {}) {
    const call = await InboundCall.findById(id).lean();
    // `force`: a person decided the matching leads are someone else (ambiguous match) — never automatic.
    const allowed = call?.match?.status === 'new' || (force && call?.match?.status === 'ambiguous');
    if (!call || call.leadId || !allowed || !call.caller?.e164 || settings.leadCreation === 'never') return call?.leadId || null;
    const claim = await InboundCall.findOneAndUpdate(
      { _id: id, leadId: null, $or: [{ leadClaimAt: null }, { leadClaimAt: { $lt: new Date(Date.now() - 60_000) } }] },
      { $set: { leadClaimAt: new Date() } }, { returnDocument: 'after' },
    ).lean();
    if (!claim) return null;
    // Another call from the same number may have created the lead since the ring.
    const again = force ? { status: 'new' } : await this._identify(call.caller, settings.defaultRegion);
    if (again.status === 'existing') {
      await InboundCall.updateOne({ _id: id }, { $set: { leadId: again.leadId, 'match.status': 'existing', 'match.leadIds': again.leadIds } });
      return again.leadId;
    }
    if (again.status === 'ambiguous') {
      await InboundCall.updateOne({ _id: id }, { $set: { 'match.status': 'ambiguous', 'match.leadIds': again.leadIds } });
      return null;
    }
    const name = fieldValue(claim, 'full_name') || fieldValue(claim, 'company') || `Caller ${call.caller.e164}`;
    const email = fieldValue(claim, 'email');
    const svc = await leadService();
    const lead = await svc.create({
      name: name.slice(0, 200),
      type: fieldValue(claim, 'company') ? LEAD_TYPE.BUSINESS : LEAD_TYPE.PRIVATE,
      mobile: call.caller.e164,
      phone: call.caller.e164,
      ...(email && EMAIL_RE.test(email) ? { email } : {}),
      source: LEAD_SOURCE.INCOMING_CALL,
      status: LEAD_STATUS.NEW,
      notes: `Created from an incoming call (${new Date(call.detectedAt).toISOString()}${call.deviceName ? `, ${call.deviceName}` : ''}).`,
      tags: ['incoming-call'],
    }, call.createdBy, { ipAddress: 'internal', userAgent: 'inbound-calls' });
    await InboundCall.updateOne({ _id: id }, { $set: { leadId: lead._id, leadCreated: true, assignedTo: lead.assignedTo || null, 'match.leadIds': [lead._id] } });
    logger.info('Lead created from incoming call', { module: 'inbound-calls', callId: call.internalCallId, leadId: String(lead._id), reason });
    return lead._id;
  }

  /** Fill gaps on the lead (never overwrite verified data) and record the qualification answers. */
  async _applyToLead(call, settings, qualification) {
    const lead = await Lead.findById(call.leadId);
    if (!lead || lead.isDeleted) return;
    const explicit = activeFields(call).filter((f) => f.explicit !== false);
    const value = (k) => explicit.find((f) => f.key === k)?.value || null;
    const set = { lastContactedAt: call.endedAt || new Date(), lastContactChannel: 'phone' };
    const email = value('email');
    if (email && !lead.email && EMAIL_RE.test(email)) set.email = email;
    const website = value('website');
    if (website && !lead.website) set.website = website.slice(0, 500);
    // A lead this call created still has a placeholder name until the caller gave theirs.
    if (call.leadCreated && /^Caller \+\d+$/.test(lead.name || '') && (value('full_name') || value('company'))) set.name = (value('full_name') || value('company')).slice(0, 200);
    // Address: fill the lead's empty address parts only.
    const addr = lead.address || {};
    if (value('address') && !addr.street) set['address.street'] = value('address').slice(0, 255);
    if (value('city') && !addr.city) set['address.city'] = value('city').slice(0, 120);
    if (value('postal_code') && !addr.postalCode) set['address.postalCode'] = value('postal_code').slice(0, 20);
    if (value('country') && !addr.country) set['address.country'] = value('country').slice(0, 120);
    // The caller ID is the lead's mobile; another number they gave fills an empty phone slot.
    const other = value('alternate_phone') || (value('callback_phone') !== call.caller?.e164 ? value('callback_phone') : null);
    // (A lead created from the call holds the caller ID in both slots: the extra number replaces the copy.)
    if (other && other !== lead.mobile && (!lead.phone || lead.phone === lead.mobile)) set.phone = other;
    // Everything else the caller answered (incl. custom closing questions) goes into the notes, once per call.
    const standardInLead = new Set(['full_name', 'email', 'website', 'address', 'city', 'postal_code', 'country']);
    const noteBits = explicit.filter((f) => !standardInLead.has(f.key)).map((f) => `${f.label || CALLER_FIELDS.find((x) => x.key === f.key)?.label || f.key}: ${f.value}`);
    const marker = `[incoming call ${call.internalCallId}]`;
    if (noteBits.length && !(lead.notes || '').includes(marker)) {
      const block = `${marker} ${new Date(call.endedAt || Date.now()).toISOString().slice(0, 10)}\n${noteBits.join('\n')}`;
      const next = `${lead.notes ? `${lead.notes}\n\n` : ''}${block}`;
      if (next.length <= 5000) set.notes = next;
    }
    // Status: a conversation moves NEW → CONTACTED; QUALIFIED only from the explicit criteria.
    if (call.answeredBy && lead.status === LEAD_STATUS.NEW) set.status = LEAD_STATUS.CONTACTED;
    if (qualification?.result === 'QUALIFIED' && settings.qualification?.promoteLeadStatus !== false && !PROTECTED_LEAD_STATUSES.has(lead.status)) set.status = LEAD_STATUS.QUALIFIED;
    await Lead.updateOne({ _id: lead._id }, { $set: set });

    const answers = [];
    const need = [value('service_interest'), value('requirements'), value('current_challenges')].filter(Boolean).join(' — ');
    if (need) answers.push({ fieldKey: 'need', value: need.slice(0, 2000), status: 'answered' });
    if (value('job_title')) answers.push({ fieldKey: 'role', value: value('job_title'), status: 'answered' });
    if (value('callback_time') || call.callback?.whenText) answers.push({ fieldKey: 'callback_time', value: (value('callback_time') || call.callback.whenText).slice(0, 300), status: 'answered' });
    const asked = (call.questions || []).map((q) => q.text).join(' | ');
    if (asked) answers.push({ fieldKey: 'requested_info', value: asked.slice(0, 2000), status: 'answered' });
    if (call.summary?.objections?.length) answers.push({ fieldKey: 'objections', value: call.summary.objections.join('; ').slice(0, 2000), status: 'answered' });
    const pref = String(value('preferred_contact_method') || '').toLowerCase();
    if (['phone', 'sms', 'email', 'whatsapp'].includes(pref)) answers.push({ fieldKey: 'preferred_channel', value: pref, status: 'answered' });
    if (answers.length) {
      try {
        const qs = await qualificationService();
        await qs.mergeAnswers(lead._id, answers.map((a) => ({ ...a, evidence: `Incoming call ${call.internalCallId}` })), { source: 'ai_call_agent', userId: null });
      } catch (error) {
        logger.warn('Inbound call qualification answers not merged', { module: 'inbound-calls', callId: call.internalCallId, error: error.message });
      }
    }
    await InboundCall.updateOne({ _id: call._id }, { $set: { 'fields.$[f].appliedToLead': true } }, { arrayFilters: [{ 'f.supersededAt': null, 'f.explicit': true }] });
  }

  /**
   * The agent's routing after a call: assign the call to a person and set its work status.
   * Never overrides a status or assignment a person already set (re-processing is safe).
   */
  async _routeWork(id) {
    const call = await InboundCall.findById(id).lean();
    if (!call || call.isTest || call.work?.source === 'user') return;
    const agent = call.handling?.agentId ? await CallingAgent.findById(call.handling.agentId).select('inbound name').lean() : null;
    const routing = agent?.inbound || {};
    const agentUser = routing.assignToUserId && await User.exists({ _id: routing.assignToUserId, isDeleted: { $ne: true } }) ? routing.assignToUserId : null;
    const leadOwner = call.leadId ? (await Lead.findById(call.leadId).select('assignedTo').lean())?.assignedTo || null : null;
    const assignee = (routing.assignOverridesLeadOwner ? agentUser || leadOwner : leadOwner || agentUser) || call.assignedTo || null;
    const { status, reason } = autoWorkStatus({
      outcome: call.outcome, qualification: call.qualification?.result || null,
      followUpCreated: (call.followUpIds || []).length > 0, doNotContact: call.doNotContact, rules: routing.statusByResult || {},
    });
    const source = agent ? 'agent' : 'system';
    const changedAssignee = String(assignee || '') !== String(call.assignedTo || '');
    if (call.work?.status === status && !changedAssignee) return;
    await InboundCall.updateOne({ _id: id, 'work.source': { $ne: 'user' } }, {
      $set: { 'work.status': status, 'work.reason': reason, 'work.updatedAt': new Date(), 'work.updatedBy': null, 'work.source': source, ...(changedAssignee ? { assignedTo: assignee } : {}) },
      $push: { 'work.history': { $each: [{ from: call.work?.status || null, to: status, assignedFrom: changedAssignee ? call.assignedTo || null : null, assignedTo: changedAssignee ? assignee : null, by: null, source, reason, at: new Date() }], $slice: -100 } },
    });
    if (changedAssignee && assignee && String(assignee) !== String(call.createdBy)) {
      const who = call.caller?.name || call.caller?.e164 || 'A caller';
      this._notify(assignee, 'inbound_calls.assigned', 'NORMAL', 'Incoming call assigned to you', `${who} — ${status.replace(/_/g, ' ')}. Open the call to review it.`, call, `inbound-assigned-${call._id}-${assignee}`);
    }
  }

  async _automaticFollowUps(call, settings) {
    const a = settings.automation || {};
    if (!call.leadId) return;
    const pick = [];
    if (call.outcome === 'missed' && a.returnMissedCalls && call.handling?.mode !== 'ignore') pick.push('RETURN_MISSED_CALL');
    if (a.createFollowUps && call.qualification?.result && (a.followUpFor || []).includes(call.qualification.result)) {
      const first = (call.recommendations || []).find((r) => r.action !== 'REVIEW_CALLER_MATCH' && r.action !== 'RETURN_MISSED_CALL');
      if (first) pick.push(first.action);
    }
    for (const action of [...new Set(pick)]) {
      const rec = (call.recommendations || []).find((r) => r.action === action);
      if (rec && rec.status !== 'pending') continue;
      await this._followUpFor(call, action, { by: null, automatic: true });
    }
  }

  async _followUpFor(call, action, { by = null, automatic = false, dueAt = null, note = null } = {}) {
    const spec = ACTION_FOLLOW_UP[action] || ACTION_FOLLOW_UP.ARRANGE_CALLBACK;
    const due = dueAt ? new Date(dueAt) : new Date((call.endedAt ? new Date(call.endedAt).getTime() : Date.now()) + spec.dueHours * 3_600_000);
    const rec = (call.recommendations || []).find((r) => r.action === action);
    const text = note || [
      rec?.reason || null,
      call.summary?.text ? `Summary: ${call.summary.text}` : null,
      call.callback?.whenText ? `Requested time (as stated): "${call.callback.whenText}"` : null,
    ].filter(Boolean).join(' ');
    const svc = await followUps();
    const fu = await svc.upsertFromSource({
      sourceKey: `inbound_call:${call._id}:${action}`,
      leadId: call.leadId,
      ownerId: call.assignedTo || call.createdBy,
      dueAt: due,
      channel: spec.channel,
      note: text.slice(0, 2000) || null,
      source: { type: 'inbound_call', inboundCallId: call._id, callingAgentId: call.handling?.agentId || null, qualification: call.qualification?.result || null, recommendedAction: action, requestedTimeText: call.callback?.whenText || null },
      createdBy: by,
    });
    await InboundCall.updateOne({ _id: call._id }, { $addToSet: { followUpIds: fu._id } });
    await InboundCall.updateOne({ _id: call._id, 'recommendations.id': action }, { $set: { 'recommendations.$.status': 'executed', 'recommendations.$.followUpId': fu._id, 'recommendations.$.decidedBy': by, 'recommendations.$.decidedAt': new Date(), 'recommendations.$.automatic': automatic } });
    return fu;
  }

  _notifyOutcome(call, settings) {
    const a = settings.automation || {};
    const who = call.caller?.name || call.caller?.e164 || 'Private number';
    if (call.outcome === 'missed' && a.notifyMissed !== false && call.handling?.mode !== 'ignore') {
      const busy = call.handling?.aiBlockedBy === 'call_waiting' || call.handling?.reason === 'call_waiting';
      this._notify(call.createdBy, 'inbound_calls.missed', busy ? 'HIGH' : 'NORMAL', busy ? 'Missed call while the phone was busy' : 'Missed call',
        busy ? `${who} called while another call was in progress on ${call.deviceName || 'the phone'} and was not answered. Call them back.` : `${who} called and nobody answered.`, call, `inbound-missed-${call._id}`);
    }
    if (['interrupted', 'failed'].includes(call.outcome) && call.handling?.mode === 'ai') {
      this._notify(call.createdBy, 'inbound_calls.interrupted', 'HIGH', 'Incoming AI call was interrupted', `The call with ${who} ended unexpectedly. Collected information was saved.`, call, `inbound-interrupted-${call._id}`);
    }
    if (call.qualification?.result === 'QUALIFIED' && a.notifyQualified !== false) {
      this._notify(call.createdBy, 'inbound_calls.qualified', 'HIGH', 'Qualified caller', `${who} meets your qualification criteria.`, call, `inbound-qualified-${call._id}`);
    }
  }

  _notify(owner, type, priority, title, message, call, idempotencyKey) {
    notificationService.create({
      channels: ['IN_APP'], recipientIds: [owner], type, category: 'CRM', priority,
      payload: { title, message, inboundCallId: String(call._id), leadId: call.leadId ? String(call.leadId) : null, link: `/incoming-calls?call=${call._id}` },
      sourceModule: 'inbound-calls', sourceEvent: type.split('.')[1].toUpperCase(), sourceEntityType: 'InboundCall', sourceEntityId: call._id, idempotencyKey,
    }, owner).catch((e) => logger.warn('Inbound call notification failed', { module: 'inbound-calls', type, error: e.message }));
  }

  // ================================================================== sweep

  /**
   * Recovers sessions whose end report never came (gateway crash, laptop asleep, network):
   * nothing is redialled or answered; calls are only moved to an honest terminal state and
   * processed, keeping every collected detail.
   */
  async sweep(now = new Date()) {
    const stats = { missed: 0, interrupted: 0, finalized: 0, handoffExpired: 0 };
    const owners = new Map();
    const ringTimeout = async (owner) => {
      if (!owners.has(String(owner))) owners.set(String(owner), (await InboundSettings.findOne({ createdBy: owner }).select('ringTimeoutSeconds').lean())?.ringTimeoutSeconds || 45);
      return owners.get(String(owner));
    };
    const stuckRinging = await InboundCall.find({ processedAt: null, status: { $in: [...RINGING_STATUSES] }, lastEventAt: { $lt: new Date(now.getTime() - 45_000) } }).limit(100).lean();
    for (const c of stuckRinging) {
      if (now - new Date(c.detectedAt) < ((await ringTimeout(c.createdBy)) + 30) * 1000) continue;
      await this._transition(c._id, 'MISSED', { reason: 'no_end_report', set: { endedAt: now, endReason: 'no_end_report', ...(c.handling?.mode === 'ai' ? { aiStatus: 'unavailable' } : {}) } });
      if (c.roomName) livekit.endCall({ roomName: c.roomName }).catch(() => {});
      stats.missed += 1;
    }
    const stuckLive = await InboundCall.find({ processedAt: null, status: { $in: [...LIVE_STATUSES] }, lastEventAt: { $lt: new Date(now.getTime() - 10 * 60_000) } }).limit(100).lean();
    for (const c of stuckLive) {
      // A fresh heartbeat with the phone still in a call means the call is genuinely long.
      const device = c.deviceId ? await PairedDevice.findById(c.deviceId).select('lastHeartbeatAt state').lean() : null;
      if (device?.lastHeartbeatAt && now - new Date(device.lastHeartbeatAt) < 30_000 && device.state?.call) continue;
      await this._transition(c._id, 'INTERRUPTED', { reason: 'no_end_report', set: { endedAt: now, endReason: 'no_end_report', audioStatus: 'lost', durationSeconds: c.answeredAt ? secondsBetween(c.answeredAt, now) : 0 } });
      if (c.roomName) livekit.endCall({ roomName: c.roomName }).catch(() => {});
      stats.interrupted += 1;
    }
    const expiredHandoffs = await InboundCall.find({ processedAt: null, 'handoff.status': 'waiting', status: 'TRANSFERRING' }).limit(50).lean();
    for (const c of expiredHandoffs) {
      const wait = (await InboundSettings.findOne({ createdBy: c.createdBy }).select('handoffWaitSeconds').lean())?.handoffWaitSeconds || 30;
      if (now - new Date(c.gateway?.command?.requestedAt || c.handoff.requestedAt) < (wait + 30) * 1000) continue;
      await this._transition(c._id, 'AI_ACTIVE', { reason: 'takeover_not_confirmed' });
      stats.handoffExpired += 1;
    }
    const ready = await InboundCall.find({
      processedAt: null,
      $or: [
        { status: { $in: [...TERMINAL_STATUSES] } },
        { status: 'WRAPPING_UP', $or: [{ 'agentEnd.at': { $ne: null } }, { endedAt: { $lt: new Date(now.getTime() - AGENT_END_GRACE_MS) } }] },
      ],
      $and: [{ $or: [{ processingLeaseUntil: null }, { processingLeaseUntil: { $lt: now } }] }],
      processingErrors: { $lt: 5 },
    }).select('_id').limit(100).lean();
    for (const c of ready) {
      try { if (await this.finalize(c._id)) stats.finalized += 1; } catch { /* counted on the document; retried next sweep */ }
    }
    return stats;
  }

  // ================================================================== helpers

  async _transition(id, to, { reason = null, source = 'system', set = {}, at = new Date() } = {}) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const current = await InboundCall.findById(id).select('status').lean();
      if (!current) return false;
      const plan = planTransition(current.status, to, { at, reason, source });
      if (!plan) return false;
      const res = await InboundCall.updateOne({ _id: id, ...plan.filter }, { $set: { ...plan.set, ...set, lastEventAt: new Date() }, $push: plan.push });
      if (res.modifiedCount === 1) return true;
    }
    return false;
  }

  /** Persist the event BEFORE applying it. false = already seen (replay). */
  async _event(inboundCallId, eventKey, source, type, payload = null, occurredAt = new Date()) {
    try {
      await InboundCallEvent.create({ eventKey: eventKey.slice(0, 200), inboundCallId, source, type, payload, occurredAt });
      return true;
    } catch (error) {
      if (error?.code === 11000) return false;
      throw error;
    }
  }

  async _ownedByOwner(owner, id) {
    if (!mongoose.isValidObjectId(id)) throw new NotFoundError('InboundCall', id);
    const call = await InboundCall.findOne({ _id: id, createdBy: owner });
    if (!call) throw new NotFoundError('InboundCall', id);
    return call;
  }

  _emit(call, event) {
    if (!call) return;
    emit(call.createdBy, 'inbound-call:update', {
      id: String(call._id), callId: call.internalCallId, event, status: call.status, aiStatus: call.aiStatus, audioStatus: call.audioStatus,
      handling: call.handling?.mode || null, leadId: call.leadId ? String(call.leadId) : null, deviceId: call.deviceId ? String(call.deviceId) : null,
    });
  }

  _audit(eventType, userId, meta = {}, details = {}) {
    try {
      auditService.logEvent({ eventType, userId, ipAddress: meta.ipAddress || 'internal', userAgent: meta.userAgent, result: 'success', module: 'inbound-calls', details });
    } catch { /* audit is best-effort */ }
  }
}

function secondsBetween(a, b) {
  if (!a || !b) return 0;
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000));
}

function sanitizeStats(d = {}) {
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  return {
    rxLevelDbfs: num(d.rxLevelDbfs), txLevelDbfs: num(d.txLevelDbfs), upFrames: num(d.upFrames), downFrames: num(d.downFrames),
    upSeqGaps: num(d.upSeqGaps), downUnderruns: num(d.downUnderruns), downOverruns: num(d.downOverruns), firstAiAudioMs: num(d.firstAiAudioMs),
    agentConnected: Boolean(d.agentConnected), at: new Date(),
  };
}

/** Fallback summary when the agent could not write one (interrupted call): facts only. */
function systemSummary(call, intents, fields) {
  const explicit = fields.filter((f) => f.explicit !== false);
  const v = (k) => explicit.find((f) => f.key === k)?.value;
  return {
    reason: v('reason_for_call') || v('service_interest') || null,
    text: [
      intents.primary ? `Inquiry: ${intents.primary.toLowerCase().replace(/_/g, ' ')}.` : null,
      explicit.length ? `Caller provided: ${explicit.map((f) => `${f.key.replace(/_/g, ' ')} = ${f.value}`).join('; ')}.` : null,
      (call.questions || []).length ? `Questions asked: ${call.questions.map((q) => q.text).join(' | ')}.` : null,
      call.status === 'INTERRUPTED' ? 'The call ended unexpectedly; this summary was assembled from what was recorded.' : null,
    ].filter(Boolean).join(' ').slice(0, 4000) || null,
    requirements: [v('requirements'), v('additional_requirements')].filter(Boolean),
    unresolvedQuestions: (call.questions || []).filter((q) => q.answerStatus !== 'answered').map((q) => q.text).slice(0, 10),
  };
}

export default new InboundCallService();
