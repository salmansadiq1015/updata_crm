import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';
import { CAMPAIGN_STATUSES, CHANNELS, CONSENT_STATUSES, MESSAGE_PURPOSES, MESSAGE_STATUSES, PROVIDERS } from './messaging.constants.js';

const page = Joi.number().integer().min(1).default(1);
const limit = Joi.number().integer().min(1).max(100).default(25);
const timezone = Joi.string().max(80).custom((value, helpers) => {
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(); return value; }
  catch { return helpers.error('any.invalid'); }
}, 'IANA timezone validation').messages({ 'any.invalid': '{{#label}} must be a valid IANA timezone' });
const variableMap = Joi.object().pattern(Joi.string().max(80), Joi.string().max(500));
const frequencyRule = Joi.object({
  minIntervalHours: Joi.number().integer().min(0).max(720),
  dailyMax: Joi.number().integer().min(0).max(100),
  weeklyMax: Joi.number().integer().min(0).max(1000),
});
const whatsappComponent = Joi.object({
  type: Joi.string().valid('header', 'body', 'button').required(),
  sub_type: Joi.string().max(40),
  index: Joi.alternatives().try(Joi.string(), Joi.number().integer().min(0)),
  parameters: Joi.array().items(Joi.object({
    type: Joi.string().valid('text', 'image', 'document', 'video', 'currency', 'date_time').required(),
    text: Joi.string().max(2000),
    image: Joi.object({ link: Joi.string().uri({ scheme: ['https'] }).required() }),
    document: Joi.object({ link: Joi.string().uri({ scheme: ['https'] }).required(), filename: Joi.string().max(255) }),
    video: Joi.object({ link: Joi.string().uri({ scheme: ['https'] }).required() }),
  }).unknown(false)).max(20).default([]),
}).unknown(false);

const content = Joi.object({
  subject: Joi.string().max(500).allow('').default(''),
  bodyHtml: Joi.string().max(200000).allow('').default(''),
  bodyText: Joi.string().max(10000).allow('').default(''),
  fallbackValues: variableMap.default({}),
  whatsappTemplateName: Joi.string().trim().max(512).allow(null, ''),
  whatsappLanguage: Joi.string().trim().max(20).allow(null, ''),
  whatsappComponents: Joi.array().items(whatsappComponent).max(10).default([]),
  whatsappTwilioContentSid: Joi.string().trim().pattern(/^HX[a-fA-F0-9]{32}$/).allow(null, ''),
}).required();

const filterSelection = Joi.object({
  mode: Joi.string().valid('filters').required(),
  filters: Joi.object({
    status: Joi.string().max(40), assignedTo: objectId, source: Joi.string().max(50), type: Joi.string().max(50),
    country: Joi.string().length(2), city: Joi.string().max(120), area: Joi.string().max(120),
    countryId: Joi.string().max(80), cityId: Joi.string().max(80), areaId: Joi.string().max(80),
    businessType: Joi.string().max(120), q: Joi.string().max(100).allow(''),
    minRating: Joi.number().min(0).max(5), maxRating: Joi.number().min(0).max(5),
    tags: Joi.array().items(Joi.string().trim().max(80)).max(20),
    hasEmail: Joi.boolean(), hasPhone: Joi.boolean(),
  }).required(),
});

const explicitSelection = Joi.object({
  mode: Joi.string().valid('explicit').required(),
  leadIds: Joi.array().items(objectId).min(1).max(5000).required(),
});

export const createCampaign = { body: Joi.object({
  name: Joi.string().trim().max(160).required(), description: Joi.string().trim().max(1000).allow('').default(''),
  channel: Joi.string().valid(...CHANNELS).required(), purpose: Joi.string().valid(...MESSAGE_PURPOSES).default('promotional'),
  templateId: objectId.allow(null), content,
  selection: Joi.alternatives().try(explicitSelection, filterSelection).required(),
  routing: Joi.object({ smsProvider: Joi.string().valid('auto', 'textbee', 'twilio').default('auto'), allowFallback: Joi.boolean().default(false) }).default({}),
  scheduledAt: Joi.date().iso().greater('now').allow(null), timezone: timezone.default('UTC'),
}) };

