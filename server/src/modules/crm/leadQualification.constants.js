/**
 * Lead qualification schema shared by the mobile app (call/SMS wrap-up), the
 * web lead drawer and the AI note-extraction proposer. Shape is compatible with
 * the aiCalling questionnaire question ({ fieldKey, label, type, options }) so
 * answers are validated by the same deterministic engine
 * (aiCalling/engine/answerValidation.js). Labels are English; clients translate
 * by fieldKey. Note: "unknown" is an answer STATUS, never a value.
 */
export const LEAD_QUALIFICATION_FIELDS = Object.freeze([
  { fieldKey: 'need', label: 'Need / pain point', type: 'long_text', helpText: 'What problem the lead wants solved.' },
  { fieldKey: 'current_solution', label: 'Current solution', type: 'short_text', helpText: 'What they use today.' },
  { fieldKey: 'role', label: 'Contact role', type: 'short_text', helpText: 'Role or title of the person spoken to.' },
  {
    fieldKey: 'decision_authority',
    label: 'Decision authority',
    type: 'single_choice',
    options: ['decision_maker', 'influencer', 'no_authority'],
    helpText: 'Can this person decide on the purchase?',
  },
  { fieldKey: 'budget', label: 'Budget', type: 'currency', helpText: 'Stated budget amount.' },
  {
    fieldKey: 'timeline',
    label: 'Timeline',
    type: 'single_choice',
    options: ['immediate', 'within_3_months', 'within_6_months', 'later'],
    helpText: 'When they intend to act.',
  },
  {
    fieldKey: 'interest',
    label: 'Interest level',
    type: 'single_choice',
    options: ['high', 'medium', 'low', 'none'],
    helpText: 'How interested the lead sounded.',
  },
  { fieldKey: 'objections', label: 'Objections', type: 'long_text', helpText: 'Concerns or objections raised.' },
  {
    fieldKey: 'preferred_channel',
    label: 'Preferred channel',
    type: 'single_choice',
    options: ['phone', 'sms', 'email', 'whatsapp'],
    helpText: 'How the lead prefers to be contacted.',
  },
  { fieldKey: 'callback_time', label: 'Callback time', type: 'short_text', helpText: 'When to call back, as stated.' },
  { fieldKey: 'requested_info', label: 'Requested information', type: 'long_text', helpText: 'Material or details the lead asked for.' },
  { fieldKey: 'next_action', label: 'Next action', type: 'short_text', helpText: 'Agreed next step.' },
].map((field) => Object.freeze(field)));

export const QUALIFICATION_FIELD_KEYS = Object.freeze(LEAD_QUALIFICATION_FIELDS.map((f) => f.fieldKey));

export const QUALIFICATION_FIELD_BY_KEY = new Map(LEAD_QUALIFICATION_FIELDS.map((f) => [f.fieldKey, f]));

export const QUALIFICATION_PROMPT_VERSION = 'lead-qualification-propose/2026-10-16.1';

export const PROPOSE_LANGUAGES = Object.freeze(['en', 'de', 'fr', 'ar', 'ur']);

export const PROPOSE_TIMEOUT_MS = 20_000;

/**
 * Who/what produced a qualification value (Lead.qualification fields + history).
 * Superset of the sources a mobile device may claim (leadCommunication ANSWER_SOURCES):
 * 'ai_call_agent' is written only by the AI-calling result path, 'user_correction'
 * only by the correction endpoint.
 */
export const QUALIFICATION_ANSWER_SOURCES = Object.freeze([
  'user', 'ai_proposed_user_confirmed', 'sms_agent', 'ai_call_agent', 'user_correction',
]);

/** Bound on a stored evidence quote that points into a call transcript. */
export const TRANSCRIPT_QUOTE_MAX = 1000;
