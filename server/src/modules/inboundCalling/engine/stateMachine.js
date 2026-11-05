/**
 * Incoming call lifecycle: ONE state machine for every inbound session.
 *
 * The call status (this machine) is kept apart from the AI session status, the audio link
 * status, the lead status and the qualification result. Every write goes through
 * `planTransition`, which rejects anything the table below does not allow, so a late or
 * replayed event can never move a finished call backwards.
 *
 *   DETECTED → RECEIVED → IDENTIFYING → QUEUED → RINGING ─┬→ ANSWERING → ANSWERED → CONNECTING_AUDIO → AI_ACTIVE ─┐
 *                                                         ├→ HUMAN_ACTIVE (answered on the handset)               │
 *                                                         └→ MISSED / REJECTED / CANCELLED / FAILED               │
 *   AI_ACTIVE → TRANSFERRING → HUMAN_ACTIVE                                                                      │
 *   *_ACTIVE → WRAPPING_UP → COMPLETED                                                     ◀─────────────────────┘
 *   any live state → INTERRUPTED (link lost, outcome unknown) / FAILED
 */

export const CALL_STATUSES = Object.freeze([
  'DETECTED', 'RECEIVED', 'IDENTIFYING', 'QUEUED', 'RINGING', 'ANSWERING', 'ANSWERED', 'CONNECTING_AUDIO',
  'AI_ACTIVE', 'HUMAN_ACTIVE', 'TRANSFERRING', 'WRAPPING_UP',
  'COMPLETED', 'MISSED', 'REJECTED', 'FAILED', 'INTERRUPTED', 'CANCELLED',
]);

export const TERMINAL_STATUSES = new Set(['COMPLETED', 'MISSED', 'REJECTED', 'FAILED', 'INTERRUPTED', 'CANCELLED']);
export const RINGING_STATUSES = new Set(['DETECTED', 'RECEIVED', 'IDENTIFYING', 'QUEUED', 'RINGING', 'ANSWERING']);
export const LIVE_STATUSES = new Set(['ANSWERED', 'CONNECTING_AUDIO', 'AI_ACTIVE', 'HUMAN_ACTIVE', 'TRANSFERRING']);
export const ACTIVE_STATUSES = new Set([...RINGING_STATUSES, ...LIVE_STATUSES, 'WRAPPING_UP']);

export const AI_STATUSES = Object.freeze([
  'not_applicable', 'waiting', 'connecting', 'connected', 'speaking', 'listening', 'handed_off', 'unavailable', 'ended', 'failed',
]);
export const AUDIO_STATUSES = Object.freeze(['none', 'connecting', 'connected', 'reconnecting', 'lost', 'closed']);
export const HANDLING_MODES = Object.freeze(['ai', 'human', 'ignore']);
export const OUTCOMES = Object.freeze([
  'handled_by_ai', 'handled_by_human', 'transferred', 'missed', 'rejected', 'interrupted', 'failed', 'unanswered', 'cancelled',
]);

const ENDINGS = ['MISSED', 'REJECTED', 'FAILED', 'INTERRUPTED', 'CANCELLED'];
const LIVE_ENDINGS = ['WRAPPING_UP', 'COMPLETED', 'FAILED', 'INTERRUPTED'];

const ALLOWED = Object.freeze({
  DETECTED: ['RECEIVED', 'IDENTIFYING', 'RINGING', 'HUMAN_ACTIVE', ...ENDINGS],
  RECEIVED: ['IDENTIFYING', 'QUEUED', 'RINGING', 'HUMAN_ACTIVE', ...ENDINGS],
  IDENTIFYING: ['QUEUED', 'RINGING', 'HUMAN_ACTIVE', ...ENDINGS],
  // ANSWERED directly: the gateway's `answering` report may be lost; the answer itself must count.
  QUEUED: ['RINGING', 'ANSWERING', 'ANSWERED', 'HUMAN_ACTIVE', ...ENDINGS],
  RINGING: ['ANSWERING', 'ANSWERED', 'HUMAN_ACTIVE', ...ENDINGS],
  // RINGING again: the answer was refused or never confirmed; the call is left for a person.
  ANSWERING: ['ANSWERED', 'CONNECTING_AUDIO', 'HUMAN_ACTIVE', 'RINGING', ...ENDINGS],
  ANSWERED: ['CONNECTING_AUDIO', 'AI_ACTIVE', 'HUMAN_ACTIVE', 'TRANSFERRING', ...LIVE_ENDINGS],
  CONNECTING_AUDIO: ['AI_ACTIVE', 'HUMAN_ACTIVE', 'TRANSFERRING', ...LIVE_ENDINGS],
  AI_ACTIVE: ['TRANSFERRING', 'HUMAN_ACTIVE', 'CONNECTING_AUDIO', ...LIVE_ENDINGS],
  TRANSFERRING: ['HUMAN_ACTIVE', 'AI_ACTIVE', ...LIVE_ENDINGS],
  HUMAN_ACTIVE: LIVE_ENDINGS,
  WRAPPING_UP: ['COMPLETED', 'FAILED', 'INTERRUPTED'],
  COMPLETED: [],
  MISSED: [],
  REJECTED: [],
  FAILED: [],
  INTERRUPTED: [],
  CANCELLED: [],
});

export function canTransition(from, to) {
  if (from === to) return false;
  return Boolean(ALLOWED[from]?.includes(to));
}

/** Forward-only progress order: a stale "ringing" never overrides "answered". */
const ORDER = Object.fromEntries(CALL_STATUSES.map((s, i) => [s, i]));
export const statusRank = (s) => (TERMINAL_STATUSES.has(s) ? 100 : ORDER[s] ?? -1);

/**
 * Plan a transition. Returns null when it is not allowed (the caller ignores the event),
 * otherwise the Mongo $set/$push to apply with a guard on the current status.
 */
export function planTransition(current, to, { at = new Date(), reason = null, source = 'system' } = {}) {
  if (!canTransition(current, to)) return null;
  return {
    filter: { status: current },
    set: { status: to, statusChangedAt: at },
    push: { transitions: { $each: [{ from: current, to, at, reason: reason ? String(reason).slice(0, 200) : null, source }], $slice: -80 } },
  };
}

/** Business outcome of a finished call, derived only from what was recorded. */
export function deriveOutcome({ status, answeredBy = null, handedOff = false, aiConnected = false }) {
  switch (status) {
    case 'COMPLETED':
      if (handedOff) return 'transferred';
      if (answeredBy === 'ai') return 'handled_by_ai';
      if (answeredBy === 'human') return 'handled_by_human';
      return 'unanswered';
    case 'MISSED': return 'missed';
    case 'REJECTED': return 'rejected';
    case 'CANCELLED': return 'cancelled';
    case 'INTERRUPTED': return 'interrupted';
    case 'FAILED': return aiConnected ? 'interrupted' : 'failed';
    default: return null;
  }
}

/** The status a call ends in when the phone line goes idle. */
export function endStatusFor(current, { answered, reason = '' }) {
  if (TERMINAL_STATUSES.has(current)) return current;
  if (!answered) return reason === 'rejected' ? 'REJECTED' : 'MISSED';
  if (['audio_lost', 'audio_failed', 'link_lost'].includes(reason)) return 'INTERRUPTED';
  return 'WRAPPING_UP';
}
