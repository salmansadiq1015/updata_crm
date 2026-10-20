import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';
import { questionSchema, statusRuleSchema } from '../aiCalling/aiCalling.validation.js';
import { isValidTimezone } from '../aiCalling/engine/callWindow.js';
import { CAMPAIGN_STATUSES, CONVERSATION_STATES } from './simSms.constants.js';

const page = Joi.number().integer().min(1).default(1);
const limit = Joi.number().integer().min(1).max(100).default(25);
const hhmm = Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/);
const timezone = Joi.string().max(80).custom((v, h) => (isValidTimezone(v) ? v : h.message('"timezone" must be a valid IANA timezone')));
const deviceId = Joi.string().trim().min(8).max(80).required();
const messageParams = Joi.object({ id: objectId.required() });

export const createCampaign = { body: Joi.object({
  name: Joi.string().trim().max(160).required(),
  isTest: Joi.boolean().default(false),
  leadIds: Joi.array().items(objectId).min(1).max(500).unique().required(),
  questionnaire: Joi.object({
    // SMS questions are shorter than voice prompts (one SMS ≈ 160 chars).
    questions: Joi.array().items(questionSchema.keys({ text: Joi.string().trim().max(600).required() })).min(1).max(15).required(),
  }).required(),
  statusRules: Joi.array().items(statusRuleSchema).max(20).default([]),
  agent: Joi.object({
    agentName: Joi.string().trim().max(80).default('Assistant'),
    organizationName: Joi.string().trim().max(120).required(),
    // Must keep the opt-out instruction: every opening tells the lead how to stop.
    intro: Joi.string().trim().max(300).allow('').pattern(/stop/i, 'mentions STOP').messages({ 'string.pattern.name': '"intro" must tell the lead how to opt out (mention STOP)' }),
    closing: Joi.string().trim().max(300).allow(''),
    language: Joi.string().trim().max(10).default('en'),
  }).required(),
  settings: Joi.object({
    timezone: timezone.default('Europe/Zurich'),
    sendWindow: Joi.object({ start: hhmm.default('09:00'), end: hhmm.default('19:00') }).default(),
    daysOfWeek: Joi.array().items(Joi.number().integer().min(0).max(6)).min(1).unique().default([1, 2, 3, 4, 5]),
    maxMessagesPerDay: Joi.number().integer().min(1).max(1000).default(100),
    minSecondsBetweenSends: Joi.number().integer().min(5).max(3600).default(20),
    replyTimeoutHours: Joi.number().integer().min(1).max(720).default(48),
    maxReminders: Joi.number().integer().min(0).max(2).default(1),
  }).default(),
  subscriptionId: Joi.number().integer().min(0).allow(null).default(null),
}) };

export const campaignId = { params: Joi.object({ id: objectId.required() }) };
export const listCampaigns = { query: Joi.object({ page, limit, status: Joi.string().valid(...CAMPAIGN_STATUSES) }) };
export const listConversations = {
  params: Joi.object({ id: objectId.required() }),
  query: Joi.object({ page, limit: Joi.number().integer().min(1).max(200).default(50), state: Joi.string().valid(...CONVERSATION_STATES) }),
};
export const conversationId = { params: Joi.object({ id: objectId.required() }) };
export const resolveAttention = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({ action: Joi.string().valid('resend', 'mark_sent', 'cancel').required() }),
};
export const leadConversations = { params: Joi.object({ leadId: objectId.required() }) };

// ---- device transport ----
export const lease = { body: Joi.object({ deviceId }) };
export const attempting = { params: messageParams, body: Joi.object({ deviceId }) };
export const result = { params: messageParams, body: Joi.object({
  deviceId,
  status: Joi.string().valid('sent', 'failed', 'unknown').required(),
  errorCode: Joi.string().max(60).allow(null).default(null),
  at: Joi.date().iso().allow(null).default(null),
}) };
export const delivery = { params: messageParams, body: Joi.object({ deviceId, at: Joi.date().iso().allow(null).default(null) }) };
export const inbound = { body: Joi.object({
  deviceId,
  deviceMessageKey: Joi.string().trim().min(8).max(128).required(),
  from: Joi.string().trim().max(40).required(),
  matchedTo: Joi.string().trim().max(40).allow(null).default(null),
  body: Joi.string().max(1600).allow('').required(),
  receivedAt: Joi.date().iso().allow(null).default(null),
}) };
