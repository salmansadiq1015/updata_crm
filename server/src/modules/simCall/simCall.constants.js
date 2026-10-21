/**
 * SIM call campaigns — AI-ASSISTED calling from the user's own phone and SIM.
 * The human talks; the app guides and captures; the server owns the campaign,
 * the task queue, the answers and the CRM sync. Android gives an ordinary app no
 * call audio, so nothing here ever claims an AI heard or spoke on the call.
 */
export const CAMPAIGN_STATUSES = Object.freeze(['draft', 'running', 'paused', 'completed', 'cancelled']);

/** Campaign lifecycle: allowed `from` states per action (validated server-side). */
export const CAMPAIGN_TRANSITIONS = Object.freeze({
  start: ['draft'],
  resume: ['paused'],
  pause: ['running'],
  cancel: ['draft', 'running', 'paused'],
});

export const TASK_STATES = Object.freeze([
  'pending',      // waiting to be called (possibly not before `notBefore`)
  'in_progress',  // claimed by a device (locked); a call may be happening
  'scheduled',    // callback booked for `notBefore`; not called before then
  'needs_review', // lock expired with no recorded outcome: the call may or may not have happened
  'completed',    // final outcome recorded
  'skipped',      // the user skipped it
  'ineligible',   // suppressed / no valid number / lead deleted
  'cancelled',    // campaign cancelled before it was called
]);
/** States the queue may hand out (subject to notBefore). */
export const CALLABLE_TASK_STATES = Object.freeze(['pending', 'scheduled']);
/** States that still need work (campaign is not finished while any exist). */
export const OPEN_TASK_STATES = Object.freeze(['pending', 'in_progress', 'scheduled', 'needs_review']);
/** States `retry` may return to pending. */
export const RETRYABLE_TASK_STATES = Object.freeze(['completed', 'skipped', 'needs_review', 'ineligible']);

/** Outcomes the user confirms after a call (the app never infers "answered" from dialling). */
export const CALL_OUTCOMES = Object.freeze([
  'answered', 'no_answer', 'busy', 'rejected', 'callback_requested', 'wrong_number', 'failed', 'cancelled',
]);
/** Outcomes that mean nobody was reached → retried up to maxAttempts. */
export const RETRY_OUTCOMES = Object.freeze(['no_answer', 'busy', 'failed']);
/** Outcomes that did not reach the network at all (no CRM contact is recorded). */
export const NO_CONTACT_OUTCOMES = Object.freeze(['failed', 'cancelled']);

export const OUTCOME_EVIDENCE = Object.freeze(['user', 'call_state', 'call_log']);
export const ANSWER_STATUSES = Object.freeze(['answered', 'unknown', 'skipped']);
export const CALLBACK_STATUSES = Object.freeze(['pending', 'done', 'cancelled']);
export const INTEREST_VALUES = Object.freeze(['interested', 'not_interested']);

export const EVENT_TYPES = Object.freeze([
  'campaign.created', 'campaign.updated', 'campaign.started', 'campaign.paused', 'campaign.resumed',
  'campaign.cancelled', 'campaign.completed',
  'task.claimed', 'task.released', 'task.dialed', 'task.answers_saved', 'task.completed', 'task.skipped',
  'task.lock_expired', 'task.retried', 'task.ineligible', 'task.callback_rescheduled', 'task.callback_cancelled',
  'task.callback_due', 'task.sync_failed', 'task.synced',
]);

export const LOCK_MS = 20 * 60_000;           // a claimed task stays locked this long without activity
export const MAX_LEADS = 500;
export const DEFAULT_SETTINGS = Object.freeze({
  timezone: 'UTC',
  callWindow: { start: '09:00', end: '19:00' },
  daysOfWeek: [1, 2, 3, 4, 5],
  countdownSeconds: 10,
  autoDial: false,
  maxAttempts: 2,
  retryDelayMinutes: 60,
  readAloud: true,
});

export const SIM_CALL_ERROR_CODES = Object.freeze({
  INVALID_TRANSITION: 'SIM_CALL_INVALID_TRANSITION',
  CAMPAIGN_NOT_RUNNING: 'SIM_CALL_CAMPAIGN_NOT_RUNNING',
  TASK_LOCKED: 'SIM_CALL_TASK_LOCKED',
  TASK_NOT_ACTIVE: 'SIM_CALL_TASK_NOT_ACTIVE',
  ALREADY_DIALED: 'SIM_CALL_ALREADY_DIALED',
  ATTEMPT_MISMATCH: 'SIM_CALL_ATTEMPT_MISMATCH',
  OUTCOME_CONFLICT: 'SIM_CALL_OUTCOME_CONFLICT',
  NOT_ELIGIBLE: 'SIM_CALL_NOT_ELIGIBLE',
  NOT_EDITABLE: 'SIM_CALL_NOT_EDITABLE',
});
