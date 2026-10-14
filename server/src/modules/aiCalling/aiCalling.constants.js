/**
 * AI Voice Calling — shared constants and small pure helpers.
 *
 * This module is single-tenant like the rest of the CRM: every record is scoped
 * by `createdBy`. It is deliberately independent of `modules/messaging` (which
 * is being actively developed) but mirrors its house conventions.
 *
 * A deliberate separation runs through the whole module:
 *   - CALL_STATE  — the *technical* lifecycle of one call attempt.
 *   - DISPOSITION — the *business* outcome the conversation produced.
 *   - LEAD_STATUS — the CRM lead lifecycle (owned by the lead module). A call
 *                   never invents lead statuses; it only maps an outcome to an
 *                   existing, explicitly-allowed lead status transition.
 */

export const OUTBOUND_CALL_QUEUE = 'outbound-calling';

// Campaign lifecycle (mirrors messaging CAMPAIGN_STATUSES, voice-specific).
export const CAMPAIGN_STATUSES = Object.freeze([
  'draft', 'scheduled', 'queued', 'running', 'paused', 'completed', 'cancelled', 'failed',
]);

// Per-recipient enrollment/queue state. One CampaignRecipient per lead per
// campaign; it owns retry bookkeeping and points at the latest CallRecord.
export const RECIPIENT_STATES = Object.freeze([
  'draft',          // eligibility computed, not yet started
  'queued',         // enqueued for a call attempt
  'dialing',        // a call attempt is being initiated / ringing
  'in_progress',    // connected, conversation underway
  'processing',     // call ended, results being persisted
  'completed',      // reached a terminal business outcome
  'retry_scheduled',// transient failure, another attempt permitted later
  'exhausted',      // max attempts reached without an answer
  'failed',         // permanent failure
  'cancelled',      // campaign cancelled before completion
  'suppressed',     // DNC / consent / suppression
  'ineligible',     // excluded at creation (no phone, etc.)
]);

export const TERMINAL_RECIPIENT_STATES = new Set([
  'completed', 'exhausted', 'failed', 'cancelled', 'suppressed', 'ineligible',
]);

// Technical state of a single call attempt (CallRecord.state).
export const CALL_STATES = Object.freeze([
  'queued', 'initiating', 'ringing', 'in_progress', 'processing_results',
  'completed', 'no_answer', 'busy', 'voicemail', 'failed', 'cancelled', 'needs_reconcile',
]);

// Business outcome of a call attempt (CallRecord.disposition). Intentionally
// distinct from CALL_STATES: a "completed" call can still be "needs_review".
export const DISPOSITIONS = Object.freeze([
  'answered_completed',   // all required questions resolved
  'answered_partial',     // connected, some answers captured, not all required
  'no_answer',
  'busy',
  'voicemail',
  'declined',             // person declined to participate
  'callback_requested',
  'do_not_contact',       // person asked to stop being called
  'failed',               // technical failure, never connected
  'needs_review',         // ambiguous / contradictory — do NOT auto-qualify
]);

// Qualification verdict produced by the status-rule engine.
export const QUALIFICATION_RESULTS = Object.freeze([
  'qualified', 'unqualified', 'callback', 'review', 'do_not_contact', 'none',
]);

// Actions a configured status rule may request. Each maps to a *validated* lead
// status transition (or a side-effect) in aiCalling.service — the rule engine
// never writes to a lead directly.
export const RULE_ACTIONS = Object.freeze([
  'mark_contacted',
  'mark_qualified',
  'mark_unqualified',
  'mark_not_interested',  // → unqualified
  'schedule_callback',    // side-effect only, status stays contacted
  'request_review',       // side-effect only, status stays contacted
  'mark_do_not_contact',  // → unqualified + suppression + consent revoke
  'none',
]);

