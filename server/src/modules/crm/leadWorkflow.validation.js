import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';
import { QUALIFICATION_FIELD_KEYS } from './leadQualification.constants.js';
import { FOLLOW_UP_CHANNELS, FOLLOW_UP_TYPES, FOLLOW_UP_PRIORITIES } from './leadFollowUp.model.js';
import { ASSIGNMENT_STRATEGIES } from './leadAssignmentPolicy.model.js';
import { TIMELINE_TYPES, TIMELINE_CHANNELS } from './leadTimeline.service.js';
import { isValidTimezone } from './leadWorkflowTime.js';

/**
 * Joi schemas for the lead workflow endpoints (timeline, answer corrections,
 * follow-up inbox, assignment/SLA policy).
 */

const ianaTimezone = Joi.string().trim().max(64).custom((value, helpers) => (
  isValidTimezone(value) ? value : helpers.error('any.invalid')
), 'IANA timezone').messages({ 'any.invalid': '{#label} must be an IANA timezone (e.g. Europe/Zurich)' });

const csvOf = (allowed) => Joi.string().trim().max(300).custom((value, helpers) => {
  const items = [...new Set(value.split(',').map((s) => s.trim()).filter(Boolean))];
  if (!items.length || items.some((i) => !allowed.includes(i))) return helpers.error('any.invalid');
  return items;
}).messages({ 'any.invalid': `{#label} must be a comma-separated list of: ${allowed.join(', ')}` });

const leadParams = Joi.object({ leadId: objectId.required() });
const idParams = Joi.object({ id: objectId.required() });
const cursor = Joi.string().trim().max(500);

export const timeline = {
  params: leadParams,
  query: Joi.object({
    cursor,
    limit: Joi.number().integer().min(1).max(100).default(25),
    types: csvOf(TIMELINE_TYPES),
    channel: Joi.string().valid(...TIMELINE_CHANNELS),
  }),
};

export const callTranscript = {
  params: Joi.object({ leadId: objectId.required(), callId: objectId.required() }),
};

export const qualificationCorrection = {
  params: leadParams,
  body: Joi.object({
    fieldKey: Joi.string().valid(...QUALIFICATION_FIELD_KEYS).required(),
    status: Joi.string().valid('answered', 'unknown', 'refused', 'not_applicable').required(),
    value: Joi.alternatives().try(Joi.string().max(5000).allow(''), Joi.number(), Joi.boolean()).allow(null),
    reason: Joi.string().trim().min(1).max(1000).required(),
    correctionOf: objectId.allow(null),
  }),
};

const scope = Joi.string().valid('mine', 'team', 'all').default('mine');

export const listFollowUps = {
  query: Joi.object({
    scope,
    bucket: Joi.string().valid('overdue', 'today', 'upcoming', 'open', 'done').default('open'),
    cursor,
    limit: Joi.number().integer().min(1).max(100).default(25),
    tz: ianaTimezone.default('UTC'),
    leadId: objectId,
    ownerId: objectId,
    q: Joi.string().trim().max(200).allow(''),
    channel: Joi.string().valid(...FOLLOW_UP_CHANNELS),
    qualification: Joi.string().valid('QUALIFIED', 'PARTIALLY_QUALIFIED', 'NOT_QUALIFIED', 'UNQUALIFIED', 'CALLBACK_REQUIRED', 'NOT_INTERESTED', 'UNRESPONSIVE', 'CONTACTED', 'NEW'),
    order: Joi.string().valid('asc', 'desc'),
    management: Joi.string().valid('ai', 'human', 'ai_scheduled', 'ai_active', 'ai_completed', 'ai_failed', 'attention'),
    agentId: objectId,
  }),
};

export const followUpSummary = {
  query: Joi.object({ scope, tz: ianaTimezone.default('UTC') }),
};

export const followUpId = { params: idParams };

export const createFollowUp = {
  body: Joi.object({
    leadId: objectId.required(),
    ownerId: objectId.allow(null),
    dueAt: Joi.date().iso().required(),
    timezone: ianaTimezone.allow(null),
    channel: Joi.string().valid(...FOLLOW_UP_CHANNELS).allow(null),
    note: Joi.string().trim().max(2000).allow('', null),
    taskType: Joi.string().valid(...FOLLOW_UP_TYPES).allow(null),
    priority: Joi.string().valid(...FOLLOW_UP_PRIORITIES),
    reminderMinutes: Joi.number().integer().min(0).max(10080).allow(null),
  }),
};

export const completeFollowUp = {
  params: idParams,
  body: Joi.object({ note: Joi.string().trim().max(2000).allow('', null) }),
};

export const snoozeFollowUp = {
  params: idParams,
  body: Joi.object({ until: Joi.date().iso().required() }),
};

export const reassignFollowUp = {
  params: idParams,
  body: Joi.object({ ownerId: objectId.required() }),
};

export const cancelFollowUp = {
  params: idParams,
  body: Joi.object({ reason: Joi.string().trim().min(1).max(1000).required() }),
};

export const followUpContactCheck = {
  params: idParams,
  query: Joi.object({ channel: Joi.string().valid(...FOLLOW_UP_CHANNELS) }),
};

const hhmm = Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/);

export const updateAssignmentPolicy = {
  body: Joi.object({
    enabled: Joi.boolean(),
    strategy: Joi.string().valid(...ASSIGNMENT_STRATEGIES),
    eligibleUserIds: Joi.array().items(objectId).max(200).unique(),
    rules: Joi.array().max(50).items(Joi.object({
      name: Joi.string().trim().max(120).allow('', null),
      match: Joi.object({
        source: Joi.string().trim().max(40).allow('', null),
        city: Joi.string().trim().max(120).allow('', null),
        businessType: Joi.string().trim().max(120).allow('', null),
      }).required(),
      userIds: Joi.array().items(objectId).min(1).max(200).unique().required(),
      strategy: Joi.string().valid(...ASSIGNMENT_STRATEGIES).allow(null),
    })),
    sla: Joi.object({
      enabled: Joi.boolean(),
      firstResponseMinutes: Joi.number().integer().min(5).max(60 * 24 * 14),
      businessHours: Joi.object({
        enabled: Joi.boolean(),
        timezone: ianaTimezone,
        days: Joi.array().items(Joi.number().integer().min(1).max(7)).min(1).max(7).unique(),
        start: hhmm,
        end: hhmm,
      }),
    }),
    escalation: Joi.object({
      enabled: Joi.boolean(),
      afterMinutes: Joi.number().integer().min(5).max(60 * 24 * 14),
      maxLevel: Joi.number().integer().min(1).max(5),
      userIds: Joi.array().items(objectId).max(50).unique(),
      followUpAfterMinutes: Joi.number().integer().min(5).max(60 * 24 * 14),
    }),
  }).min(1),
};