export const campaignId = { params: Joi.object({ id: objectId.required() }) };
export const startCampaign = { params: Joi.object({ id: objectId.required() }), body: Joi.object({ scheduledAt: Joi.date().iso().greater('now').allow(null) }).default({}) };
export const retryRecipients = { params: Joi.object({ id: objectId.required() }), body: Joi.object({ recipientIds: Joi.array().items(objectId).min(1).max(100).required() }) };
export const retryEligibility = {
  params: Joi.object({ id: objectId.required() }),
  query: Joi.object({ status: Joi.string().valid('failed', 'undelivered') }),
};
export const retryEligibleRecipients = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    expectedCount: Joi.number().integer().min(1).max(5000).required(),
    confirmation: Joi.boolean().valid(true).required(),
    status: Joi.string().valid('failed', 'undelivered'),
  }),
};
export const reconcileRecipient = { params: Joi.object({ id: objectId.required(), recipientId: objectId.required() }), body: Joi.object({
  decision: Joi.string().valid('confirm_not_accepted', 'confirm_accepted').required(),
  providerMessageId: Joi.when('decision', { is: 'confirm_accepted', then: Joi.string().trim().max(255).required(), otherwise: Joi.forbidden() }),
  note: Joi.string().trim().max(1000).required(),
}) };
export const listCampaigns = { query: Joi.object({
  page, limit, status: Joi.string().valid(...CAMPAIGN_STATUSES), channel: Joi.string().valid(...CHANNELS),
  q: Joi.string().trim().max(160).allow(''),
}) };
export const listRecipients = { params: Joi.object({ id: objectId.required() }), query: Joi.object({ page, limit: Joi.number().integer().min(1).max(200).default(50), status: Joi.string().valid(...MESSAGE_STATUSES) }) };
export const recipientId = { params: Joi.object({ id: objectId.required(), recipientId: objectId.required() }) };
export const verifyCampaignConsent = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    recipientIds: Joi.array().items(objectId).min(1).max(5000).unique().required(),
    evidence: Joi.string().trim().min(10).max(2000).required(),
    source: Joi.string().trim().max(100).default('manual_admin_verification'),
    capturedAt: Joi.date().iso().required(),
    expiresAt: Joi.date().iso().greater('now').allow(null),
    confirmation: Joi.boolean().valid(true).required(),
  }),
};
export const leadHistory = { params: Joi.object({ leadId: objectId.required() }), query: Joi.object({
  page, limit, channel: Joi.string().valid(...CHANNELS), provider: Joi.string().valid(...PROVIDERS),
  status: Joi.string().valid(...MESSAGE_STATUSES, 'received'), campaignId: objectId,
  from: Joi.date().iso(), to: Joi.date().iso().min(Joi.ref('from')),
}) };
export const leadConsent = { params: Joi.object({ leadId: objectId.required() }) };
export const analytics = { query: Joi.object({ from: Joi.date().iso(), to: Joi.date().iso().min(Joi.ref('from')) }) };
export const listTemplates = { query: Joi.object({ channel: Joi.string().valid(...CHANNELS), includeArchived: Joi.boolean().default(false) }) };

