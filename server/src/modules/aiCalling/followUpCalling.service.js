import mongoose from 'mongoose';
import LeadFollowUp, { FOLLOW_UP_OPEN_STATUSES } from '../crm/leadFollowUp.model.js';
import Lead from '../crm/lead.model.js';
import CallingAgent from './callingAgent.model.js';
import CallCampaign from './callCampaign.model.js';
import CampaignRecipient from './campaignRecipient.model.js';
import CallRecord from './callRecord.model.js';
import AiCallingSettings from './aiCallingSettings.model.js';
import { checkContactSuppression } from '../crm/leadContactSuppression.js';
import notificationService from '../notifications/notification.service.js';
import auditService from '../auth/audit.service.js';
import logger from '../../shared/logger/index.js';
import { AuthorizationError, ConflictError, NotFoundError, ValidationError } from '../../shared/errors/AppError.js';
import { resolveCallbackTime, localTimeLine } from './engine/callbackTime.js';
import {
  AUTOMATION_ACTIVE_STATES, AUTOMATION_TERMINAL_STATES, DEFAULT_FOLLOW_UP_CONFIG, canTransition, classifyOutcome, decideFollowUp,
  pipelineStageForOutcome,
} from './engine/followUpDecision.js';
import { buildFollowUpContext, knownAnswers, prefilledAnswerState } from './engine/followUpContext.js';
import { recipientTimezone, isValidTimezone } from './engine/callWindow.js';
import { automationView } from './engine/followUpView.js';
import { leadActiveCall } from './leadCallLock.js';
import { effectiveRoutes } from './engine/followUpRouting.js';

export { automationView };

/**
 * AI follow-up calling — orchestration over existing building blocks.
 *
 *  - A follow-up is a LeadFollowUp with automation.mode 'ai' (inbox, mobile, SLA sweep and
 *    lead timeline already show it). Its call is a single-lead CallCampaign (kind 'follow_up')
 *    launched with an idempotent launch key, so it uses the hardened dial pipeline unchanged:
 *    window + quiet hours, DNC/consent/contact policy, paired-phone lock, retry policy,
 *    ambiguous-dial parking and the reconciler.
 *  - Nothing lives in memory: due follow-ups are found by a persisted query every minute
 *    (jobs/followUpCalling.job.js) and claimed with a compare-and-set lease, so a restart
 *    loses nothing and two API instances never launch the same follow-up twice.
 *  - Automatic calls need the organisation switch AND the agent's automation; "Call now"
 *    is a deliberate human action and needs only the agent's manual permission.
 */

const CLAIM_MS = 2 * 60_000;
const BUSY_DEFER_MS = 5 * 60_000;
const SETTINGS_TTL_MS = 5_000;
const ACTIVE_RECIPIENT = ['dialing', 'in_progress', 'processing'];
const TEST_PROVIDERS = new Set(['livekit_web', 'web_link_preview']);
const str = (v) => (v == null ? null : String(v));

let settingsCache = { at: 0, value: null };

function emit(userId, event, payload) {
  try { if (userId) global.io?.to(`user:${userId}`).emit(event, payload); } catch { /* realtime is best effort */ }
}

/** Agent follow-up config merged over the defaults (legacy agents have none). */
export function followUpConfigOf(agent) {
  const raw = agent?.followUp || {};
  return { ...DEFAULT_FOLLOW_UP_CONFIG, ...raw, routes: raw.routes || {}, triggers: raw.triggers?.length ? raw.triggers : DEFAULT_FOLLOW_UP_CONFIG.triggers };
}

/** Questionnaire for a follow-up call: the agent's questions + follow-up-only questions (deduped by field key). */
export function followUpQuestionnaire(agent) {
  const base = agent?.questionnaire?.questions || [];
  const seen = new Set(base.map((q) => q.fieldKey));
  const extra = (agent?.followUp?.questions || []).filter((q) => q.fieldKey && q.label && q.text && !seen.has(q.fieldKey))
    .map((q, i) => ({ ...q, order: (q.order ?? 0) + 1000 + i }));
  return { questions: [...base, ...extra] };
}

class FollowUpCallingService {
  // ------------------------------------------------------------ settings
  async settings({ fresh = false } = {}) {
    if (!fresh && settingsCache.value && Date.now() - settingsCache.at < SETTINGS_TTL_MS) return settingsCache.value;
    const doc = await AiCallingSettings.findOne({ key: 'global' }).select('followUpAutomation voicePaused').lean();
    const envOff = String(process.env.AI_FOLLOW_UP_AUTOMATION_ENABLED || '').toLowerCase() === 'false';
    const value = {
      enabled: Boolean(doc?.followUpAutomation?.enabled) && !envOff,
      forcedOffByEnv: envOff,
      pausedReason: doc?.followUpAutomation?.pausedReason || '',
      changedAt: doc?.followUpAutomation?.changedAt || null,
      changedBy: str(doc?.followUpAutomation?.changedBy),
      voicePaused: Boolean(doc?.voicePaused),
      escalationUserIds: (doc?.followUpAutomation?.escalationUserIds || []).map(String),
    };
    settingsCache = { at: Date.now(), value };
    return value;
  }

  async isAutomationEnabled() { return (await this.settings()).enabled; }

  async setSettings(actor, { enabled, reason = '', escalationUserIds } = {}, meta = {}) {
    const set = { updatedBy: actor };
    if (enabled !== undefined) Object.assign(set, { 'followUpAutomation.enabled': Boolean(enabled), 'followUpAutomation.pausedReason': enabled ? '' : String(reason || '').slice(0, 300), 'followUpAutomation.changedAt': new Date(), 'followUpAutomation.changedBy': actor });
    if (escalationUserIds !== undefined) set['followUpAutomation.escalationUserIds'] = [...new Set(escalationUserIds.map(String))].map((id) => new mongoose.Types.ObjectId(id));
    await AiCallingSettings.updateOne({ key: 'global' }, { $set: set, $setOnInsert: { key: 'global' } }, { upsert: true });
    settingsCache = { at: 0, value: null };
    if (enabled !== undefined) auditService.logEvent({ eventType: enabled ? 'ai_calling.follow_up_automation.enabled' : 'ai_calling.follow_up_automation.disabled', module: 'ai-calling', userId: actor,
      ipAddress: meta.ipAddress || 'internal', userAgent: meta.userAgent, result: 'success', details: { reason } });
    if (escalationUserIds !== undefined) auditService.logEvent({ eventType: 'ai_calling.follow_up_automation.escalation_recipients', module: 'ai-calling', userId: actor,
      ipAddress: meta.ipAddress || 'internal', userAgent: meta.userAgent, result: 'success', details: { count: escalationUserIds.length } });
    return this.settings({ fresh: true });
  }

  /**
   * Who takes over and who is told when a follow-up needs a person: the agent's escalation
   * recipients (or its legacy single recipient), else the organisation default, else the owner.
   * Only active users are used. Delivered in-app (global bell, any page) + push (Android app),
   * plus email when the agent asks for it; each user's own channel preferences still apply.
   */
  async escalationTargets(agent, fallbackOwnerId) {
    const cfg = agent?.followUp || {};
    let ids = (cfg.escalation?.userIds || []).map(String);
    let assignFirst = cfg.escalation?.assignTo === 'first_recipient';
    if (!ids.length && cfg.escalateToUserId) { ids = [String(cfg.escalateToUserId)]; assignFirst = true; }
    if (!ids.length) ids = (await this.settings()).escalationUserIds || [];
    const User = mongoose.models.User;
    const active = ids.length && User ? new Set((await User.find({ _id: { $in: ids }, status: 'active', isDeleted: { $ne: true } }).select('_id').lean()).map((u) => String(u._id))) : new Set();
    const recipients = ids.filter((id) => active.has(id));
    const owner = str(fallbackOwnerId);
    const assignTo = assignFirst && recipients[0] ? recipients[0] : owner;
    return {
      assignTo,
      notify: [...new Set([assignTo, owner, ...recipients].filter(Boolean))],
      channels: ['IN_APP', 'PUSH', ...(cfg.escalation?.email ? ['EMAIL'] : [])],
    };
  }

