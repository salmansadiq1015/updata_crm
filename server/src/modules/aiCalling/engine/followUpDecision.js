/**
 * Follow-up decision engine — pure, deterministic, unit-tested.
 *
 * Decides, from STRUCTURED call evidence (server-validated disposition, rule
 * outcome, explicit control flags, required-answer gaps, recipient retry
 * state), whether another conversation is needed, why, when, by which agent,
 * and whether it is an AI call or a human task. Free-text model output never
 * decides on its own: it only supplies the requested time text.
 *
 * Hard stops always win: do-not-contact, suppression, not interested, a
 * protected/stop lead status. Automation being off never stops the CRM from
 * recording a human follow-up for an explicit callback request.
 */
import { FOLLOW_UP_TRIGGERS } from './agentTypes.js';

export const FOLLOW_UP_OUTCOMES = Object.freeze([
  'CALLBACK_REQUESTED', 'INTERESTED_NEEDS_MORE_TIME', 'INFORMATION_REQUESTED', 'NO_ANSWER', 'BUSY',
  'TEMPORARILY_UNAVAILABLE', 'APPOINTMENT_PENDING', 'APPOINTMENT_CONFIRMATION_REQUIRED', 'QUALIFICATION_INCOMPLETE',
  'HUMAN_FOLLOW_UP_REQUIRED', 'NOT_INTERESTED', 'DO_NOT_CONTACT', 'COMPLETED', 'HANDOFF',
]);

/** Follow-up call lifecycle (LeadFollowUp.automation.state). Detailed call states stay on CallRecord. */
export const AUTOMATION_STATES = Object.freeze([
  'scheduled', 'queued', 'calling', 'retry_scheduled', 'paused',
  'completed', 'no_answer', 'busy', 'failed', 'cancelled', 'skipped', 'requires_human',
]);
export const AUTOMATION_ACTIVE_STATES = Object.freeze(['queued', 'calling', 'retry_scheduled']);
export const AUTOMATION_TERMINAL_STATES = Object.freeze(['completed', 'no_answer', 'busy', 'failed', 'cancelled', 'skipped', 'requires_human']);

const TRANSITIONS = Object.freeze({
  scheduled: ['queued', 'paused', 'cancelled', 'skipped', 'requires_human', 'scheduled'],
  queued: ['calling', 'scheduled', 'paused', 'cancelled', 'failed', 'skipped', 'retry_scheduled', 'completed', 'no_answer', 'busy', 'requires_human'],
  calling: ['completed', 'retry_scheduled', 'no_answer', 'busy', 'failed', 'cancelled', 'requires_human'],
  retry_scheduled: ['calling', 'completed', 'no_answer', 'busy', 'failed', 'cancelled', 'paused', 'requires_human'],
  paused: ['scheduled', 'cancelled', 'requires_human'],
  // Terminal states are final for this follow-up; a further conversation is a NEW follow-up (next round).
  completed: [], no_answer: [], busy: [], failed: [], cancelled: [], skipped: [], requires_human: [],
});

export function canTransition(from, to) {
  if (!from) return to === 'scheduled' || to === 'queued';
  return (TRANSITIONS[from] || []).includes(to);
}

export const DEFAULT_FOLLOW_UP_CONFIG = Object.freeze({
  enabled: false,
  autoCall: false,
  manualCall: true,
  triggers: ['CALLBACK_REQUESTED'],
  maxRounds: 3,
  minHoursBetweenRounds: 0,
  defaultCallbackDelayMinutes: 120,
  unavailableRetryHours: 24,
  incompleteRetryHours: 24,
  informationRetryHours: 48,
  needsTimeRetryDays: 3,
  stopLeadStatuses: ['converted', 'unqualified'],
  eligibleLeadStatuses: [],
  routes: {},
});

const STOP_ALWAYS = new Set(['converted']); // PROTECTED_LEAD_STATUSES: AI never works a converted lead