const templateBody = Joi.object({
  name: Joi.string().trim().max(160).required(), channel: Joi.string().valid(...CHANNELS).required(),
  purpose: Joi.string().valid(...MESSAGE_PURPOSES).default('promotional'), category: Joi.string().max(80).default('custom'),
  description: Joi.string().max(500).allow('').default(''), subject: Joi.string().max(500).allow('').default(''),
  bodyHtml: Joi.string().max(200000).allow('').default(''), bodyText: Joi.string().max(10000).allow('').default(''),
  fallbackValues: variableMap.default({}), isShared: Joi.boolean().default(false),
  whatsapp: Joi.object({
    metaName: Joi.string().trim().max(512).allow(null, ''), language: Joi.string().max(20).allow(null, ''),
    approvalStatus: Joi.string().valid('approved', 'pending', 'rejected', 'paused', 'disabled').allow(null),
    templateCategory: Joi.string().max(50).allow(null, ''), parameterOrder: Joi.array().items(Joi.string().max(80)).max(20),
    components: Joi.array().items(whatsappComponent).max(10),
    twilioContentSid: Joi.string().trim().pattern(/^HX[a-fA-F0-9]{32}$/).allow(null, ''),
  }).default({}),
});
export const createTemplate = { body: templateBody };
export const templateId = { params: Joi.object({ id: objectId.required() }) };
export const updateTemplate = {
  params: Joi.object({ id: objectId.required() }),
  body: templateBody.fork(['name', 'channel'], (schema) => schema.optional()).min(1).prefs({ noDefaults: true }),
};
export const consent = { params: Joi.object({ leadId: objectId.required() }), body: Joi.object({
  channel: Joi.string().valid(...CHANNELS).required(), status: Joi.string().valid(...CONSENT_STATUSES).required(),
  evidence: Joi.when('status', {
    is: 'granted', then: Joi.string().trim().min(5).max(2000).required(),
    otherwise: Joi.string().trim().max(2000).allow('').default(''),
  }), source: Joi.string().trim().max(100).default('manual'),
  capturedAt: Joi.date().iso(), expiresAt: Joi.date().iso().greater('now').allow(null),
}) };
export const reinstateConsent = { params: Joi.object({ leadId: objectId.required() }), body: Joi.object({
  channel: Joi.string().valid(...CHANNELS).required(),
  evidence: Joi.string().trim().min(10).max(2000).required(),
  source: Joi.string().trim().max(100).default('verified_reopt_in'),
  capturedAt: Joi.date().iso().required(), expiresAt: Joi.date().iso().greater('now').allow(null),
  confirmation: Joi.boolean().valid(true).required(),
}) };
export const providerSettings = { body: Joi.object({
  providers: Joi.object({ metaWhatsappEnabled: Joi.boolean(), textbeeEnabled: Joi.boolean(), twilioEnabled: Joi.boolean(), twilioWhatsappEnabled: Joi.boolean(), emailEnabled: Joi.boolean() }),
  smsFallback: Joi.object({ enabled: Joi.boolean(), allowedCountries: Joi.array().items(Joi.string().uppercase().length(2)).max(250), allowedPurposes: Joi.array().items(Joi.string().valid(...MESSAGE_PURPOSES)), dailySpendLimit: Joi.number().min(0), monthlySpendLimit: Joi.number().min(0) }),
  whatsappFallback: Joi.object({ enabled: Joi.boolean(), allowedCountries: Joi.array().items(Joi.string().uppercase().length(2)).max(250), allowedPurposes: Joi.array().items(Joi.string().valid(...MESSAGE_PURPOSES)), dailySpendLimit: Joi.number().min(0), monthlySpendLimit: Joi.number().min(0) }),
  countryRouting: Joi.object({
    textbeeAllowedCountries: Joi.array().items(Joi.string().uppercase().length(2)).max(250),
    twilioAllowedCountries: Joi.array().items(Joi.string().uppercase().length(2)).max(250),
    whatsappAllowedCountries: Joi.array().items(Joi.string().uppercase().length(2)).max(250),
    twilioWhatsappAllowedCountries: Joi.array().items(Joi.string().uppercase().length(2)).max(250),
  }),
  quotas: Joi.object({ daily: Joi.number().integer().min(0).max(50000), monthly: Joi.number().integer().min(0).max(50000), perCampaign: Joi.number().integer().min(1).max(50000) }),
  quietHours: Joi.object({ enabled: Joi.boolean(), start: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/), end: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/), timezone }),
  frequencyLimits: Joi.object({
    enabled: Joi.boolean(),
    purposes: Joi.array().items(Joi.string().valid(...MESSAGE_PURPOSES)).min(1).unique(),
    email: frequencyRule, sms: frequencyRule, whatsapp: frequencyRule,
  }),
  regionalQuietHours: Joi.array().items(Joi.object({
    _id: objectId,
    name: Joi.string().trim().max(80).required(), enabled: Joi.boolean().default(true),
    countries: Joi.array().items(Joi.string().uppercase().length(2)).min(1).max(250).unique().required(),
    channel: Joi.string().valid(...CHANNELS).required(),
    purpose: Joi.string().valid(...MESSAGE_PURPOSES).default('promotional'),
    start: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).required(),
    end: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).required(),
    timezone: timezone.required(),
  }).unknown(false)).max(50),
  pricing: Joi.object({
    currency: Joi.string().uppercase().length(3), textbeeCarrierPerSegment: Joi.number().min(0),
    twilioDefaultPerSegment: Joi.number().min(0), metaMarketingPerMessage: Joi.number().min(0),
    twilioWhatsappDefaultPerMessage: Joi.number().min(0),
    metaUtilityPerMessage: Joi.number().min(0), metaServicePerMessage: Joi.number().min(0),
  }),
}).min(1) };

export const testSend = { body: Joi.object({
  authorizedRecipient: Joi.boolean().valid(true).required(),
  leadId: objectId.required(),
  channel: Joi.string().valid(...CHANNELS).required(),
  purpose: Joi.string().valid(...MESSAGE_PURPOSES).default('support'),
  templateId: objectId.allow(null),
  content,
  routing: Joi.object({ smsProvider: Joi.string().valid('auto', 'textbee', 'twilio').default('auto'), allowFallback: Joi.boolean().default(false) }).default({}),
}) };
