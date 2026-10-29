/**
 * Real-time voice calls on the SMS link page.
 *
 * The customer's browser joins a LiveKit room; the existing voice agent worker
 * (server/agent-worker: OpenAI Realtime, barge-in, server VAD) is dispatched into
 * the same room and drives the SAME CallRecord as the text chat through the agent
 * tool API — so answers, validation, status rules and the review queue are shared,
 * and a customer can switch between talking and typing without losing anything.
 *
 * The API key and LiveKit secret stay on the server: the browser only gets a
 * short-lived join token for one room. The worker gets a token scoped to this one
 * conversation (callAuth.issueAgentToken).
 */
import crypto from 'node:crypto';

import CallCampaign from '../aiCalling/callCampaign.model.js';
import aiCallingService from '../aiCalling/aiCalling.service.js';
import * as qEngine from '../aiCalling/engine/questionEngine.js';
import { issueAgentToken } from '../aiCalling/callAuth.js';
import livekit from '../aiCalling/providers/livekitSip.provider.js';
import auditService from '../auth/audit.service.js';
import logger from '../../shared/logger/index.js';
import LinkSession from './linkSession.model.js';
import linkAssistant, {
  LinkError, companyOf, emitToOwner, linkConfigOf, voiceInfo,
} from './linkAssistant.service.js';
import {
  CLOSED_SESSION_STATUSES, MAX_TRANSCRIPT_TURNS, OPEN_SESSION_STATUSES, VOICE_CUSTOMER_IDENTITY_PREFIX, VOICE_MAX_CONCURRENT,
} from './linkAssistant.constants.js';
import { buildVoiceInstructions, outcomeForEnd, voiceCallCost } from './engine/voice.js';
import { addCost, linkEvent } from './linkAssistant.metrics.js';

const DAY = 24 * 3_600_000;
// The lease outlives the call limit so a slow /end never frees a live room early.
const LEASE_GRACE_MS = 120_000;
const MAX_TRANSCRIPT_CHARS = 2000;

const maxConcurrent = () => Number(process.env.LINK_VOICE_MAX_CONCURRENT) || VOICE_MAX_CONCURRENT;
const apiBase = () => (process.env.LINK_VOICE_AGENT_API_BASE || process.env.PUBLIC_API_BASE_URL || `http://localhost:${process.env.PORT || 9097}`).replace(/\/$/, '');