  // ------------------------------------------------------------ timing
  /** Timezone a follow-up time is read and scheduled in: agent follow-up schedule → campaign → lead country. */
  timezoneFor({ agent = null, campaign = null, recipient = null } = {}) {
    const candidates = [agent?.followUp?.schedule?.timezone, campaign?.schedule?.timezone, recipientTimezone(recipient?.country)];
    return candidates.find((tz) => tz && tz !== 'UTC' && isValidTimezone(tz)) || candidates.find((tz) => tz && isValidTimezone(tz)) || 'UTC';
  }

  /** When the callback requested on `call` should happen (used for human AND AI follow-ups). */
  async resolveCallbackFor({ call, campaign, recipient = null, outcome = null, now = new Date() }) {
    const agent = campaign?.agentId ? await CallingAgent.findById(campaign.agentId).select('followUp schedule').lean() : null;
    const config = followUpConfigOf(agent);
    const timezone = this.timezoneFor({ agent, campaign, recipient });
    const when = outcome?.callback?.requestedAt ?? call?.conversationState?.control?.callbackRequestedAt ?? null;
    const automated = agent && config.enabled && config.autoCall;
    return resolveCallbackTime(when, {
      now: call?.endedAt ? new Date(call.endedAt) : now, timezone,
      schedule: automated ? { ...(agent.followUp?.schedule || {}), timezone } : null,
      defaultDelayMinutes: config.defaultCallbackDelayMinutes,
    });
  }

  // ------------------------------------------------------------ planning (after every real call)
  /**
   * Runs after a campaign call was processed and its recipient finalized. Closes the
   * follow-up this call executed (follow-up campaigns), then lets the decision engine
   * schedule the next conversation, escalate to a human, or stop. Idempotent: every write
   * is keyed by the call id or guarded by the follow-up's state.
   */
  async afterCallProcessed({ call, campaign, outcome, disposition, requiredGaps = [] }) {
    if (!call || !campaign || campaign.isTest || call.isTest || TEST_PROVIDERS.has(call.provider)) return null;
    const recipient = await CampaignRecipient.findById(call.recipientId).select('state attemptCount country lastCallId phoneHash').lean();
    if (recipient && String(recipient.lastCallId) !== String(call._id)) return null; // superseded attempt
    const current = campaign.kind === 'follow_up' && campaign.followUpId ? await LeadFollowUp.findById(campaign.followUpId).lean() : null;

    // The campaign will redial this follow-up: just reflect it.
    if (recipient?.state === 'retry_scheduled') {
      if (current) await this._setState(current, 'retry_scheduled', { reason: disposition, set: { 'automation.callRecordId': call._id } });
      return { action: 'retry' };
    }

    const lead = await Lead.findById(call.leadId).select('_id name status type source assignedTo isDeleted address.country address.city sourceMetadata.businessType').lean();
    if (!lead || lead.isDeleted) {
      if (current) await this._finish(current, { state: 'cancelled', outcome: 'COMPLETED', reason: 'lead_unavailable', call });
      return { action: 'none' };
    }
    const agent = campaign.agentId ? await CallingAgent.findById(campaign.agentId).lean() : null;
    const config = followUpConfigOf(agent);
    const settings = await this.settings();
    const state = call.conversationState || {};
    const classification = classifyOutcome({
      disposition, outcome, control: state.control || {}, requiredGaps, behavior: state.behaviorMetrics || {},
      recipientState: recipient?.state || null,
    });
    const round = current?.automation?.round || 0;
    const hasActiveFollowUp = await LeadFollowUp.exists({ leadId: lead._id, _id: { $ne: current?._id || null }, 'automation.mode': 'ai',
      status: { $in: FOLLOW_UP_OPEN_STATUSES }, 'automation.state': { $in: ['scheduled', ...AUTOMATION_ACTIVE_STATES] } });
    // Routing rules on lead/call facts (source, language, country, city, status, business type) pick the agent.
    const routing = effectiveRoutes({ config, classification, lead, call });
    const decision = decideFollowUp({
      classification, config: { ...config, routes: routing.routes }, agentId: campaign.agentId, globalEnabled: settings.enabled, lead, round,
      callbackWhen: state.control?.callbackRequestedAt || outcome?.callback?.requestedAt || null, hasActiveFollowUp: Boolean(hasActiveFollowUp),
    });

    // 1. Close the follow-up this call executed. An escalation hands THAT item to a human.
    if (current) {
      // A permanently failed dial or an uncertain (parked) outcome is never closed silently.
      const failedRound = recipient?.state === 'failed' && !['DO_NOT_CONTACT', 'NOT_INTERESTED'].includes(classification);
      if (decision.action === 'escalate' || failedRound) {
        await this._escalate(current, { reason: failedRound ? (disposition === 'needs_review' ? 'call_outcome_uncertain' : 'call_failed') : decision.reason, outcome: classification, call, agent, lead });
      } else {
        const terminal = classification === 'TEMPORARILY_UNAVAILABLE' ? 'no_answer' : 'completed';
        await this._finish(current, { state: terminal, outcome: classification, reason: decision.reason, call });
      }
    }

    // 2. Apply the decision.
    const ownerId = lead.assignedTo || campaign.createdBy;
    let created = null;
    if (decision.action === 'stop') {
      await this._cancelOpenAiForLead(lead._id, { reason: decision.reason, exceptId: current?._id });
    } else if (decision.action === 'escalate' && !current) {
      created = await this._humanFollowUp({ call, campaign, lead, ownerId, agent, reason: classification, note: `AI follow-up needs a person: ${decision.reason.replaceAll('_', ' ')}.` });
    } else if (decision.action === 'schedule' && decision.mode === 'ai') {
      // The chain keeps pointing at the campaign it started from (campaign-level follow-up analytics).
      const originCampaignId = campaign.kind === 'follow_up' ? (current?.automation?.originCampaignId || null) : campaign._id;
      created = await this._scheduleAi({ call, campaign, lead, ownerId, decision, sourceAgent: agent, round: round + 1, previousFollowUpId: current?._id || null, recipient,
        originCampaignId, routingRule: routing.rule ? String(routing.rule.name || routing.rule.id || 'rule').slice(0, 120) : null });
    }
    const stage = pipelineStageForOutcome(decision.outcome);
    if (stage && decision.action === 'schedule') {
      await Lead.updateOne({ _id: lead._id, status: { $ne: 'converted' } }, { $set: { pipelineStage: stage } });
    }
    logger.info('AI follow-up decision', { module: 'ai-calling', callId: str(call._id), leadId: str(lead._id), outcome: decision.outcome, action: decision.action, mode: decision.mode, reason: decision.reason, created: str(created?._id) });
    return { ...decision, followUpId: str(created?._id) };
  }

