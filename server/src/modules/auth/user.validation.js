import Joi from 'joi';
import { passwordSchema } from './auth.validation.js';
import { objectId, cursorPagination, idParam } from '../../shared/validation/commonSchemas.js';
import { ValidationError } from '../../shared/errors/AppError.js';
import * as aiCallingSchemas from '../aiCalling/aiCalling.validation.js';
import { MESSAGE_PURPOSES } from '../messaging/messaging.constants.js';

const schedulingCapabilitySchema = Joi.array().items(Joi.string().trim().max(80)).max(50);
const assignmentTypes = ['manager', 'team'];
const preferredDepartmentId = objectId.allow(null);

export const createUserSchema = {
  body: Joi.object({
    email: Joi.string().email().required().lowercase().trim().max(255),
    password: passwordSchema.optional(),
    firstName: Joi.string().required().trim().max(100),
    lastName: Joi.string().required().trim().max(100),
    salutation: Joi.string().valid('herr', 'frau').allow('', null),
    birthDate: Joi.date().iso().max('now').allow(null),
    initials: Joi.string().trim().uppercase().max(5).allow('', null),
    roleId: objectId.required(),
    language: Joi.string().valid('de', 'en', 'fr', 'it').default('de'),
    phone: Joi.string().trim().max(30).allow('', null),
    department: Joi.string().trim().max(100).allow('', null),
    position: Joi.string().trim().max(100).allow('', null),
    street: Joi.string().trim().max(200).allow('', null),
    addressSupplement: Joi.string().trim().max(255).allow('', null),
    city: Joi.string().trim().max(100).allow('', null),
    zip: Joi.string().trim().max(20).allow('', null),
    country: Joi.string().trim().max(100).allow('', null),
    preferredDepartmentId,
    schedulingSkills: schedulingCapabilitySchema,
    schedulingCertifications: schedulingCapabilitySchema,
  }),
};

export const updateUserSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    password: passwordSchema.optional(),
    email: Joi.string().email().lowercase().trim().max(255),
    firstName: Joi.string().trim().max(100),
    lastName: Joi.string().trim().max(100),
    salutation: Joi.string().valid('herr', 'frau').allow('', null),
    birthDate: Joi.date().iso().max('now').allow(null),
    initials: Joi.string().trim().uppercase().max(5).allow('', null),
    roleId: objectId,
    language: Joi.string().valid('de', 'en', 'fr', 'it'),
    phone: Joi.string().trim().max(30).allow('', null),
    department: Joi.string().trim().max(100).allow('', null),
    position: Joi.string().trim().max(100).allow('', null),
    street: Joi.string().trim().max(200).allow('', null),
    addressSupplement: Joi.string().trim().max(255).allow('', null),
    city: Joi.string().trim().max(100).allow('', null),
    zip: Joi.string().trim().max(20).allow('', null),
    country: Joi.string().trim().max(100).allow('', null),
    preferredDepartmentId,
    status: Joi.string().valid('active', 'deactivated', 'locked'),
    schedulingSkills: schedulingCapabilitySchema,
    schedulingCertifications: schedulingCapabilitySchema,
  }).min(1),
};

export const updateMeSchema = {
  body: Joi.object({
    firstName: Joi.string().trim().max(100),
    lastName: Joi.string().trim().max(100),
    salutation: Joi.string().valid('herr', 'frau').allow('', null),
    birthDate: Joi.date().iso().max('now').allow(null),
    language: Joi.string().valid('de', 'en', 'fr', 'it'),
    phone: Joi.string().trim().max(30).allow('', null),
    department: Joi.string().trim().max(100).allow('', null),
    position: Joi.string().trim().max(100).allow('', null),
    street: Joi.string().trim().max(200).allow('', null),
    addressSupplement: Joi.string().trim().max(255).allow('', null),
    city: Joi.string().trim().max(100).allow('', null),
    zip: Joi.string().trim().max(20).allow('', null),
    country: Joi.string().trim().max(100).allow('', null),
  }),
};

export const listUsersSchema = {
  query: cursorPagination.keys({
    role: objectId,
    status: Joi.string().valid('active', 'pending_activation', 'deactivated', 'locked'),
    language: Joi.string().valid('de', 'en', 'fr', 'it'),
    search: Joi.string().trim().max(100),
  }),
};