class LinkVoiceService {
  // ------------------------------------------------------------ customer page
  /**
   * Start (or rejoin) the voice call for this conversation. Returns the LiveKit
   * URL and a join token for one room. Every gate the text chat has applies, plus
   * the voice ones: campaign opted in, LiveKit configured, budget, concurrency.
   */
  async start(token, deviceId, now = new Date()) {
    const t0 = Date.now();
    const { session, campaign } = await linkAssistant._authorized(token, deviceId);
    const cfg = linkConfigOf(campaign);
    if (CLOSED_SESSION_STATUSES.has(session.status)) throw new LinkError('SESSION_CLOSED', 409);
    if (await linkAssistant.isPaused()) throw new LinkError('VOICE_PAUSED', 503);
    const info = voiceInfo(cfg, session, now);
    if (!info.available) throw new LinkError('VOICE_UNAVAILABLE', 503);
    // Paused by the owner or by the daily AI budget: chats continue without the model, voice does not.
    if (!session.isTest && campaign.status !== 'running') throw new LinkError('VOICE_UNAVAILABLE', 503);
    if (!(await linkAssistant._spendAllowed(campaign, cfg))) throw new LinkError('VOICE_BUDGET', 503);
    if (!session.isTest) {
      const contact = await linkAssistant.contactStatus(session.leadId);
      if (contact.optedOut || contact.callsBlocked || contact.smsBlocked) throw new LinkError('LINK_OPTED_OUT', 410);
    }

    const maxSeconds = cfg.limits.maxVoiceMinutes * 60;
    // A live call already exists (page reload, second tab): rejoin the same room.
    if (info.active && session.voice?.roomName) return this._join(session, session.voice.roomName, maxSeconds, true);

    const active = await LinkSession.countDocuments({ 'voice.activeUntil': { $gt: now } });
    if (active >= maxConcurrent()) throw new LinkError('VOICE_BUSY', 503);

    const roomName = `link-voice-${session._id}-${(session.voice?.calls || 0) + 1}-${crypto.randomBytes(3).toString('hex')}`;
    const claimed = await LinkSession.findOneAndUpdate(
      { _id: session._id, $or: [{ 'voice.activeUntil': null }, { 'voice.activeUntil': { $lte: now } }] },
      {
        $set: {
          'voice.roomName': roomName, 'voice.activeUntil': new Date(now.getTime() + maxSeconds * 1000 + LEASE_GRACE_MS),
          'voice.requestedAt': now, 'voice.connectedAt': null, 'voice.endedAt': null, 'voice.endReason': null, lastActivityAt: now,
        },
        $inc: { 'voice.calls': 1 },
      },
      { returnDocument: 'after' },
    );
    if (!claimed) {
      // Lost a race with another tab that just started the call: join that one.
      const current = await LinkSession.findById(session._id).lean();
      if (current?.voice?.roomName) return this._join(current, current.voice.roomName, maxSeconds, true);
      throw new LinkError('VOICE_UNAVAILABLE', 503);
    }

    // The browser joins while the agent is dispatched (LiveKit Cloud takes ~1–2 s to
    // accept). If the dispatch fails the room is closed, and the page — whose agent never
    // arrived — says the assistant is unavailable.
    const tDispatch = Date.now();
    this.pendingDispatch = this._dispatch(roomName, {
      campaignId: String(campaign._id), callId: session.internalCallId, mode: 'web', channel: 'web_link',
      agentToolApi: `${apiBase()}/api/v1/ai-calling/agent`,
      agentToken: issueAgentToken(session.internalCallId, maxSeconds + 600),
      voice: campaign.agentConfig?.voice, language: session.language,
    }).then(async (dispatch) => {
      if (dispatch.outcome === 'accepted') {
        linkEvent('voice_requested');
        logger.info('link voice call requested', {
          module: 'link-assistant', sessionId: String(session._id), campaignId: String(campaign._id), roomName, checksMs: tDispatch - t0, dispatchMs: Date.now() - tDispatch,
        });
        return true;
      }
      await LinkSession.updateOne({ _id: session._id, 'voice.roomName': roomName }, { $set: { 'voice.activeUntil': null, 'voice.endedAt': new Date(), 'voice.endReason': 'dispatch_failed' } });
      await livekit.endCall({ roomName }).catch(() => {});
      linkEvent('voice_dispatch_failed');
      logger.warn('link voice: agent dispatch failed', { module: 'link-assistant', sessionId: String(session._id), outcome: dispatch.outcome, error: dispatch.errorMessage });
      return false;
    }).catch((error) => {
      logger.error('link voice: dispatch handling failed', { module: 'link-assistant', sessionId: String(session._id), error: error.message });
      return false;
    });
    return this._join(claimed, roomName, maxSeconds, false);
  }

  /**
   * Dispatch the agent; one network failure must not kill the call. An ambiguous
   * result (no answer from LiveKit) is resolved by asking whether the dispatch exists,
   * and only a dispatch that certainly does not exist is retried — never two agents.
   */
  async _dispatch(roomName, metadata) {
    const first = await livekit.dispatchAgent({ roomName, metadata });
    if (first.outcome !== 'ambiguous') return first;
    logger.warn('link voice: agent dispatch ambiguous; checking before retry', { module: 'link-assistant', roomName, error: first.errorMessage });
    const exists = await livekit.hasDispatch({ roomName });
    if (exists) return { ...first, outcome: 'accepted' };
    if (exists === null) return first; // cannot tell: do not risk a second agent
    return livekit.dispatchAgent({ roomName, metadata });
  }

  _join(session, roomName, maxSeconds, resumed) {
    const token = livekit.issueJoinToken({
      roomName, identity: `${VOICE_CUSTOMER_IDENTITY_PREFIX}${session._id}`, name: session.displayName || 'Customer', ttlSeconds: maxSeconds + 300,
    });
    if (!token) throw new LinkError('VOICE_UNAVAILABLE', 503);
    return { url: livekit.wsUrl, token, maxSeconds, resumed };
  }

  /** The customer hung up. Closes the room (the worker then reports /end) and returns the page state. */
  async end(token, deviceId, reason = 'customer_hangup') {
    const { session, campaign } = await linkAssistant._authorized(token, deviceId);
    await this._hangUp(session);
    await this._settle(session, campaign, { reason, roomName: session.voice?.roomName });
    return linkAssistant.pageModel(token, deviceId);
  }