  /** Upgrade (or create) the follow-up for this call into an AI-managed one. */
  async _scheduleAi({ call, campaign, lead, ownerId, decision, sourceAgent, round, previousFollowUpId, recipient, originCampaignId = null, routingRule = null }) {
    const target = await this._targetAgent(decision.agentId, sourceAgent, campaign.createdBy);
    if (!target) {
      // The routed agent can't take it: never drop a promised callback.
      return this._humanFollowUp({ call, campaign, lead, ownerId, agent: sourceAgent, reason: decision.outcome, note: 'No AI agent with follow-up calling enabled is available for this follow-up.' });
    }
    const config = followUpConfigOf(target);
    const timezone = this.timezoneFor({ agent: target, campaign, recipient });
    const endedAt = call.endedAt ? new Date(call.endedAt) : new Date();
    const resolved = resolveCallbackTime(decision.delay?.when || null, {
      now: endedAt, timezone, schedule: { ...(target.followUp?.schedule || {}), timezone },
      defaultDelayMinutes: decision.delay?.minutes ?? config.defaultCallbackDelayMinutes,
    });
    let dueAt = resolved.at;
    const minGapMs = (config.minHoursBetweenRounds || 0) * 3_600_000;
    if (minGapMs && dueAt.getTime() - endedAt.getTime() < minGapMs) dueAt = new Date(endedAt.getTime() + minGapMs);
    const automation = {
      mode: 'ai', agentId: target._id, state: 'scheduled', reason: decision.outcome, outcome: null, round,
      previousFollowUpId, previousCallId: call._id, originCampaignId, routingRule, campaignId: null, callRecordId: null, attempts: 0,
      notBefore: null, claimUntil: null, lastError: null, instructions: null,
      timeResolution: { kind: resolved.kind, approximate: resolved.approximate, requestedText: resolved.requestedText, evidence: resolved.evidence, shiftedFrom: resolved.shiftedFrom },
      stateChangedAt: new Date(), history: [{ state: 'scheduled', at: new Date(), reason: decision.outcome, by: null }],
    };
    // The callback path already wrote `ai_call:<callId>` (human task); upgrade that same item.
    const existing = await LeadFollowUp.findOne({ sourceKey: `ai_call:${call._id}` }).lean();
    if (existing && FOLLOW_UP_OPEN_STATUSES.includes(existing.status)) {
      if (existing.automation?.mode === 'ai') return existing; // idempotent re-run
      const doc = await LeadFollowUp.findOneAndUpdate({ _id: existing._id, 'automation.mode': { $ne: 'ai' } }, {
        $set: { automation, dueAt, nextDueAt: dueAt, timezone, taskType: 'AI_CALL', channel: 'phone', 'source.callingAgentId': target._id },
        $push: { actions: { action: 'rescheduled', at: new Date(), by: null, details: { via: 'ai_follow_up', dueAt, agentId: str(target._id) } } },
      }, { returnDocument: 'after' }).lean();
      this._emitChange(doc);
      return doc;
    }
    const { default: leadFollowUpService } = await import('../crm/leadFollowUp.service.js');
    const doc = await leadFollowUpService.upsertFromSource({
      sourceKey: `ai_follow_up:${call._id}`, leadId: lead._id, ownerId, dueAt, timezone, channel: 'phone',
      note: this._noteFor(decision.outcome, resolved), createdBy: null,
      source: { type: 'ai_call', callRecordId: call._id, campaignId: campaign._id, callingAgentId: target._id, qualification: call.qualification || null,
        recommendedAction: 'AI_FOLLOW_UP_CALL', requestedTimeText: resolved.approximate ? resolved.requestedText : null },
    });
    if (doc.automation?.mode === 'ai') return doc;
    const upgraded = await LeadFollowUp.findOneAndUpdate({ _id: doc._id, 'automation.mode': { $ne: 'ai' } }, { $set: { automation, taskType: 'AI_CALL' } }, { returnDocument: 'after' }).lean();
    this._emitChange(upgraded || doc);
    return upgraded || doc;
  }

  _noteFor(code, resolved) {
    const label = ({
      CALLBACK_REQUESTED: 'The lead asked to be called back.', INTERESTED_NEEDS_MORE_TIME: 'Interested, but needed time to decide.',
      INFORMATION_REQUESTED: 'The lead asked for more information.', TEMPORARILY_UNAVAILABLE: 'Not reachable on the previous attempts.',
      QUALIFICATION_INCOMPLETE: 'Required qualification answers are still missing.', APPOINTMENT_PENDING: 'An appointment still has to be agreed.',
      HANDOFF: 'Qualified — handed over for the next step.',
    })[code] || 'AI follow-up call.';
    const timing = resolved?.requestedText ? ` Requested time, as stated: "${resolved.requestedText.slice(0, 200)}".` : '';
    return `${label}${timing}`;
  }

  async _targetAgent(agentId, sourceAgent, owner) {
    const id = agentId || sourceAgent?._id;
    if (!id) return null;
    const agent = String(id) === String(sourceAgent?._id) ? sourceAgent : await CallingAgent.findOne({ _id: id, createdBy: owner }).lean();
    if (!agent || agent.availability === 'archived' || agent.usage === 'inbound') return null;
    if (!agent.followUp?.enabled) return String(id) === String(sourceAgent?._id) ? null : await this._targetAgent(null, sourceAgent, owner);
    return agent;
  }

  async _humanFollowUp({ call, campaign, lead, ownerId, agent = null, reason, note }) {
    const { default: leadFollowUpService } = await import('../crm/leadFollowUp.service.js');
    const targets = await this.escalationTargets(agent, ownerId);
    const doc = await leadFollowUpService.upsertFromSource({
      sourceKey: `ai_follow_up_human:${call._id}`, leadId: lead._id, ownerId: targets.assignTo, dueAt: call.endedAt || new Date(), channel: 'phone', note, createdBy: null,
      source: { type: 'ai_call', callRecordId: call._id, campaignId: campaign._id, callingAgentId: campaign.agentId || null, qualification: call.qualification || null, recommendedAction: 'HUMAN_FOLLOW_UP' },
    });
    await LeadFollowUp.updateOne({ _id: doc._id, 'automation.state': null }, { $set: { priority: 'HIGH', 'automation.mode': 'human', 'automation.state': 'requires_human', 'automation.reason': reason, 'automation.stateChangedAt': new Date() } });
    await LeadFollowUp.updateOne({ _id: doc._id, 'automation.originCampaignId': null }, { $set: { 'automation.originCampaignId': campaign.kind === 'follow_up' ? null : campaign._id } });
    await this._notify(targets.notify, { type: 'ai_calling.follow_up_human', title: `Follow-up needs a person: ${lead.name}`, message: note, leadId: lead._id, followUpId: doc._id, key: `ai-follow-up-human-${call._id}`, priority: 'HIGH', channels: targets.channels });
    return doc;
  }

  // ------------------------------------------------------------ state helpers
  async _setState(fu, next, { reason = null, by = null, set = {}, force = false } = {}) {
    const from = fu.automation?.state || null;
    if (from === next && !Object.keys(set).length) return fu;
    if (!force && from !== next && !canTransition(from, next)) {
      logger.warn('AI follow-up transition refused', { module: 'ai-calling', followUpId: str(fu._id), from, to: next });
      return null;
    }
    const filter = { _id: fu._id, 'automation.state': from };
    const update = { $set: { 'automation.state': next, 'automation.stateChangedAt': new Date(), ...set } };
    if (from !== next) update.$push = { 'automation.history': { $each: [{ state: next, at: new Date(), reason, by }], $slice: -50 } };
    const doc = await LeadFollowUp.findOneAndUpdate(filter, update, { returnDocument: 'after' }).lean();
    if (doc) this._emitChange(doc);
    return doc;
  }

  async _finish(fu, { state, outcome, reason, call = null }) {
    const done = await this._setState(fu, state, { reason, set: { 'automation.outcome': outcome, 'automation.claimUntil': null, ...(call ? { 'automation.callRecordId': call._id } : {}) }, force: AUTOMATION_ACTIVE_STATES.includes(fu.automation?.state) || fu.automation?.state === 'scheduled' });
    if (!done) return null;
    if (FOLLOW_UP_OPEN_STATUSES.includes(fu.status)) {
      const now = new Date();
      const summary = call?.callNotes?.summary ? String(call.callNotes.summary).slice(0, 1500) : null;
      await LeadFollowUp.updateOne({ _id: fu._id, status: { $in: FOLLOW_UP_OPEN_STATUSES } }, {
        $set: { status: state === 'cancelled' ? 'cancelled' : 'done', closedAt: now,
          ...(state === 'cancelled' ? { cancelledAt: now, cancelReason: `AI follow-up ${reason || 'cancelled'}` } : { completedAt: now, completionNote: [`AI follow-up call: ${outcome.replaceAll('_', ' ').toLowerCase()}.`, summary].filter(Boolean).join('\n') }) },
        $push: { actions: { action: state === 'cancelled' ? 'cancelled' : 'completed', at: now, by: null, details: { via: 'ai_follow_up', outcome, callId: str(call?._id) } } },
      });
    }
    return done;
  }