const result = (outcome, action, extra = {}) => ({ outcome, action, reason: extra.reason || outcome.toLowerCase(), mode: 'ai', delay: null, agentId: null, ...extra });

/**
 * Classify a finished call into a follow-up outcome (no gating yet).
 * @param {object} input
 * @param {string} input.disposition  server-derived call disposition
 * @param {object} input.outcome      statusRuleEngine.evaluateOutcome result
 * @param {object} [input.control]    conversationState.control (callback/human flags)
 * @param {string[]} [input.requiredGaps]
 * @param {object} [input.behavior]   conversationState.behaviorMetrics
 * @param {string|null} [input.recipientState] campaign recipient state AFTER finalization
 * @param {boolean} [input.suppressed]
 */
export function classifyOutcome({ disposition, outcome = {}, control = {}, requiredGaps = [], behavior = {}, recipientState = null, suppressed = false } = {}) {
  if (suppressed || disposition === 'do_not_contact' || outcome.action === 'mark_do_not_contact') return 'DO_NOT_CONTACT';
  if (disposition === 'declined' || outcome.action === 'mark_not_interested') return 'NOT_INTERESTED';
  if (control.humanRequested) return 'HUMAN_FOLLOW_UP_REQUIRED';
  if (disposition === 'callback_requested' || outcome.action === 'schedule_callback') {
    const note = `${control.callbackText || ''} ${outcome.callback?.note || ''}`;
    if (/\b(think|decide|discuss|consider|not ready|need time|überlegen|réfléchir)\b/i.test(note)) return 'INTERESTED_NEEDS_MORE_TIME';
    if (/\b(appointment|meeting|termin|rendez-vous)\b/i.test(note)) return 'APPOINTMENT_PENDING';
    return 'CALLBACK_REQUESTED';
  }
  if (outcome.action === 'mark_qualified' && outcome.qualification === 'qualified' && !outcome.requiresReview) return 'COMPLETED';
  if (['no_answer', 'voicemail', 'busy', 'failed'].includes(disposition)) {
    // The campaign retry policy owns attempts inside one follow-up; only an exhausted round is "unavailable".
    if (recipientState === 'exhausted') return 'TEMPORARILY_UNAVAILABLE';
    return disposition === 'busy' ? 'BUSY' : 'NO_ANSWER';
  }
  if ((behavior.information_requested || 0) > 0 && outcome.qualification !== 'qualified') return 'INFORMATION_REQUESTED';
  if (['answered_partial', 'interrupted', 'unresponsive'].includes(disposition) || requiredGaps.length) return 'QUALIFICATION_INCOMPLETE';
  if (disposition === 'needs_review' || outcome.requiresReview) return 'HUMAN_FOLLOW_UP_REQUIRED';
  return 'COMPLETED';
}

/**
 * Decide what happens next.
 * @returns {{ outcome, action: 'schedule'|'escalate'|'stop'|'complete'|'none', mode: 'ai'|'human',
 *             reason, agentId, delay: {when?:string, minutes?:number}|null }}
 *  - schedule: create a follow-up (AI call when mode 'ai', otherwise a human task)
 *  - escalate: create a human follow-up (requires_human) — never an AI call
 *  - stop:     cancel open automatic follow-ups for this lead, schedule nothing
 *  - complete: the follow-up goal was reached (may hand off via routes)
 *  - none:     nothing to do now (e.g. the campaign retry policy will redial)
 */