  /** "Talk to a person" from the call screen: recorded like the chat's human request, then the call ends. */
  async requestHuman(token, deviceId) {
    const { session, campaign } = await linkAssistant._authorized(token, deviceId);
    if (CLOSED_SESSION_STATUSES.has(session.status)) throw new LinkError('SESSION_CLOSED', 409);
    await aiCallingService.agentRequestCallback(session.internalCallId, { when: null, note: 'Asked for a person during the voice call', human: true });
    await this._hangUp(session);
    await this._settle(session, campaign, { reason: 'human_requested', roomName: session.voice?.roomName });
    return linkAssistant.pageModel(token, deviceId);
  }

  async _hangUp(session) {
    if (!session.voice?.roomName || !session.voice.activeUntil) return;
    await livekit.endCall({ roomName: session.voice.roomName }).catch(() => {});
  }

  // ------------------------------------------------------- agent worker hooks
  /** Extra call context for a link conversation (null for every other call). */
  async contextFor(internalCallId) {
    const session = await LinkSession.findOne({ internalCallId }).lean();
    if (!session) return null;
    const campaign = await CallCampaign.findById(session.campaignId).lean();
    if (!campaign) return null;
    const cfg = linkConfigOf(campaign);
    const state = await linkAssistant._state(session);
    const company = companyOf(campaign);
    return {
      channel: 'web_link',
      transcriptionContext: { questions: (campaign.questionnaire?.questions || []).map(q => ({ text: q.text, type: q.type })) },
      participantIdentity: `${VOICE_CUSTOMER_IDENTITY_PREFIX}${session._id}`,
      persistTranscript: true,
      // Already disclosed in an earlier call or in the chat: a short hello, then the current step.
      disclosure: state.disclosed
        ? `Hello again, this is ${cfg.personaName}, ${company}'s AI assistant. Let's continue where we left off.`
        : (session.greeting || linkAssistant.greetingFor(campaign, session)),
      systemPrompt: buildVoiceInstructions({
        persona: cfg.personaName, company, tone: cfg.personaTone, language: session.language, languages: cfg.languages,
        reason: cfg.reason, objective: campaign.agentConfig?.objective, faq: cfg.faq, questions: campaign.questionnaire?.questions,
      }),
      agentConfig: {
        ...(campaign.agentConfig || {}),
        language: session.language,
        maxCallSeconds: cfg.limits.maxVoiceMinutes * 60,
        silenceTimeoutSeconds: Math.max(10, Number(campaign.agentConfig?.silenceTimeoutSeconds) || 12),
        allowBargeIn: true,
      },
    };
  }

  /** The customer is in the room and the agent is about to speak: the verified start of the call. */
  async connected(internalCallId, now = new Date()) {
    const session = await LinkSession.findOne({ internalCallId });
    if (!session) return null;
    const set = { 'voice.connectedAt': now, lastActivityAt: now };
    if (!session.funnel?.voice_started) set['funnel.voice_started'] = now;
    if (session.status === 'issued' || session.status === 'opened') set.status = 'active';
    if (!session.funnel?.chat_started) set['funnel.chat_started'] = now;
    await LinkSession.updateOne({ _id: session._id }, { $set: set });
    linkEvent('voice_started');
    emitToOwner(session.createdBy, 'link-assistant:session', { sessionId: String(session._id), status: 'active', voice: true });
    return { acknowledged: true };
  }

