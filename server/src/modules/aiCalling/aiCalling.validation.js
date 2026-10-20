import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';
import {
  CAMPAIGN_STATUSES, QUESTION_TYPES, RULE_ACTIONS, SPEAKING_STYLES, RECIPIENT_STATES,
  QUALIFICATION_RESULTS, ANSWER_VALIDATION,
} from './aiCalling.constants.js';
import { canonicalAgentLanguage, isSupportedAgentLanguage } from './aiCalling.languages.js';
import { isValidTimezone } from './engine/callWindow.js';

const ianaTimezone = Joi.string().max(80).custom((value, helpers) => (
  isValidTimezone(value) ? value : helpers.message('"timezone" must be a valid IANA timezone (e.g. Europe/Zurich)')
));

const page = Joi.number().integer().min(1).default(1);
const limit = Joi.number().integer().min(1).max(100).default(25);

const clause = Joi.object({
  field: Joi.string().max(80).required(),
  equals: Joi.any(), notEquals: Joi.any(), in: Joi.array().items(Joi.any()).max(50),
  contains: Joi.any(), exists: Joi.boolean(),
  gt: Joi.number(), gte: Joi.number(), lt: Joi.number(), lte: Joi.number(),
}).min(2);

const condition = Joi.object({
  all: Joi.array().items(clause).max(20),
  any: Joi.array().items(clause).max(20),
}).min(1).allow(null);

const question = Joi.object({
  fieldKey: Joi.string().trim().pattern(/^[a-zA-Z0-9_.]+$/).max(80).required(),
  label: Joi.string().trim().max(200).required(),
  text: Joi.string().trim().max(1000).required(),
  description: Joi.string().trim().max(1000).allow('').default(''),
  type: Joi.string().valid(...QUESTION_TYPES).required(),
  required: Joi.boolean().default(false),
  order: Joi.number().integer().min(0).default(0),
  options: Joi.array().items(Joi.alternatives(
    Joi.string().max(200),
    Joi.object({ value: Joi.string().max(200).required(), label: Joi.string().max(200) }),
  )).max(50).default([]),
  min: Joi.number().allow(null), max: Joi.number().allow(null), maxLength: Joi.number().integer().allow(null),
  maxClarifications: Joi.number().integer().min(0).max(5).default(2),
  confirmCritical: Joi.boolean().default(false),
  condition,
  mapTo: Joi.string().trim().max(120).allow(null, ''),
  sensitive: Joi.boolean().default(false),
});

const statusRule = Joi.object({
  id: Joi.string().trim().max(80).required(),
  description: Joi.string().trim().max(300).allow('').default(''),
  when: condition.required(),
  action: Joi.string().valid(...RULE_ACTIONS).required(),
  requiresReview: Joi.boolean().default(false),
});

// Must be a language from AI_AGENT_LANGUAGES (or 'auto'). Unlisted regional
// variants of a listed language (legacy 'de-AT') stay valid; see resolveAgentLanguage.
const agentLanguage = Joi.string().trim().max(10).custom((value, helpers) => (
  isSupportedAgentLanguage(value) ? canonicalAgentLanguage(value) : helpers.error('any.invalid')
), 'AI agent language').messages({ 'any.invalid': '{{#label}} must be a supported AI agent language code (see GET /ai-calling/languages)' });

const agentConfig = Joi.object({
  agentName: Joi.string().trim().max(120).default('Assistant'),
  organizationName: Joi.string().trim().max(200).allow('').default(''),
  disclosure: Joi.string().trim().max(2000).allow('').default(''),
  language: agentLanguage.default('en'),
  voice: Joi.string().trim().max(40).default('alloy'),
  speakingStyle: Joi.string().valid(...SPEAKING_STYLES).default('professional'),
  customStyle: Joi.string().trim().max(500).allow('').default(''),
  objective: Joi.string().trim().max(1000).allow('').default(''),
  maxCallSeconds: Joi.number().integer().min(30).max(1800).default(300),
  silenceTimeoutSeconds: Joi.number().integer().min(2).max(60).default(8),
  maxClarificationsPerQuestion: Joi.number().integer().min(0).max(5).default(2),
  allowBargeIn: Joi.boolean().default(true),
  recordCall: Joi.boolean().default(false),
  shareLeadNotes: Joi.boolean().default(false),
});

