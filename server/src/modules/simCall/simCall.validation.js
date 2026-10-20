import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';
import { questionSchema } from '../aiCalling/aiCalling.validation.js';
import { isValidTimezone } from '../aiCalling/engine/callWindow.js';
import {
  ANSWER_STATUSES, CALL_OUTCOMES, CAMPAIGN_STATUSES, INTEREST_VALUES, MAX_LEADS, OUTCOME_EVIDENCE, TASK_STATES,
} from './simCall.constants.js';

const page = Joi.number().integer().min(1).default(1);
const limit = Joi.number().integer().min(1).max(100).default(25);
const hhmm = Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/);
const timezone = Joi.string().max(80).custom((v, h) => (isValidTimezone(v) ? v : h.message('"timezone" must be a valid IANA timezone')));
const deviceId = Joi.string().trim().min(8).max(80);
const attemptId = Joi.string().trim().min(8).max(80);
const idParams = Joi.object({ id: objectId.required() });

const settings = Joi.object({
  timezone,
  callWindow: Joi.object({ start: hhmm.required(), end: hhmm.required() }),
  daysOfWeek: Joi.array().items(Joi.number().integer().min(0).max(6)).min(1).unique(),
  countdownSeconds: Joi.number().integer().min(3).max(120),
  autoDial: Joi.boolean(),
  maxAttempts: Joi.number().integer().min(1).max(5),
  retryDelayMinutes: Joi.number().integer().min(5).max(10_080),
  readAloud: Joi.boolean(),
});
const questionnaire = Joi.object({ questions: Joi.array().items(questionSchema).min(1).max(30).required() });

export const createCampaign = { body: Joi.object({
  name: Joi.string().trim().max(160).required(),
  description: Joi.string().trim().max(1000).allow('').default(''),
  leadIds: Joi.array().items(objectId).min(1).max(MAX_LEADS).unique().required(),
  questionnaire: questionnaire.required(),
  instructions: Joi.string().trim().max(2000).allow('').default(''),
  settings: settings.default({}),
  subscriptionId: Joi.number().integer().min(0).allow(null).default(null),
  startsAt: Joi.date().iso().allow(null).default(null),
}) };

export const updateCampaign = { params: idParams, body: Joi.object({
  name: Joi.string().trim().max(160),
  description: Joi.string().trim().max(1000).allow(''),
  leadIds: Joi.array().items(objectId).min(1).max(MAX_LEADS).unique(),
  questionnaire,
  instructions: Joi.string().trim().max(2000).allow(''),
  settings,
  subscriptionId: Joi.number().integer().min(0).allow(null),
  startsAt: Joi.date().iso().allow(null),
}).min(1) };

export const campaignId = { params: idParams };
export const listCampaigns = { query: Joi.object({ page, limit, status: Joi.string().valid(...CAMPAIGN_STATUSES), q: Joi.string().trim().max(100).allow('') }) };
export const listTasks = { params: idParams, query: Joi.object({
  page, limit: Joi.number().integer().min(1).max(200).default(50),
  state: Joi.string().valid(...TASK_STATES), outcome: Joi.string().valid(...CALL_OUTCOMES), q: Joi.string().trim().max(100).allow(''),
}) };
export const listEvents = { params: idParams, query: Joi.object({ page, limit: Joi.number().integer().min(1).max(200).default(50) }) };
export const retry = { params: idParams, body: Joi.object({ taskIds: Joi.array().items(objectId).max(MAX_LEADS).default([]) }).default({}) };
export const claimNext = { params: idParams, body: Joi.object({ deviceId: deviceId.required() }) };

export const taskId = { params: idParams };
export const dial = { params: idParams, body: Joi.object({
  attemptId: attemptId.required(), deviceId: deviceId.required(), subscriptionId: Joi.number().integer().min(0).allow(null).default(null),
}) };
export const release = { params: idParams, body: Joi.object({ attemptId: attemptId.required(), deviceId: deviceId.required() }) };
export const skip = { params: idParams, body: Joi.object({
  attemptId: attemptId.allow(null).default(null), deviceId: deviceId.allow(null).default(null), reason: Joi.string().trim().max(200).allow('').default(''),
}).default({}) };

const answer = Joi.object({
  fieldKey: Joi.string().trim().max(80).required(),
  status: Joi.string().valid(...ANSWER_STATUSES).required(),
  value: Joi.alternatives(Joi.string().max(2000).allow(''), Joi.number(), Joi.boolean(), Joi.array().items(Joi.string().max(200)).max(50)).allow(null).default(null),
});
export const saveAnswers = { params: idParams, body: Joi.object({
  attemptId: attemptId.required(), deviceId: deviceId.allow(null).default(null),
  answers: Joi.array().items(answer).min(1).max(30).unique('fieldKey').required(),
}) };

export const complete = { params: idParams, body: Joi.object({
  attemptId: attemptId.required(),
  outcome: Joi.string().valid(...CALL_OUTCOMES).required(),
  interest: Joi.string().valid(...INTEREST_VALUES).allow(null).default(null),
  answers: Joi.array().items(answer).max(30).unique('fieldKey').default([]),
  notes: Joi.string().max(5000).allow('').default(''),
  transcript: Joi.string().max(10_000).allow('').default(''),
  callback: Joi.object({
    at: Joi.date().iso().required(),
    timezone: timezone.required(),
    reason: Joi.string().trim().max(500).allow('').default(''),
  }).allow(null).default(null),
  doNotContact: Joi.boolean().default(false),
  call: Joi.object({
    evidence: Joi.string().valid(...OUTCOME_EVIDENCE).default('user'),
    offhookAt: Joi.date().iso().allow(null).default(null),
    endedAt: Joi.date().iso().allow(null).default(null),
    durationSec: Joi.number().integer().min(0).max(86_400).allow(null).default(null),
    offhookDurationSec: Joi.number().integer().min(0).max(86_400).allow(null).default(null),
  }).default({}),
}) };

export const callbacks = { query: Joi.object({
  status: Joi.string().valid('pending', 'overdue', 'done', 'cancelled').default('pending'),
  from: Joi.date().iso(), to: Joi.date().iso(), page, limit: Joi.number().integer().min(1).max(200).default(50),
}) };
export const reschedule = { params: idParams, body: Joi.object({
  at: Joi.date().iso().required(), timezone: timezone.required(), reason: Joi.string().trim().max(500).allow(''),
}) };
export const leadTasks = { params: Joi.object({ leadId: objectId.required() }) };
