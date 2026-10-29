/**
 * Cross-channel contact policy — one frequency/quiet-hours/DNC gate shared by
 * AI calls, SIM calls, SIM SMS and provider messaging.
 *
 * Channels are the medium a lead experiences ("voice" covers AI calls and SIM
 * calls; "sms" covers SIM SMS and provider SMS). Sources are the dispatching
 * subsystems, used for idempotency ({source, refId}) and campaign skip counts.
 */
export const CONTACT_CHANNELS = Object.freeze(['voice', 'sms', 'email', 'whatsapp']);
export const CONTACT_SOURCES = Object.freeze(['ai_calling', 'sim_call', 'sim_sms', 'messaging', 'manual']);
export const TOUCH_STATUSES = Object.freeze(['reserved', 'committed', 'released']);

/** Rolling windows; the ledger keeps events for the longest one (or the min gap if longer). */
export const DAY_MS = 24 * 3_600_000;
export const WEEK_MS = 7 * DAY_MS;

// Hard blockers: never overridable, not even by a manual one-off contact.
export const HARD_BLOCK_REASONS = Object.freeze([
  'lead_unavailable', 'do_not_contact', 'call_suppressed', 'channel_suppressed', 'consent_revoked',
]);
// Soft (frequency / timing) reasons: a manual contact is recorded with a warning.
export const LIMIT_REASONS = Object.freeze([
  'quiet_hours', 'min_gap', 'daily_limit', 'weekly_limit', 'channel_daily_limit', 'channel_weekly_limit',
  'contact_policy_unavailable',
]);

/**
 * Defaults applied when the settings document exists but a field is missing.
 * With NO settings document at all the policy is `enabled: false` (legacy
 * behaviour; migration 036 inserts these values disabled). Hard blockers apply
 * regardless of `enabled`.
 */
export const DEFAULT_POLICY = Object.freeze({
  enabled: true,
  maxTouchesPerDay: 3,
  maxTouchesPerWeek: 10,
  minGapMinutes: 60,
  channels: {
    voice: { perDay: 2, perWeek: 6 },
    sms: { perDay: 3, perWeek: 8 },
    email: { perDay: 2, perWeek: 7 },
    whatsapp: { perDay: 2, perWeek: 7 },
  },
  quietHours: { enabled: true, start: '20:00', end: '08:00' },
});

/** leadCommunication channel → contact channel. */
export const COMMUNICATION_CHANNEL = Object.freeze({ phone: 'voice', sms: 'sms' });