const schedule = Joi.object({
  timezone: ianaTimezone.default('UTC'),
  callWindow: Joi.object({
    start: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).default('09:00'),
    end: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).default('18:00'),
  }).default({ start: '09:00', end: '18:00' }),
  daysOfWeek: Joi.array().items(Joi.number().integer().min(0).max(6)).max(7).default([1, 2, 3, 4, 5]),
  maxAttemptsPerLead: Joi.number().integer().min(1).max(10).default(2),
  minMinutesBetweenAttempts: Joi.number().integer().min(0).default(60),
  retryDelayMinutes: Joi.number().integer().min(1).default(120),
  maxConcurrency: Joi.number().integer().min(1).max(25).default(1),
  maxCallsPerDay: Joi.number().integer().min(1).default(200),
  maxCampaignSpend: Joi.number().min(0).default(0),
});

const explicitSelection = Joi.object({
  mode: Joi.string().valid('explicit').required(),
  leadIds: Joi.array().items(objectId).min(1).max(5000).required(),
});
const filterSelection = Joi.object({
  mode: Joi.string().valid('filters').required(),
  filters: Joi.object({
    status: Joi.string().max(40), assignedTo: objectId, source: Joi.string().max(50), type: Joi.string().max(50),
    country: Joi.string().length(2), city: Joi.string().max(120), area: Joi.string().max(120),
    countryId: Joi.string().max(80), cityId: Joi.string().max(80), areaId: Joi.string().max(80),
    businessType: Joi.string().max(120), q: Joi.string().max(100).allow(''),
  }).required(),
});

export const createCampaign = { body: Joi.object({
  name: Joi.string().trim().max(160).required(),
  description: Joi.string().trim().max(1000).allow('').default(''),
  questionnaire: Joi.object({ questions: Joi.array().items(question).min(1).max(40).required() }).required(),
  statusRules: Joi.array().items(statusRule).max(40).default([]),
  agentConfig: agentConfig.default({}),
  schedule: schedule.default({}),
  selection: Joi.alternatives().try(explicitSelection, filterSelection).required(),
  scheduledAt: Joi.date().iso().greater('now').allow(null),
  timezone: ianaTimezone,
  isTest: Joi.boolean().default(false),
}) };

export const updateCampaign = { params: Joi.object({ id: objectId.required() }), body: Joi.object({
  name: Joi.string().trim().max(160),
  description: Joi.string().trim().max(1000).allow(''),
  questionnaire: Joi.object({ questions: Joi.array().items(question).min(1).max(40).required() }),
  statusRules: Joi.array().items(statusRule).max(40),
  agentConfig, schedule,
  scheduledAt: Joi.date().iso().allow(null),
}).min(1) };

