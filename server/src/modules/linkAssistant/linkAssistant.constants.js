/**
 * SMS link assistant: a CRM user texts a lead a personal link (from their own SIM
 * via the mobile SMS queue); the link opens a chat page where an AI assistant
 * collects the campaign's answers. It is the `web_link` channel of the existing
 * aiCalling campaigns: same questionnaire, validation, status rules, review queue.
 */

export const LINK_CHANNEL = 'web_link';
export const LINK_PROVIDER = 'web_link'; // CallRecord.provider for link sessions

export const SESSION_STATUSES = Object.freeze([
  'issued',      // link created, not opened yet
  'opened',      // page opened (JS ran), greeting shown
  'active',      // the lead started the conversation
  'completed',   // submitted; read-only
  'abandoned',   // no activity for the inactivity window; partial answers processed
  'opted_out',   // do-not-contact requested
  'expired',     // link expired before completion
  'revoked',     // revoked from the CRM
]);
export const OPEN_SESSION_STATUSES = new Set(['issued', 'opened', 'active']);
export const CLOSED_SESSION_STATUSES = new Set(['completed', 'abandoned', 'opted_out', 'expired', 'revoked']);

// Per-lead funnel, in order. Each is stamped once (first occurrence).
export const FUNNEL_STEPS = Object.freeze([
  'link_issued', 'sms_sent', 'delivered', 'link_opened', 'chat_started', 'voice_started',
  'completed', 'abandoned', 'opted_out', 'expired',
]);

export const LANGUAGES = Object.freeze(['en', 'ur', 'roman_ur']);
export const SMS_TEMPLATE_LANGUAGES = Object.freeze(['en', 'ur', 'roman_ur', 'fr', 'de', 'ar']);
export const VOICE_TIERS = Object.freeze(['off', 'browser', 'premium']);
export const PERSONA_TONES = Object.freeze(['warm', 'professional', 'concise']);

export const DEFAULT_LINK_CONFIG = Object.freeze({
  expiryDays: 7,
  languages: ['en', 'ur', 'roman_ur'],
  defaultLanguage: 'en',
  personaName: 'Ayesha',
  personaTone: 'warm',
  faq: [],
  estimatedMinutes: 3,
  voiceTier: 'premium',
  reminders: { enabled: false, afterHours: 24, max: 1 },
  fallbackToCall: { enabled: false, simCallCampaignId: null, afterHours: 24 },
  limits: { maxTurns: 40, maxTokensPerTurn: 220, maxSessionMinutes: 30, dailySpendCap: 2, maxVoiceMinutes: 10 },
  transcriptRetentionDays: 90,
  whatsappShare: false,
});

export const TOKEN_BYTES = 16;            // 128 bits of entropy
export const MAX_TOKENS_PER_SESSION = 10; // one per send (first SMS + reminders)
export const MAX_VERIFY_ATTEMPTS = 5;
export const INACTIVITY_ABANDON_HOURS = 24;
export const MAX_MESSAGE_CHARS = 1000;
export const MAX_TRANSCRIPT_TURNS = 200;
export const HISTORY_TURNS_FOR_MODEL = 6;
export const DEVICE_COOKIE = 'ula_dev';
// Real-time voice: the customer's LiveKit identity, and how many calls may run at once
// across all campaigns (override with LINK_VOICE_MAX_CONCURRENT).
export const VOICE_CUSTOMER_IDENTITY_PREFIX = 'lead-';
export const VOICE_MAX_CONCURRENT = 10;
// Estimated cost per minute when the worker reports no token usage (gpt-realtime, both directions).
export const VOICE_FALLBACK_COST_PER_MINUTE = 0.12;

export const LINK_REASONS = Object.freeze({
  KILL_SWITCH: 'LINK_ASSISTANT_PAUSED',
  CAMPAIGN_NOT_LINK: 'CAMPAIGN_NOT_WEB_LINK',
  CAMPAIGN_INACTIVE: 'CAMPAIGN_NOT_RUNNING',
  OUTSIDE_HOURS: 'OUTSIDE_CALLING_HOURS',
  LEAD_SUPPRESSED: 'LEAD_SUPPRESSED',
  SESSION_CLOSED: 'SESSION_CLOSED',
  SPEND_CAP: 'DAILY_SPEND_CAP_REACHED',
  VOICE_UNAVAILABLE: 'VOICE_UNAVAILABLE',
});