  async _escalate(fu, { reason, outcome, call = null, agent = null, lead = null }) {
    const routedAgent = agent || (fu.automation?.agentId ? await CallingAgent.findById(fu.automation.agentId).select('followUp').lean() : null);
    const targets = await this.escalationTargets(routedAgent, fu.ownerId);
    const owner = targets.assignTo;
    const leadName = lead?.name || (await Lead.findById(fu.leadId).select('name').lean())?.name || null;
    const doc = await this._setState(fu, 'requires_human', { reason, force: true, set: {
      'automation.mode': 'human', 'automation.outcome': outcome, 'automation.claimUntil': null, ownerId: owner, priority: 'HIGH',
      ...(call ? { 'automation.callRecordId': call._id } : {}),
    } });
    if (doc) {
      await LeadFollowUp.updateOne({ _id: fu._id }, { $push: { actions: { action: 'escalated', at: new Date(), by: null, details: { via: 'ai_follow_up', reason, outcome } } } });
      await this._notify(targets.notify, { type: 'ai_calling.follow_up_human', title: `Follow-up needs a person${leadName ? `: ${leadName}` : ''}`,
        message: `The AI follow-up stopped (${String(reason).replaceAll('_', ' ')}). Please take over.`, leadId: fu.leadId, followUpId: fu._id, key: `ai-follow-up-escalate-${fu._id}`, priority: 'HIGH', channels: targets.channels });
    }
    return doc;
  }

  async _cancelOpenAiForLead(leadId, { reason, exceptId = null, by = null }) {
    const rows = await LeadFollowUp.find({ leadId, _id: { $ne: exceptId }, 'automation.mode': 'ai', status: { $in: FOLLOW_UP_OPEN_STATUSES },
      'automation.state': { $nin: AUTOMATION_TERMINAL_STATES } }).lean();
    for (const fu of rows) {
      await this._stopCampaign(fu, by);
      await this._finish(fu, { state: 'cancelled', outcome: fu.automation?.outcome || 'COMPLETED', reason });
    }
    return rows.length;
  }

  async _stopCampaign(fu, actor = null) {
    if (!fu.automation?.campaignId) return;
    const campaign = await CallCampaign.findById(fu.automation.campaignId).select('status createdBy').lean();
    if (!campaign || ['completed', 'cancelled', 'failed'].includes(campaign.status)) return;
    const { default: calling } = await import('./aiCalling.service.js');
    await calling.cancelCampaign(campaign._id, campaign.createdBy, {}).catch((e) => logger.warn('follow-up campaign cancel failed', { module: 'ai-calling', error: e.message, actor: str(actor) }));
  }

  _emitChange(fu) {
    if (!fu) return;
    emit(str(fu.ownerId), 'lead:follow-up', { type: 'automation', followUpId: str(fu._id), leadId: str(fu.leadId), state: fu.automation?.state || null });
  }