// Dynamic question field types the engine can validate/normalize.
export const QUESTION_TYPES = Object.freeze([
  'short_text', 'long_text', 'boolean', 'single_choice', 'multiple_choice',
  'integer', 'decimal', 'currency', 'date', 'time', 'email', 'phone', 'url',
  'address', 'rating', 'enum',
]);

// Per-answer validation / confidence state.
export const ANSWER_VALIDATION = Object.freeze(['valid', 'invalid', 'unknown', 'unconfirmed']);
export const ANSWER_REVIEW = Object.freeze(['none', 'pending', 'approved', 'corrected']);

// Speaking styles offered by the agent config.
export const SPEAKING_STYLES = Object.freeze(['professional', 'friendly', 'concise', 'formal', 'custom']);

// How the engine advances through a call (returned by questionEngine.nextAction).
export const ACTION_TYPES = Object.freeze([
  'disclose',       // AI identity disclosure + consent to proceed
  'ask',            // ask the current question
  'clarify',        // re-ask / clarify the current question
  'confirm',        // read back critical answers
  'finish',         // questionnaire complete, wrap up
  'end',            // end the call (declined / DNC / done)
]);

// Telephony outcome classes, mirroring messaging's provider-result shape so the
// worker/queue can reason about retries uniformly.
export const TELEPHONY_OUTCOMES = Object.freeze(['accepted', 'rejected', 'ambiguous']);

export const DEFAULT_SCHEDULE = Object.freeze({
  timezone: 'UTC',
  callWindow: { start: '09:00', end: '18:00' },   // local to campaign timezone
  daysOfWeek: [1, 2, 3, 4, 5],                      // Mon–Fri (0=Sun)
  maxAttemptsPerLead: 2,
  minMinutesBetweenAttempts: 60,
  retryDelayMinutes: 120,
  maxConcurrency: 1,
  maxCallsPerDay: 200,
  maxCampaignSpend: 0,                              // 0 = no cap
});

export const DEFAULT_AGENT_CONFIG = Object.freeze({
  agentName: 'Assistant',
  organizationName: '',
  disclosure: 'Hi, this is an AI assistant calling on behalf of {company}. This call may be recorded. Do you have a moment to answer a few quick questions?',
  language: 'en',
  voice: 'alloy',
  speakingStyle: 'professional',
  objective: '',
  maxCallSeconds: 300,
  silenceTimeoutSeconds: 8,
  maxClarificationsPerQuestion: 2,
  allowBargeIn: true,
  recordCall: false, // off by default — recording needs explicit legal config
});

// Map a status-rule action to an existing CRM lead status (or null for a
// side-effect-only action). Centralised so the mapping is auditable and the
// engine can never request a status that does not exist in the lead lifecycle.
export const ACTION_TO_LEAD_STATUS = Object.freeze({
  mark_contacted: 'contacted',
  mark_qualified: 'qualified',
  mark_unqualified: 'unqualified',
  mark_not_interested: 'unqualified',
  mark_do_not_contact: 'unqualified',
  schedule_callback: null,
  request_review: null,
  none: null,
});

// Lead statuses a call is NEVER allowed to move away from automatically. A human
// conversion / explicit workflow owns these.
export const PROTECTED_LEAD_STATUSES = new Set(['converted']);

export const normalizeTelephonyStatus = (value) => {
  const status = String(value || '').toLowerCase();
  return ({
    created: 'initiating', dialing: 'ringing', ringing: 'ringing',
    active: 'in_progress', answered: 'in_progress', 'in-progress': 'in_progress',
    participant_joined: 'in_progress',
    completed: 'completed', hangup: 'completed', ended: 'completed',
    'no-answer': 'no_answer', no_answer: 'no_answer', noanswer: 'no_answer',
    busy: 'busy', voicemail: 'voicemail', machine: 'voicemail',
    failed: 'failed', error: 'failed', rejected: 'failed', canceled: 'cancelled', cancelled: 'cancelled',
  })[status] || null;
};