export const directoryUsersSchema = {
  query: Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(80),
    search: Joi.string().trim().max(100).allow(''),
  }),
};

export const userIdParamSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
};

export const listUserProjectsSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  query: cursorPagination.keys({
    assignmentType: Joi.string().valid('all', ...assignmentTypes).default('all'),
    search: Joi.string().trim().max(100),
  }),
};

export const assignUserProjectSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    projectId: objectId.required(),
    assignmentType: Joi.string().valid(...assignmentTypes).default('manager'),
  }),
};

export const bulkUpdateSchema = {
  body: Joi.object({
    ids: Joi.array().items(objectId).unique().min(1).max(100).required(),
    data: Joi.object({
      roleId: objectId,
      language: Joi.string().valid('de', 'en', 'fr', 'it'),
      status: Joi.string().valid('active', 'deactivated', 'locked'),
      preferredDepartmentId,
    }).min(1).required(),
  }),
};

export const bulkDeleteSchema = {
  body: Joi.object({
    ids: Joi.array().items(objectId).unique().min(1).max(100).required(),
  }),
};

export { idParam };

// ------------------------------------------------------------ AI agent defaults
// Per-user defaults for the AI calling / AI SMS agent (preferences.aiAgentDefaults).
// Every field reuses the exact rule the campaign API applies (aiCalling createCampaign),
// so a saved default is always campaign-valid; only `voice` and `timezone` are tightened.

/**
 * OpenAI Realtime voices the agent worker can speak with (agent-worker passes
 * agentConfig.voice to the Realtime session). Same list as the web campaign wizard.
 */
export const AI_AGENT_VOICES = Object.freeze(['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse']);

const campaignBody = aiCallingSchemas.createCampaign.body;
const campaignAgentConfig = campaignBody.extract('agentConfig');
const campaignSchedule = campaignBody.extract('schedule');
const pick = (schema, keys) => Joi.object(Object.fromEntries(keys.map((key) => [key, schema.extract(key)])));

const validTimezone = (value, helpers) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format();
    return value;
  } catch {
    return helpers.error('any.invalid');
  }
};

export const aiAgentDefaultsSchema = Joi.object({
  agentConfig: pick(campaignAgentConfig, ['agentName', 'organizationName', 'objective', 'language', 'voice', 'disclosure'])
    .keys({ voice: Joi.string().trim().valid(...AI_AGENT_VOICES).default('alloy') })
    .default({}),
  // Same question rules as a campaign questionnaire; optional (the app proposes its own).
  questions: campaignBody.extract('questionnaire.questions').optional(),
  schedule: pick(campaignSchedule, [
    'timezone', 'callWindow', 'daysOfWeek', 'maxAttemptsPerLead', 'retryDelayMinutes', 'maxCallsPerDay',
  ])
    .keys({
      timezone: Joi.string().trim().max(80).custom(validTimezone, 'IANA time zone').default('UTC')
        .messages({ 'any.invalid': '{{#label}} must be a valid IANA time zone, e.g. Europe/Zurich' }),
      daysOfWeek: Joi.array().items(Joi.number().integer().min(0).max(6)).unique().min(1).max(7).default([1, 2, 3, 4, 5]),
    })
    .default({}),
  sms: Joi.object({
    purpose: Joi.string().valid(...MESSAGE_PURPOSES).default('promotional'),
    templateId: objectId.allow(null).default(null),
  }).default({}),
});

/**
 * Validate a PATCH /users/me/preferences `aiAgentDefaults` value. `null` clears the
 * defaults. Returns the normalized value or throws a 400 ValidationError.
 */
export function parseAiAgentDefaults(input) {
  if (input === null) return null;
  // Absent sections still get their campaign defaults (Joi's object default skips children).
  const withSections = input && typeof input === 'object' && !Array.isArray(input)
    ? { agentConfig: {}, schedule: {}, sms: {}, ...input }
    : input;
  const { error, value } = aiAgentDefaultsSchema.validate(withSections, { abortEarly: false, stripUnknown: true, convert: true });
  if (error) {
    throw new ValidationError('Validation failed', error.details.map((d) => ({
      field: ['aiAgentDefaults', ...d.path].join('.'),
      message: d.message.replace(/"/g, "'"),
      type: d.type,
    })));
  }
  return { ...value, updatedAt: new Date() };
}