  /** One notification to every recipient (in-app bell on any page + push to the app by default). */
  async _notify(userIds, { type, title, message, leadId, followUpId, key, priority = 'NORMAL', channels = ['IN_APP'] }) {
    const recipients = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean).map(String))];
    if (!recipients.length) return;
    await notificationService.create({
      channels, recipientIds: recipients, type, category: 'CRM', priority,
      payload: { title, message, leadId: str(leadId), followUpId: str(followUpId), link: `/leads/follow-ups?followUp=${str(followUpId)}` },
      sourceModule: 'ai-calling', sourceEvent: 'AI_FOLLOW_UP', sourceEntityType: 'LeadFollowUp', sourceEntityId: followUpId, idempotencyKey: key,
    }, recipients[0]).catch((e) => logger.warn('AI follow-up notification failed', { module: 'ai-calling', error: e.message }));
    // Live refresh of the Follow-ups page / app agenda for everyone told.
    for (const id of recipients) emit(id, 'lead:follow-up', { type: 'escalated', followUpId: str(followUpId), leadId: str(leadId) });
  }

  // ------------------------------------------------------------ dispatcher
  /**
   * Persisted dispatcher (every minute). Claims due AI follow-ups and launches their call;
   * repairs follow-ups whose call/campaign finished without a hook (crash recovery).
   */
  async sweep({ now = new Date(), limit = 25 } = {}) {
    const repaired = await this.reconcile({ now });
    const settings = await this.settings({ fresh: true });
    if (!settings.enabled) return { disabled: true, repaired, launched: 0 };
    const due = await LeadFollowUp.find({
      'automation.mode': 'ai', 'automation.state': 'scheduled', status: { $in: FOLLOW_UP_OPEN_STATUSES }, nextDueAt: { $lte: now },
      $and: [
        { $or: [{ 'automation.notBefore': null }, { 'automation.notBefore': { $lte: now } }] },
        { $or: [{ 'automation.claimUntil': null }, { 'automation.claimUntil': { $lt: now } }] },
      ],
    }).sort({ nextDueAt: 1 }).limit(limit).select('_id').lean();
    let launched = 0; const results = [];
    for (const { _id } of due) {
      const claimed = await this._claim(_id, now);
      if (!claimed) continue;
      try {
        const r = await this._execute(claimed, { manual: false });
        if (r?.launched) launched += 1;
        results.push({ followUpId: str(_id), ...r });
      } catch (error) {
        logger.error('AI follow-up launch failed', { module: 'ai-calling', followUpId: str(_id), error: error.message });
        await this._defer(claimed, 'launch_error', BUSY_DEFER_MS, error.message);
      }
    }
    return { launched, considered: due.length, repaired, results };
  }

  async _claim(id, now = new Date()) {
    return LeadFollowUp.findOneAndUpdate({
      _id: id, 'automation.mode': 'ai', 'automation.state': 'scheduled', status: { $in: FOLLOW_UP_OPEN_STATUSES },
      $or: [{ 'automation.claimUntil': null }, { 'automation.claimUntil': { $lt: now } }],
    }, { $set: { 'automation.claimUntil': new Date(now.getTime() + CLAIM_MS) } }, { returnDocument: 'after' }).lean();
  }

  async _defer(fu, reason, ms, message = null) {
    await LeadFollowUp.updateOne({ _id: fu._id, 'automation.state': 'scheduled' }, { $set: {
      'automation.notBefore': new Date(Date.now() + ms), 'automation.claimUntil': null, 'automation.lastError': String(message || reason).slice(0, 300),
    } });
    return { deferred: reason };
  }

  /** Gates + launch of one claimed follow-up. Returns { launched } | { deferred } | { skipped }. */
  async _execute(fu, { manual = false, actor = null } = {}) {
    const fail = async (state, reason, message) => {
      await LeadFollowUp.updateOne({ _id: fu._id }, { $set: { 'automation.lastError': String(message || reason).slice(0, 300), 'automation.claimUntil': null } });
      if (state === 'requires_human') await this._escalate({ ...fu }, { reason, outcome: fu.automation?.reason || 'COMPLETED' });
      else await this._finish(fu, { state, outcome: fu.automation?.reason || 'COMPLETED', reason });
      if (manual) throw new ConflictError(message || reason);
      return { skipped: reason };
    };
    const settings = await this.settings({ fresh: true });
    if (!manual && !settings.enabled) return this._defer(fu, 'automation_disabled', 60_000);
    const agent = fu.automation?.agentId ? await CallingAgent.findById(fu.automation.agentId).lean() : null;
    if (!agent || agent.availability === 'archived') return fail('requires_human', 'agent_unavailable', 'The assigned AI agent no longer exists or is archived');
    const config = followUpConfigOf(agent);
    if (!config.enabled) return fail('requires_human', 'agent_follow_up_disabled', `Follow-up calling is turned off for ${agent.name}`);
    if (!manual && !config.autoCall) return fail('requires_human', 'agent_auto_call_disabled', `Automatic follow-up calls are turned off for ${agent.name}`);
    if (manual && config.manualCall === false) throw new ConflictError(`Manual follow-up calls are turned off for ${agent.name}`);
    if (agent.availability !== 'active') {
      if (manual) throw new ConflictError(`${agent.name} is ${agent.availability}. Activate the agent first.`);
      return this._defer(fu, 'agent_not_active', 15 * 60_000, `${agent.name} is ${agent.availability}`);
    }
    if (settings.voicePaused) {
      if (manual) throw new ConflictError('AI voice calling is paused (kill switch). Resume it in AI Calling settings first.');
      return this._defer(fu, 'voice_paused', 10 * 60_000);
    }
    const lead = await Lead.findById(fu.leadId).select('_id name status isDeleted').lean();
    if (!lead || lead.isDeleted) return fail('cancelled', 'lead_unavailable', 'The lead no longer exists');
    if (lead.status === 'converted' || (config.stopLeadStatuses || []).includes(lead.status)) return fail('cancelled', 'lead_status_stop', `Lead status is ${lead.status}`);
    const suppression = await checkContactSuppression(lead._id, 'phone');
    if (suppression?.suppressed) return fail('cancelled', 'do_not_contact', `Contact blocked: ${suppression.reason}`);
    if (await this.leadBusy(lead._id, { exceptFollowUpId: fu._id })) {
      if (manual) throw new ConflictError('This lead is already on a call or has another follow-up call in progress');
      return this._defer(fu, 'lead_busy', BUSY_DEFER_MS, 'Another call with this lead is in progress');
    }

    const { default: calling, assertQuestionnaire } = await import('./aiCalling.service.js');
    const questionnaire = followUpQuestionnaire(agent);
    try { assertQuestionnaire(questionnaire); } catch (e) { return fail('requires_human', 'agent_not_ready', `Agent questionnaire: ${e.message}`); }
    const launchNumber = (fu.automation?.attempts || 0) + 1;
    const launchKey = `follow-up-${fu._id}-${launchNumber}`;
    const owner = agent.createdBy;
    const timezone = config.schedule?.timezone || agent.schedule?.timezone || 'UTC';
    const agentConfig = {
      ...(agent.agentConfig || {}), agentName: agent.name,
      objective: (config.objective || '').trim() || agent.agentConfig?.objective || '',
      instructions: [agent.agentConfig?.instructions, config.instructions, fu.automation?.instructions].filter((s) => s && String(s).trim()).join('\n\n').slice(0, 4000),
    };
    let campaign = await CallCampaign.findOne({ createdBy: owner, agentId: agent._id, launchKey }).lean();
    try {
      if (!campaign) {
        campaign = await calling.createCampaign({
          name: `Follow-up · ${lead.name}`.slice(0, 160), description: `AI follow-up (${(fu.automation?.reason || 'MANUAL').replaceAll('_', ' ').toLowerCase()})`,
          channel: 'voice', agentConfig, questionnaire, statusRules: agent.statusRules || [], schedule: { ...(config.schedule || {}), timezone },
          transport: agent.transport || 'cloud_sip', pairedDeviceId: agent.transport === 'paired_phone' ? agent.pairedDeviceId : null,
          selection: { mode: 'explicit', leadIds: [String(lead._id)] }, scheduledAt: null,
        }, owner, {}, {
          agentId: agent._id, kind: 'follow_up', followUpId: fu._id, launchKey, initializationPending: true,
          agentSnapshot: { name: agent.name, title: agent.title, description: agent.description, avatarFileId: agent.avatarFileId, avatarPresetId: agent.avatarPresetId, version: agent.version, agentType: agent.agentType || 'custom' },
        });
      }
      if (campaign.initializationPending) await calling.recoverCampaignInitialization(campaign._id, owner);
      await LeadFollowUp.updateOne({ _id: fu._id }, { $set: { 'automation.campaignId': campaign._id, 'automation.attempts': launchNumber } });
      if (['draft', 'paused', 'scheduled'].includes(campaign.status)) {
        await calling.startCampaign(campaign._id, owner, { startNow: manual, scheduledAt: null }, { ipAddress: 'internal' });
      }
    } catch (error) {
      if (error?.code === 11000) return this._defer(fu, 'launch_race', 30_000);
      const msg = error?.message || 'launch failed';
      if (campaign?._id) await CallCampaign.updateOne({ _id: campaign._id, status: 'draft' }, { $set: { status: 'cancelled', cancelledAt: new Date() } });
      // Infrastructure (queue offline, device missing) → retry later; eligibility (no phone, no consent) → a person decides.
      if (error?.statusCode === 503 || /offline|unavailable|queue/i.test(msg)) {
        if (manual) throw error;
        return this._defer(fu, 'calling_unavailable', 10 * 60_000, msg);
      }
      return fail('requires_human', 'launch_refused', msg);
    }
    const queued = await this._setState(fu, 'queued', { reason: manual ? 'manual_call' : 'due', by: actor, set: {
      'automation.campaignId': campaign._id, 'automation.claimUntil': null, 'automation.lastError': null, 'automation.notBefore': null,
    } });
    auditService.logEvent({ eventType: manual ? 'ai_calling.follow_up.call_now' : 'ai_calling.follow_up.launched', module: 'ai-calling', userId: actor || owner,
      ipAddress: 'internal', result: 'success', details: { followUpId: str(fu._id), campaignId: str(campaign._id), agentId: str(agent._id), leadId: str(lead._id) } });
    return { launched: true, campaignId: str(campaign._id), followUp: queued };
  }

  /**
   * Lead-level lock used by the dispatcher: a live call with this lead in ANY campaign,
   * or another AI follow-up already queued/calling. (_dispatchCall applies the same rule
   * immediately before every dial, which is the authoritative check.)
   */
  async leadBusy(leadId, { exceptFollowUpId = null, exceptRecipientId = null } = {}) {
    const [call, followUp] = await Promise.all([
      leadActiveCall(leadId, { exceptRecipientId }), // outbound in any campaign, or an incoming call
      LeadFollowUp.exists({ leadId, _id: { $ne: exceptFollowUpId }, 'automation.mode': 'ai', 'automation.state': { $in: ['queued', 'calling'] } }),
    ]);
    return Boolean(call.busy || followUp);
  }

  // ------------------------------------------------------------ call pipeline hooks
  /** _dispatchCall: the provider accepted the follow-up call. */
  async markCalling(campaign, callId) {
    if (campaign?.kind !== 'follow_up' || !campaign.followUpId) return;
    const fu = await LeadFollowUp.findById(campaign.followUpId).lean();
    if (!fu || fu.automation?.state === 'calling') return;
    await this._setState(fu, 'calling', { reason: 'dialled', set: { 'automation.callRecordId': callId } });
  }

  /** _dispatchCall: a follow-up dial was rejected before connecting (recipient retried or failed). */
  async afterDispatchRejected(campaign, recipientId) {
    if (campaign?.kind !== 'follow_up' || !campaign.followUpId) return;
    const [fu, recipient] = await Promise.all([LeadFollowUp.findById(campaign.followUpId).lean(), CampaignRecipient.findById(recipientId).select('state').lean()]);
    if (!fu || !recipient) return;
    if (recipient.state === 'retry_scheduled') await this._setState(fu, 'retry_scheduled', { reason: 'dial_rejected' });
    else if (['failed', 'exhausted'].includes(recipient.state)) await this._escalate(fu, { reason: 'dial_failed', outcome: 'HUMAN_FOLLOW_UP_REQUIRED' });
  }

  /** Context section + prefilled answers for a follow-up call (getCallContext / _dispatchCall). */
  async contextFor(campaign, leadId, { now = new Date() } = {}) {
    if (campaign?.kind !== 'follow_up') return null;
    const [fu, lead, previousCalls] = await Promise.all([
      campaign.followUpId ? LeadFollowUp.findById(campaign.followUpId).lean() : null,
      Lead.findById(leadId).select('qualification.fields address').lean(),
      CallRecord.find({ leadId, campaignId: { $ne: campaign._id }, resultsProcessedAt: { $ne: null }, isTest: { $ne: true }, provider: { $nin: [...TEST_PROVIDERS] } })
        .sort({ endedAt: -1 }).limit(5).select('campaignId disposition callNotes answers endedAt createdAt').lean(),
    ]);
    const campaignIds = [...new Set(previousCalls.map((c) => String(c.campaignId)))];
    const campaigns = campaignIds.length ? await CallCampaign.find({ _id: { $in: campaignIds } }).select('agentSnapshot agentConfig.agentName').lean() : [];
    const agentNames = Object.fromEntries(campaigns.map((c) => [String(c._id), c.agentSnapshot?.name || c.agentConfig?.agentName || 'an AI agent']));
    const questions = campaign.questionnaire?.questions || [];
    const known = knownAnswers({ questions, previousCalls, qualificationFields: lead?.qualification?.fields || [] });
    const timezone = campaign.schedule?.timezone && campaign.schedule.timezone !== 'UTC' ? campaign.schedule.timezone : (recipientTimezone(lead?.address?.country) || campaign.schedule?.timezone || 'UTC');
    const section = [buildFollowUpContext({ followUp: fu || {}, previousCalls, questions, known, instructions: campaign.agentConfig?.instructions || '', agentNames }), localTimeLine(now, timezone)].join('\n');
    return { section, known, prefilled: prefilledAnswerState(known), previousCallId: previousCalls[0]?._id || fu?.automation?.previousCallId || null, followUpId: fu?._id || null };
  }

  // ------------------------------------------------------------ reconcile (recovery)
  /** Derive the state of active follow-ups from their campaign/recipient when a hook was missed. */
  async reconcile({ now = new Date(), limit = 100 } = {}) {
    const stale = new Date(now.getTime() - 3 * 60_000);
    const rows = await LeadFollowUp.find({ 'automation.mode': 'ai', 'automation.state': { $in: AUTOMATION_ACTIVE_STATES }, 'automation.stateChangedAt': { $lt: stale } })
      .limit(limit).lean();
    let repaired = 0;
    for (const fu of rows) {
      const campaign = fu.automation?.campaignId ? await CallCampaign.findById(fu.automation.campaignId).select('status').lean() : null;
      const recipient = campaign ? await CampaignRecipient.findOne({ campaignId: campaign._id }).select('state finalDisposition lastCallId').lean() : null;
      if (!campaign || !recipient) { await this._escalate(fu, { reason: 'campaign_missing', outcome: 'HUMAN_FOLLOW_UP_REQUIRED' }); repaired += 1; continue; }
      if (ACTIVE_RECIPIENT.includes(recipient.state)) { if (fu.automation.state !== 'calling') await this._setState(fu, 'calling', { reason: 'reconciled' }); continue; }
      if (recipient.state === 'retry_scheduled' || (recipient.state === 'queued' && campaign.status !== 'cancelled')) continue;
      const call = recipient.lastCallId ? await CallRecord.findById(recipient.lastCallId).select('resultsProcessedAt callNotes').lean() : null;
      if (call && !call.resultsProcessedAt) continue; // processing still owns it
      if (campaign.status === 'cancelled' || recipient.state === 'cancelled') await this._finish(fu, { state: 'cancelled', outcome: fu.automation.reason || 'COMPLETED', reason: 'campaign_cancelled', call });
      else if (['suppressed', 'ineligible'].includes(recipient.state)) await this._finish(fu, { state: 'skipped', outcome: 'DO_NOT_CONTACT', reason: recipient.state, call });
      else if (recipient.state === 'exhausted') await this._finish(fu, { state: 'no_answer', outcome: 'TEMPORARILY_UNAVAILABLE', reason: 'attempts_exhausted', call });
      else if (recipient.state === 'failed') await this._escalate(fu, { reason: recipient.finalDisposition === 'needs_reconcile' ? 'call_outcome_uncertain' : 'call_failed', outcome: 'HUMAN_FOLLOW_UP_REQUIRED', call });
      else await this._finish(fu, { state: 'completed', outcome: fu.automation.outcome || 'COMPLETED', reason: 'reconciled', call });
      repaired += 1;
    }
    return repaired;
  }

  // ------------------------------------------------------------ human controls
  /** viewer = { id, isSupervisor } (built from req.user by the controller, never from the request body). */
  _authorize(fu, viewer, agent = null) {
    const id = String(viewer.id);
    const mine = [fu.ownerId, fu.createdBy, agent?.createdBy].some((v) => v && String(v) === id);
    if (!mine && !viewer.isSupervisor) throw new AuthorizationError('Only the follow-up owner, the agent owner or a supervisor can change this follow-up');
  }

  async _load(id, user) {
    const fu = await LeadFollowUp.findById(id).lean();
    if (!fu) throw new NotFoundError('FollowUp', id);
    const agent = fu.automation?.agentId ? await CallingAgent.findById(fu.automation.agentId).select('createdBy name followUp availability usage').lean() : null;
    this._authorize(fu, user, agent);
    return { fu, agent };
  }

  async _view(id, user) {
    const { default: leadFollowUpService } = await import('../crm/leadFollowUp.service.js');
    return leadFollowUpService.getById(id, { id: String(user.id) });
  }

  /** Hand a follow-up to an AI agent (create dialog, "Change agent", re-arm after a human decision). */
  async assignAgent(id, { agentId, dueAt = null, instructions = null }, user, meta = {}) {
    const { fu } = await this._load(id, user);
    if (!FOLLOW_UP_OPEN_STATUSES.includes(fu.status)) throw new ConflictError('This follow-up is already closed');
    if (AUTOMATION_ACTIVE_STATES.includes(fu.automation?.state)) throw new ConflictError('A follow-up call is in progress. Cancel it before changing the agent');
    const agent = await CallingAgent.findById(agentId).lean();
    if (!agent || agent.availability === 'archived') throw new ValidationError('Choose an available AI agent');
    if (agent.usage === 'inbound') throw new ValidationError('This agent only answers incoming calls');
    if (!agent.followUp?.enabled) throw new ValidationError(`Turn on follow-up calling for ${agent.name} first`);
    this._authorize(fu, user, agent);
    const due = dueAt ? new Date(dueAt) : new Date(fu.nextDueAt);
    const now = new Date();
    const prev = fu.automation || {};
    const doc = await LeadFollowUp.findOneAndUpdate({ _id: fu._id, status: { $in: FOLLOW_UP_OPEN_STATUSES }, 'automation.state': prev.state ?? null }, {
      $set: {
        'automation.mode': 'ai', 'automation.agentId': agent._id, 'automation.state': 'scheduled', 'automation.reason': prev.reason || 'MANUAL',
        'automation.round': prev.round || 1, 'automation.claimUntil': null, 'automation.notBefore': null, 'automation.lastError': null,
        'automation.instructions': instructions != null ? String(instructions).slice(0, 2000) : (prev.instructions || null),
        'automation.stateChangedAt': now, taskType: 'AI_CALL', channel: 'phone', nextDueAt: due, ...(fu.status === 'snoozed' && due > now ? {} : { status: 'open', snoozedUntil: null }),
        'source.callingAgentId': agent._id,
      },
      $push: { 'automation.history': { $each: [{ state: 'scheduled', at: now, reason: prev.agentId ? 'agent_changed' : 'assigned_to_ai', by: user.id }], $slice: -50 },
        actions: { action: 'reassigned', at: now, by: user.id, details: { via: 'ai_follow_up', agentId: str(agent._id), from: str(prev.agentId) } } },
    }, { returnDocument: 'after' }).lean();
    if (!doc) throw new ConflictError('The follow-up changed meanwhile. Reload and try again');
    this._emitChange(doc);
    this._audit('ai_calling.follow_up.agent_assigned', user, meta, { followUpId: str(fu._id), agentId: str(agent._id) });
    return this._view(fu._id, user);
  }

  async callNow(id, user, meta = {}) {
    const { fu } = await this._load(id, user);
    if (fu.automation?.mode !== 'ai' || !fu.automation?.agentId) throw new ValidationError('Assign an AI agent to this follow-up first');
    if (!FOLLOW_UP_OPEN_STATUSES.includes(fu.status)) throw new ConflictError('This follow-up is already closed');
    if (AUTOMATION_ACTIVE_STATES.includes(fu.automation.state)) throw new ConflictError('A follow-up call is already in progress');
    if (fu.automation.state !== 'scheduled') {
      const rearmed = await this._setState(fu, 'scheduled', { reason: 'manual_call', by: user.id, force: true, set: { 'automation.claimUntil': null } });
      if (!rearmed) throw new ConflictError('The follow-up changed meanwhile. Reload and try again');
    }
    const claimed = await this._claim(fu._id);
    if (!claimed) throw new ConflictError('This follow-up is being started already');
    try { await this._execute(claimed, { manual: true, actor: user.id }); }
    catch (error) { await LeadFollowUp.updateOne({ _id: fu._id, 'automation.state': 'scheduled' }, { $set: { 'automation.claimUntil': null } }); throw error; }
    this._audit('ai_calling.follow_up.call_now', user, meta, { followUpId: str(fu._id) });
    return this._view(fu._id, user);
  }

  async pause(id, user, meta = {}) {
    const { fu } = await this._load(id, user);
    if (fu.automation?.mode !== 'ai') throw new ValidationError('This follow-up is not AI-managed');
    if (AUTOMATION_ACTIVE_STATES.includes(fu.automation.state)) await this._stopCampaign(fu, user.id);
    const doc = await this._setState(fu, 'paused', { reason: 'paused_by_user', by: user.id, force: AUTOMATION_ACTIVE_STATES.includes(fu.automation.state) });
    if (!doc) throw new ConflictError(`A ${fu.automation.state} follow-up cannot be paused`);
    this._audit('ai_calling.follow_up.paused', user, meta, { followUpId: str(fu._id) });
    return this._view(fu._id, user);
  }

  async resume(id, user, meta = {}) {
    const { fu } = await this._load(id, user);
    if (fu.automation?.state !== 'paused') throw new ConflictError('Only a paused follow-up can be resumed');
    if (!FOLLOW_UP_OPEN_STATUSES.includes(fu.status)) throw new ConflictError('This follow-up is already closed');
    await this._setState(fu, 'scheduled', { reason: 'resumed_by_user', by: user.id, set: { 'automation.notBefore': null, 'automation.claimUntil': null, 'automation.campaignId': null } });
    this._audit('ai_calling.follow_up.resumed', user, meta, { followUpId: str(fu._id) });
    return this._view(fu._id, user);
  }

  /** Take the follow-up away from the AI: a person handles it from now on. */
  async assignHuman(id, { ownerId = null } = {}, user, meta = {}) {
    const { fu } = await this._load(id, user);
    if (AUTOMATION_ACTIVE_STATES.includes(fu.automation?.state)) await this._stopCampaign(fu, user.id);
    const owner = ownerId || fu.ownerId;
    const now = new Date();
    await LeadFollowUp.updateOne({ _id: fu._id }, {
      $set: { 'automation.mode': 'human', 'automation.state': fu.automation?.state && !AUTOMATION_TERMINAL_STATES.includes(fu.automation.state) ? 'requires_human' : (fu.automation?.state || null),
        'automation.claimUntil': null, 'automation.stateChangedAt': now, ownerId: owner, taskType: 'PHONE_CALL' },
      $push: { 'automation.history': { $each: [{ state: 'requires_human', at: now, reason: 'assigned_to_human', by: user.id }], $slice: -50 },
        actions: { action: 'reassigned', at: now, by: user.id, details: { via: 'ai_follow_up', to: 'human', ownerId: str(owner) } } },
    });
    this._audit('ai_calling.follow_up.assigned_human', user, meta, { followUpId: str(fu._id), ownerId: str(owner) });
    return this._view(fu._id, user);
  }

  /** Pause every scheduled AI follow-up of one lead (lead-level automation pause). */
  async pauseLead(leadId, user, meta = {}) {
    const rows = await LeadFollowUp.find({ leadId, 'automation.mode': 'ai', status: { $in: FOLLOW_UP_OPEN_STATUSES }, 'automation.state': { $in: ['scheduled', ...AUTOMATION_ACTIVE_STATES] } }).lean();
    let paused = 0;
    for (const fu of rows) {
      try { await this.pause(fu._id, user, meta); paused += 1; } catch (e) { if (!(e instanceof AuthorizationError)) logger.warn('lead follow-up pause failed', { module: 'ai-calling', error: e.message }); }
    }
    return { paused };
  }

  async resumeLead(leadId, user, meta = {}) {
    const rows = await LeadFollowUp.find({ leadId, 'automation.mode': 'ai', status: { $in: FOLLOW_UP_OPEN_STATUSES }, 'automation.state': 'paused' }).select('_id').lean();
    let resumed = 0;
    for (const fu of rows) { try { await this.resume(fu._id, user, meta); resumed += 1; } catch { /* reported per item in the UI */ } }
    return { resumed };
  }

  /** leadFollowUp.service complete/cancel: stop the automation of a closed follow-up. */
  async onFollowUpClosed(followUpId, { status, by = null } = {}) {
    const fu = await LeadFollowUp.findById(followUpId).lean();
    if (!fu || fu.automation?.mode !== 'ai' || AUTOMATION_TERMINAL_STATES.includes(fu.automation?.state)) return;
    await this._stopCampaign(fu, by);
    await this._setState(fu, status === 'cancelled' ? 'cancelled' : 'completed', { reason: status === 'cancelled' ? 'cancelled_by_user' : 'completed_by_user', by, force: true, set: { 'automation.claimUntil': null } });
  }

  // ------------------------------------------------------------ read models
  /** Live call state for a follow-up's latest call (connected/processing live on CallRecord). */
  async callStates(followUps) {
    const ids = followUps.map((f) => f.automation?.callRecordId).filter(Boolean);
    if (!ids.length) return new Map();
    const calls = await CallRecord.find({ _id: { $in: ids } }).select('state disposition qualification durationSeconds answeredAt endedAt callNotes.summary cost').lean();
    return new Map(calls.map((c) => [String(c._id), c]));
  }

  async listForAgent(agentId, actor, { state = null, limit = 50 } = {}) {
    const agent = await CallingAgent.findOne({ _id: agentId, createdBy: actor }).select('_id').lean();
    if (!agent) throw new NotFoundError('CallingAgent', agentId);
    const filter = { 'automation.mode': { $in: ['ai', 'human'] }, 'automation.agentId': agent._id };
    if (state === 'active') filter['automation.state'] = { $in: ['scheduled', 'paused', ...AUTOMATION_ACTIVE_STATES] };
    else if (state) filter['automation.state'] = state;
    const rows = await LeadFollowUp.find(filter).sort({ nextDueAt: state === 'active' ? 1 : -1 }).limit(Math.min(200, limit)).lean();
    const leads = await Lead.find({ _id: { $in: rows.map((r) => r.leadId) } }).select('name leadNumber status phone mobile').lean();
    const byLead = new Map(leads.map((l) => [String(l._id), l]));
    const calls = await this.callStates(rows);
    return rows.map((r) => this.serializeAutomation(r, { lead: byLead.get(String(r.leadId)), call: calls.get(String(r.automation?.callRecordId)) }));
  }

  serializeAutomation(fu, { lead = null, call = null } = {}) {
    const a = fu.automation || {};
    return {
      id: str(fu._id), leadId: str(fu.leadId), status: fu.status, dueAt: fu.dueAt, nextDueAt: fu.nextDueAt, timezone: fu.timezone || null, note: fu.note || null,
      lead: lead ? { id: str(lead._id), name: lead.name, leadNumber: lead.leadNumber || null, status: lead.status, phone: lead.mobile || lead.phone || null } : null,
      automation: automationView(a, call),
    };
  }

  /**
   * Which follow-ups a summary/export covers, always within the actor's own agents/campaigns:
   * one agent, one ORIGIN campaign (every follow-up its calls produced, all rounds, AI or human),
   * or all of the actor's agents; optionally by creation date.
   */
  async _scope(actor, { agentId = null, campaignId = null, from = null, to = null } = {}) {
    const range = from || to ? { ...(from ? { $gte: new Date(from) } : {}), ...(to ? { $lte: new Date(to) } : {}) } : null;
    let match;
    if (campaignId) {
      const campaign = await CallCampaign.findOne({ _id: campaignId, createdBy: actor }).select('_id').lean();
      if (!campaign) throw new NotFoundError('CallCampaign', campaignId);
      match = { $or: [{ 'automation.originCampaignId': campaign._id }, { 'source.campaignId': campaign._id }] };
    } else {
      const agents = await CallingAgent.find({ createdBy: actor, ...(agentId ? { _id: agentId } : {}) }).select('_id').lean();
      match = { 'automation.agentId': { $in: agents.map((a) => a._id) } };
    }
    return { match: { ...match, ...(range ? { createdAt: range } : {}) }, range };
  }

  async summary(actor, filters = {}) {
    const { match, range } = await this._scope(actor, filters);
    const [states, outcomes, ids] = await Promise.all([
      LeadFollowUp.aggregate([{ $match: match }, { $group: { _id: '$automation.state', n: { $sum: 1 } } }]),
      LeadFollowUp.aggregate([{ $match: { ...match, 'automation.outcome': { $ne: null } } }, { $group: { _id: '$automation.outcome', n: { $sum: 1 } } }]),
      LeadFollowUp.find(match).select('_id').limit(20000).lean(),
    ]);
    const calls = await this._callStats(actor, ids.map((f) => f._id), filters.campaignId ? null : range);
    const byState = Object.fromEntries(states.map((s) => [s._id || 'none', s.n]));
    const byOutcome = Object.fromEntries(outcomes.map((s) => [s._id, s.n]));
    const total = Object.values(byState).reduce((a, b) => a + b, 0);
    return {
      total, byState, byOutcome,
      scheduled: byState.scheduled || 0, inProgress: (byState.queued || 0) + (byState.calling || 0) + (byState.retry_scheduled || 0),
      completed: byState.completed || 0, failed: (byState.failed || 0), noAnswer: byState.no_answer || 0,
      requiresHuman: byState.requires_human || 0, paused: byState.paused || 0, cancelled: (byState.cancelled || 0) + (byState.skipped || 0),
      callbacks: (byOutcome.CALLBACK_REQUESTED || 0) + (byOutcome.INTERESTED_NEEDS_MORE_TIME || 0),
      humanManaged: byState.none || 0,
      ...calls,
      automation: await this.settings(),
    };
  }

  /** CSV: one row per follow-up in scope, with its latest AI call (persisted data only). */
  async exportCsv(actor, filters = {}) {
    const { toCsv } = await import('../../shared/utils/csv.js');
    const { match } = await this._scope(actor, filters);
    const rows = await LeadFollowUp.find(match).sort({ createdAt: -1 }).limit(5000).lean();
    const [leads, agents, calls] = await Promise.all([
      Lead.find({ _id: { $in: rows.map((r) => r.leadId) } }).select('name leadNumber status').lean(),
      CallingAgent.find({ _id: { $in: rows.map((r) => r.automation?.agentId).filter(Boolean) } }).select('name').lean(),
      CallRecord.find({ _id: { $in: rows.map((r) => r.automation?.callRecordId).filter(Boolean) } }).select('disposition qualification durationSeconds cost.total endedAt').lean(),
    ]);
    const byId = (list) => new Map(list.map((x) => [String(x._id), x]));
    const L = byId(leads); const A = byId(agents); const C = byId(calls);
    const iso = (d) => (d ? new Date(d).toISOString() : '');
    const headers = ['followUpId', 'leadNumber', 'leadName', 'leadStatus', 'status', 'managedBy', 'agent', 'state', 'reason', 'outcome', 'round', 'callRuns', 'routingRule',
      'originCampaignId', 'dueAt', 'timezone', 'requestedTime', 'createdAt', 'closedAt', 'lastCallDisposition', 'lastCallQualification', 'lastCallSeconds', 'lastCallCost', 'lastError'];
    const data = rows.map((r) => {
      const a = r.automation || {}; const lead = L.get(String(r.leadId)) || {}; const call = C.get(String(a.callRecordId)) || {};
      return {
        followUpId: String(r._id), leadNumber: lead.leadNumber || '', leadName: lead.name || '', leadStatus: lead.status || '', status: r.status,
        managedBy: a.mode === 'ai' ? 'ai' : 'person', agent: A.get(String(a.agentId))?.name || '', state: a.state || '', reason: a.reason || '', outcome: a.outcome || '',
        round: a.round || '', callRuns: a.attempts || 0, routingRule: a.routingRule || '', originCampaignId: str(a.originCampaignId || r.source?.campaignId) || '',
        dueAt: iso(r.nextDueAt), timezone: r.timezone || '', requestedTime: a.timeResolution?.requestedText || r.source?.requestedTimeText || '',
        createdAt: iso(r.createdAt), closedAt: iso(r.closedAt), lastCallDisposition: call.disposition || '', lastCallQualification: call.qualification || '',
        lastCallSeconds: call.durationSeconds ?? '', lastCallCost: call.cost?.total ?? '', lastError: a.lastError || '',
      };
    });
    return String.fromCharCode(0xFEFF) + toCsv(headers, data);
  }

  /** Metrics over the CallRecords of follow-up campaigns — persisted data only. */
  async _callStats(actor, followUpIds, range) {
    const campaigns = followUpIds.length ? await CallCampaign.find({ createdBy: actor, kind: 'follow_up', followUpId: { $in: followUpIds }, isTest: { $ne: true } }).select('_id').lean() : [];
    if (!campaigns.length) return { attempts: 0, connected: 0, answerRate: 0, qualified: 0, qualificationRate: 0, avgDurationSeconds: 0, avgAttemptsPerLead: 0, leadsReached: 0, totalCost: 0, costPerCall: 0, costPerQualified: 0 };
    const [row] = await CallRecord.aggregate([
      { $match: { campaignId: { $in: campaigns.map((c) => c._id) }, resultsProcessedAt: { $ne: null }, provider: { $nin: [...TEST_PROVIDERS] }, ...(range ? { initiatedAt: range } : {}) } },
      { $group: {
        _id: null, attempts: { $sum: 1 },
        connected: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$answeredAt', null] }, null] }, 1, 0] } },
        qualified: { $sum: { $cond: [{ $eq: ['$qualification', 'qualified'] }, 1, 0] } },
        seconds: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$answeredAt', null] }, null] }, { $ifNull: ['$durationSeconds', 0] }, 0] } },
        cost: { $sum: { $ifNull: ['$cost.total', 0] } },
        leads: { $addToSet: '$leadId' },
        reached: { $addToSet: { $cond: [{ $ne: [{ $ifNull: ['$answeredAt', null] }, null] }, '$leadId', null] } },
      } },
    ]);
    if (!row) return { attempts: 0, connected: 0, answerRate: 0, qualified: 0, qualificationRate: 0, avgDurationSeconds: 0, avgAttemptsPerLead: 0, leadsReached: 0, totalCost: 0, costPerCall: 0, costPerQualified: 0 };
    const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
    return {
      attempts: row.attempts, connected: row.connected, answerRate: round(row.connected / row.attempts, 4),
      qualified: row.qualified, qualificationRate: row.connected ? round(row.qualified / row.connected, 4) : 0,
      avgDurationSeconds: row.connected ? Math.round(row.seconds / row.connected) : 0,
      avgAttemptsPerLead: row.leads.length ? round(row.attempts / row.leads.length) : 0,
      leadsReached: row.reached.filter(Boolean).length,
      totalCost: round(row.cost, 4), costPerCall: round(row.cost / row.attempts, 4), costPerQualified: row.qualified ? round(row.cost / row.qualified, 4) : 0,
    };
  }

  _audit(eventType, user, meta, details) {
    auditService.logEvent({ eventType, module: 'ai-calling', userId: user.id, ipAddress: meta.ipAddress || 'internal', userAgent: meta.userAgent, result: 'success', details });
  }
}

export default new FollowUpCallingService();