export const campaignId = { params: Joi.object({ id: objectId.required() }) };
export const startCampaign = { params: Joi.object({ id: objectId.required() }), body: Joi.object({ scheduledAt: Joi.date().iso().greater('now').allow(null) }).default({}) };
export const listCampaigns = { query: Joi.object({ page, limit, status: Joi.string().valid(...CAMPAIGN_STATUSES) }) };
export const listRecipients = { params: Joi.object({ id: objectId.required() }), query: Joi.object({ page, limit: Joi.number().integer().min(1).max(200).default(50), state: Joi.string().valid(...RECIPIENT_STATES) }) };
export const simulate = { params: Joi.object({ id: objectId.required() }), body: Joi.object({
  state: Joi.object().allow(null).default(null),
  userText: Joi.string().max(2000).allow('', null).default(null),
  disclose: Joi.boolean().default(false),
}) };
export const webTest = { params: Joi.object({ id: objectId.required() }), body: Joi.object({ leadId: objectId.allow(null) }).default({}) };
export const leadHistory = { params: Joi.object({ leadId: objectId.required() }), query: Joi.object({ page, limit }) };
export const callId = { params: Joi.object({ id: objectId.required() }) };
export const reviewAnswers = { params: Joi.object({ id: objectId.required() }), body: Joi.object({
  answers: Joi.array().items(Joi.object({
    questionFieldKey: Joi.string().max(80).required(),
    normalizedValue: Joi.any(),
    validation: Joi.string().valid(...ANSWER_VALIDATION),
  })).default([]),
  qualification: Joi.string().valid(...QUALIFICATION_RESULTS).allow(null),
}) };
export const retryRecipients = { params: Joi.object({ id: objectId.required() }), body: Joi.object({
  recipientIds: Joi.array().items(objectId).max(5000).default([]),
}).default({}) };
export const analytics = { query: Joi.object({ from: Joi.date().iso(), to: Joi.date().iso().min(Joi.ref('from')), campaignId: objectId }) };
export const suppress = { body: Joi.object({
  // Either a number, or a lead whose stored number is suppressed (resolved server-side).
  phone: Joi.string().max(50),
  leadId: objectId.allow(null),
  reason: Joi.string().valid('do_not_contact', 'invalid', 'complaint', 'admin').default('admin'),
  note: Joi.string().max(500).allow('', null),
}).or('phone', 'leadId') };
export const callConsentRead = { params: Joi.object({ leadId: objectId.required() }) };
export const callConsentUpdate = {
  params: Joi.object({ leadId: objectId.required() }),
  body: Joi.object({
    status: Joi.string().valid('granted', 'denied', 'revoked').required(),
    evidence: Joi.when('status', {
      is: 'granted', then: Joi.string().trim().min(10).max(2000).required(),
      otherwise: Joi.string().trim().max(2000).allow('').default(''),
    }),
    source: Joi.string().trim().max(100).default('manual'),
    capturedAt: Joi.date().iso(),
    expiresAt: Joi.date().iso().greater('now').allow(null),
    confirmation: Joi.when('status', { is: 'granted', then: Joi.boolean().valid(true).required(), otherwise: Joi.boolean() }),
  }),
};

// Agent tool API (worker-authenticated, not user-authenticated).
export const agentContext = { params: Joi.object({ callId: Joi.string().max(120).required() }) };
export const agentRecordAnswer = { params: Joi.object({ callId: Joi.string().max(120).required() }), body: Joi.object({
  fieldKey: Joi.string().max(80).required(),
  rawAnswer: Joi.string().max(4000).allow('').required(),
}) };
export const agentFieldOnly = { params: Joi.object({ callId: Joi.string().max(120).required() }), body: Joi.object({
  fieldKey: Joi.string().max(80).required(),
}) };
export const agentCallback = { params: Joi.object({ callId: Joi.string().max(120).required() }), body: Joi.object({
  when: Joi.string().max(200).allow('', null), note: Joi.string().max(1000).allow('', null),
}).default({}) };
export const agentEnd = { params: Joi.object({ callId: Joi.string().max(120).required() }), body: Joi.object({
  // Telephony-level outcomes only; business outcomes are derived server-side.
  disposition: Joi.string().valid('voicemail', 'no_answer', 'busy', 'failed').allow(null),
  durationSeconds: Joi.number().min(0).allow(null),
  transcriptRef: Joi.string().max(500).allow(null, ''),
  cost: Joi.object({ amount: Joi.number().min(0), currency: Joi.string().max(3), breakdown: Joi.any() }).allow(null),
}).default({}) };

// Shared with the SIM SMS agent (same questionnaire / rule shapes).
export { question as questionSchema, statusRule as statusRuleSchema };