export function decideFollowUp({
  classification, config: rawConfig = {}, agentId = null, globalEnabled = false, lead = {}, round = 0,
  callbackWhen = null, hasActiveFollowUp = false,
} = {}) {
  const config = { ...DEFAULT_FOLLOW_UP_CONFIG, ...(rawConfig || {}) };
  const code = classification;
  const status = lead.status || null;
  const triggers = new Set((config.triggers?.length ? config.triggers : DEFAULT_FOLLOW_UP_CONFIG.triggers).filter((t) => FOLLOW_UP_TRIGGERS.includes(t)));
  const automated = Boolean(globalEnabled && config.enabled && config.autoCall);

  if (code === 'DO_NOT_CONTACT' || code === 'NOT_INTERESTED') return result(code, 'stop');
  if (status && STOP_ALWAYS.has(status)) return result(code, 'stop', { reason: 'lead_status_protected' });

  if (code === 'COMPLETED') {
    const next = config.routes?.QUALIFIED || null;
    if (next && String(next) !== String(agentId) && automated) {
      return result('HANDOFF', 'schedule', { reason: 'qualified_handoff', agentId: String(next), delay: { minutes: 5 } });
    }
    return result(code, 'complete');
  }
  if (code === 'HUMAN_FOLLOW_UP_REQUIRED') return result(code, 'escalate', { mode: 'human' });
  if (code === 'NO_ANSWER' || code === 'BUSY') return result(code, 'none', { reason: 'campaign_retry_policy' });

  const isCallback = ['CALLBACK_REQUESTED', 'INTERESTED_NEEDS_MORE_TIME', 'APPOINTMENT_PENDING'].includes(code);
  const delay = isCallback ? { when: callbackWhen, minutes: code === 'INTERESTED_NEEDS_MORE_TIME' && !callbackWhen ? config.needsTimeRetryDays * 24 * 60 : config.defaultCallbackDelayMinutes }
    : code === 'TEMPORARILY_UNAVAILABLE' ? { minutes: config.unavailableRetryHours * 60 }
      : code === 'INFORMATION_REQUESTED' ? { minutes: config.informationRetryHours * 60 }
        : { minutes: config.incompleteRetryHours * 60 };
  const routed = config.routes?.[code] ? String(config.routes[code]) : (agentId ? String(agentId) : null);

  // A callback variant ("needs time", "appointment") is covered by the plain callback trigger.
  const triggerKey = isCallback && !triggers.has(code) ? 'CALLBACK_REQUESTED' : code;
  // Explicit callback requests always become at least a human follow-up (existing CRM behaviour).
  if (!automated || !triggers.has(triggerKey)) {
    return isCallback ? result(code, 'schedule', { mode: 'human', reason: automated ? 'trigger_not_enabled' : 'automation_off', delay, agentId: routed })
      : result(code, 'none', { reason: automated ? 'trigger_not_enabled' : 'automation_off' });
  }
  if (status && (config.stopLeadStatuses || []).includes(status)) return result(code, 'stop', { reason: 'lead_status_stop' });
  if (config.eligibleLeadStatuses?.length && status && !config.eligibleLeadStatuses.includes(status)) {
    return isCallback ? result(code, 'schedule', { mode: 'human', reason: 'lead_status_not_eligible', delay, agentId: routed }) : result(code, 'none', { reason: 'lead_status_not_eligible' });
  }
  if (round + 1 > Math.max(1, config.maxRounds)) return result(code, 'escalate', { mode: 'human', reason: 'max_rounds_reached', agentId: routed });
  if (hasActiveFollowUp && !isCallback) return result(code, 'none', { reason: 'follow_up_already_active' });
  return result(code, 'schedule', { mode: 'ai', delay, agentId: routed });
}

/** Status a lead should get for an outcome, using ONLY existing CRM statuses; null = leave it. */
export function leadStatusForOutcome(code) {
  return ({ DO_NOT_CONTACT: 'unqualified', NOT_INTERESTED: 'unqualified' })[code] || null;
}

/** Pipeline stage (existing Lead.pipelineStage values) for an outcome; null = leave it. */
export function pipelineStageForOutcome(code) {
  return ['CALLBACK_REQUESTED', 'INTERESTED_NEEDS_MORE_TIME', 'INFORMATION_REQUESTED', 'TEMPORARILY_UNAVAILABLE',
    'QUALIFICATION_INCOMPLETE', 'APPOINTMENT_PENDING', 'HUMAN_FOLLOW_UP_REQUIRED', 'HANDOFF'].includes(code) ? 'FOLLOW_UP' : null;
}
