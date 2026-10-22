/**
 * SIM SMS agent — an AI qualification conversation carried over the USER'S OWN
 * phone SIM (Android app, private distribution only). The CRM server is the
 * brain: it decides every outbound text and interprets every reply with the
 * same deterministic engines as AI calling. The phone is only the transport:
 * it leases outbound messages, sends them with SmsManager, and uploads replies
 * from conversation numbers. Nothing here uses LiveKit or a cloud SMS provider.
 */

export const CAMPAIGN_STATUSES = Object.freeze(['draft', 'running', 'paused', 'completed', 'cancelled']);

// Per-lead conversation lifecycle.
export const CONVERSATION_STATES = Object.freeze([
  'ineligible',      // excluded at creation (no/invalid number, suppressed, no consent)
  'queued',          // waiting for its first message to be generated
  'awaiting_send',   // an outbound message is pending/leased on the phone
  'awaiting_reply',  // last outbound was sent; waiting for the lead
  'completed',       // questionnaire finished (or callback / declined)
  'stopped',         // lead opted out (STOP) — suppressed on SMS
  'expired',         // no reply within the reply window (+ reminders)
  'needs_attention', // an outbound send outcome is unknown — a human decides
  'failed',          // a send failed permanently
  'cancelled',       // campaign cancelled
]);
export const ACTIVE_CONVERSATION_STATES = Object.freeze(['queued', 'awaiting_send', 'awaiting_reply']);
export const TERMINAL_CONVERSATION_STATES = new Set(['ineligible', 'completed', 'stopped', 'expired', 'needs_attention', 'failed', 'cancelled']);

// Outbound message lifecycle on the phone.
//  pending    → created, not yet handed to a phone
//  leased     → handed to one device; may be re-leased only if never attempted
//  attempting → the device confirmed it is about to call SmsManager (point of no return)
//  sent | failed | unknown  → device-reported outcome (unknown = attempted, outcome lost)
export const OUTBOUND_STATUSES = Object.freeze(['pending', 'leased', 'attempting', 'sent', 'failed', 'unknown', 'cancelled']);
export const MESSAGE_KINDS = Object.freeze([
  'opening', 'question', 'clarify', 'confirm', 'reminder', 'closing', 'stop_ack', 'inbound',
]);

export const DEFAULT_SETTINGS = Object.freeze({
  timezone: 'Europe/Zurich',
  sendWindow: { start: '09:00', end: '19:00' },
  daysOfWeek: [1, 2, 3, 4, 5],
  maxMessagesPerDay: 100,       // per campaign owner's phone, all campaigns
  minSecondsBetweenSends: 20,   // pacing: carriers flag bursts from personal SIMs
  replyTimeoutHours: 48,
  maxReminders: 1,
});

export const LEASE_MS = 3 * 60_000;          // leased but not attempted → re-leasable after this
export const ATTEMPT_RESULT_GRACE_MS = 15 * 60_000; // attempting without a result → unknown

// Opt-out keywords (whole message, case/diacritic-insensitive), multilingual.
export const STOP_KEYWORDS = Object.freeze([
  'stop', 'stopp', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit', 'optout', 'opt out',
  'arret', 'arrêt', 'arreter', 'arrêter', 'desabonner', 'désabonner',
  'abmelden', 'abbestellen', 'kein interesse',
  'basta', 'alto',
  'توقف', 'الغاء', 'إلغاء',
  'band karo', 'bas', 'band', 'stop karo', 'mat bhejo',
  'band kar do', 'message mat karo', 'sms mat karo', 'unsubscribe karo',
  'سٹاپ', 'اسٹاپ', 'میسج نہ کریں', 'پیغام نہ بھیجیں',
  'بند', 'بند کریں', 'بند کرو', 'رکیں', 'روکیں', 'مت بھیجیں',
]);

export const SIM_SMS_ERROR_CODES = Object.freeze({
  NOT_LEASED_TO_DEVICE: 'NOT_LEASED_TO_DEVICE',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  CAMPAIGN_NOT_RUNNING: 'CAMPAIGN_NOT_RUNNING',
});