  /** One finished utterance from either side (idempotent per item id). */
  async transcript(internalCallId, { role, text, itemId }) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TRANSCRIPT_CHARS);
    if (!clean) return { stored: false };
    const now = new Date();
    const turn = { role, text: clean, at: now, kind: 'voice', source: 'voice', clientMessageId: itemId ? `v-${String(itemId).slice(0, 60)}` : null };
    const filter = { internalCallId };
    if (turn.clientMessageId) filter['transcript.clientMessageId'] = { $ne: turn.clientMessageId };
    const result = await LinkSession.updateOne(filter, {
      $push: { transcript: { $each: [turn], $slice: -MAX_TRANSCRIPT_TURNS } },
      $set: { lastActivityAt: now },
      ...(role === 'customer' ? { $inc: { turns: 1 } } : {}),
    });
    return { stored: result.modifiedCount === 1 };
  }

  /**
   * The worker's /end for a link conversation. Records the call's cost against
   * the campaign budget, then settles the conversation. Returns null for calls
   * that are not link conversations (the phone path handles those).
   */
  async agentEnded(internalCallId, { durationSeconds = null, cost = null, roomName = null } = {}) {
    const session = await LinkSession.findOne({ internalCallId });
    if (!session) return null;
    const campaign = await CallCampaign.findById(session.campaignId).lean();
    if (!campaign) return { acknowledged: true };
    const room = roomName || session.voice?.roomName;
    const seconds = Math.max(0, Math.round(Number(durationSeconds) || 0));
    const { amount, estimated } = voiceCallCost(cost?.breakdown?.usage, seconds);
    const charged = room ? await LinkSession.updateOne(
      { _id: session._id, 'voice.costedRooms': { $ne: room } },
      { $addToSet: { 'voice.costedRooms': room }, $inc: { 'voice.seconds': seconds, 'voice.cost': amount, 'usage.cost': amount } },
    ) : { modifiedCount: 0 };
    if (charged.modifiedCount === 1 && amount > 0) {
      addCost(amount);
      await linkAssistant._recordSpend(campaign, linkConfigOf(campaign), amount);
    }
    logger.info('link voice call ended', {
      module: 'link-assistant', sessionId: String(session._id), seconds, cost: amount, costEstimated: estimated,
    });
    await this._settle(session, campaign, { reason: 'agent_end', roomName: room });
    return { acknowledged: true };
  }

  /**
   * A call ended (any path, any order, idempotent). Releases the room lease. If
   * the engine says the conversation is over (all answered, opted out, callback
   * or person requested) the conversation is finished exactly like a finished
   * chat; otherwise it stays open so the customer can call again or type, and
   * the inactivity sweep sends partial answers to review.
   */
  async _settle(session, campaign, { reason, roomName }) {
    const now = new Date();
    if (roomName) {
      await LinkSession.updateOne(
        { _id: session._id, 'voice.roomName': roomName, 'voice.activeUntil': { $ne: null } },
        { $set: { 'voice.activeUntil': null, 'voice.endedAt': now, 'voice.endReason': reason } },
      );
    }
    const state = await linkAssistant._state(session);
    const action = qEngine.nextAction(campaign.questionnaire, state);
    if (action.type !== 'finish' && action.type !== 'end') return { ended: false };

    const outcome = outcomeForEnd(action, state.control || {});
    const status = outcome === 'opted_out' ? 'opted_out' : 'completed';
    const cfg = linkConfigOf(campaign);
    const closed = await LinkSession.findOneAndUpdate(
      { _id: session._id, status: { $in: [...OPEN_SESSION_STATUSES] } },
      {
        $set: {
          status, outcome, closedAt: now, awaiting: null,
          transcriptPurgeAt: new Date(now.getTime() + cfg.transcriptRetentionDays * DAY),
          [`funnel.${status === 'opted_out' ? 'opted_out' : 'completed'}`]: now,
        },
      },
      { returnDocument: 'after' },
    );
    await linkAssistant._finish(session).catch((e) => logger.error('link voice: result processing failed (the reconciler retries)', { module: 'link-assistant', sessionId: String(session._id), error: e.message }));
    if (!closed) return { ended: true };

    linkEvent(status === 'opted_out' ? 'opted_out' : 'completed');
    emitToOwner(session.createdBy, 'link-assistant:session', { sessionId: String(session._id), status, outcome });
    if (outcome === 'human_requested') await linkAssistant._notifyHuman(session, campaign);
    if (status === 'opted_out' && !session.isTest) {
      await linkAssistant.optOutLead({ leadId: session.leadId, actor: session.createdBy, source: 'web_link', keyword: 'voice', dedupeKey: `web_link:${session._id}`, meta: { ipAddress: 'customer' } })
        .catch((e) => logger.error('opt-out propagation failed', { module: 'link-assistant', sessionId: String(session._id), error: e.message }));
    }
    auditService.logEvent({
      eventType: 'link_assistant.voice.finished', userId: session.createdBy, result: 'success', module: 'link-assistant',
      details: { sessionId: String(session._id), outcome, reason },
    });
    return { ended: true, outcome };
  }
}

export default new LinkVoiceService();
