import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';
import { LEAD_STATUS } from './lead.model.js';
import {
  COMM_CHANNELS, PHONE_ROUTES, SMS_ROUTES, CLIENT_COMM_MODES, DESTINATION_FIELDS,
  COMM_EVENT_TYPES, COMM_EVENT_SOURCES, MAX_EVENTS_PER_REQUEST, DISPOSITIONS, CONNECTED_VALUES,
  SMS_ENCODINGS, SMS_SEND_STATUSES, ANSWER_STATUSES, ANSWER_SOURCES,
} from './leadCommunication.constants.js';
import { QUALIFICATION_FIELD_KEYS, PROPOSE_LANGUAGES } from './leadQualification.constants.js';

const operationId = Joi.string().guid({ version: 'uuidv4' }).lowercase();

const leadParams = Joi.object({ leadId: objectId.required() });
const operationParams = Joi.object({ leadId: objectId.required(), operationId: operationId.required() });

/** IANA timezone check via the runtime's tz database (rejects free text). */
const ianaTimezone = Joi.string().trim().max(64).custom((value, helpers) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return value;
  } catch {
    return helpers.error('any.invalid');
  }
}, 'IANA timezone').messages({ 'any.invalid': '{#label} must be an IANA timezone (e.g. Europe/Zurich)' });

/** Small flat event payload: primitive values only, bounded size. */
const eventData = Joi.object()
  .pattern(Joi.string().max(60), Joi.alternatives().try(
    Joi.string().max(500), Joi.number(), Joi.boolean(), Joi.valid(null),
  ))
  .max(20);

export const eligibility = {
  params: leadParams,
  query: Joi.object({
    channel: Joi.string().valid(...COMM_CHANNELS).required(),
    destinationField: Joi.string().valid(...DESTINATION_FIELDS).required(),
  }),
};

const simSchema = Joi.object({
  subscriptionId: Joi.number().integer().allow(null),
  slotIndex: Joi.number().integer().min(0).max(16).allow(null),
  carrierName: Joi.string().trim().max(120).allow(null, ''),
  displayName: Joi.string().trim().max(120).allow(null, ''),
  isEmbedded: Joi.boolean().allow(null),
  originNumber: Joi.string().trim().max(40).allow(null, ''),
  originNumberSource: Joi.string().valid('sim_reported').allow(null),
});

const deviceSchema = Joi.object({
  platform: Joi.string().valid('android').default('android'),
  osVersion: Joi.string().trim().max(40).allow(null, ''),
  appVersion: Joi.string().trim().max(40).allow(null, ''),
  model: Joi.string().trim().max(120).allow(null, ''),
});

export const createCommunication = {
  params: leadParams,
  body: Joi.object({
    operationId: operationId.required(),
    channel: Joi.string().valid(...COMM_CHANNELS).required(),
    // Route must fit the channel: SIM calls go via Telecom or the dialer, SMS
    // via the composer.
    route: Joi.when('channel', {
      is: 'phone',
      then: Joi.string().valid(...PHONE_ROUTES).required(),
      otherwise: Joi.string().valid(...SMS_ROUTES).required(),
    }),
    mode: Joi.string().valid(...CLIENT_COMM_MODES).default('manual'),
    destinationField: Joi.string().valid(...DESTINATION_FIELDS).required(),
    sim: simSchema.allow(null),
    device: deviceSchema.allow(null),
    startedAt: Joi.date().iso().allow(null),
  }),
};

export const appendEvents = {
  params: operationParams,
  body: Joi.object({
    events: Joi.array().items(Joi.object({
      seq: Joi.number().integer().min(1).required(),
      type: Joi.string().valid(...COMM_EVENT_TYPES).required(),
      at: Joi.date().iso().required(),
      source: Joi.string().valid(...COMM_EVENT_SOURCES).required(),
      data: eventData.allow(null),
    })).min(1).max(MAX_EVENTS_PER_REQUEST).required(),
  }),
};

const answerValue = Joi.alternatives().try(
  Joi.string().max(5000).allow(''), Joi.number(), Joi.boolean(), Joi.valid(null),
);

export const qualificationAnswer = Joi.object({
  fieldKey: Joi.string().valid(...QUALIFICATION_FIELD_KEYS).required(),
  label: Joi.string().trim().max(200).allow(null, ''),
  value: answerValue.default(null),
  status: Joi.string().valid(...ANSWER_STATUSES).required(),
  // 'sms_agent' answers are written only server-side by the SIM SMS agent.
  source: Joi.string().valid(...ANSWER_SOURCES.filter((v) => v !== 'sms_agent')).default('user'),
  evidence: Joi.string().max(2000).allow(null, '').default(null),
  confidence: Joi.number().min(0).max(1).allow(null).default(null),
});

export const completeCommunication = {
  params: operationParams,
  body: Joi.object({
    outcome: Joi.object({
      disposition: Joi.string().valid(...DISPOSITIONS).required(),
      connected: Joi.string().valid(...CONNECTED_VALUES).required(),
      notes: Joi.string().max(5000).allow('').default(''),
      followUpAt: Joi.date().iso().allow(null).default(null),
      followUpTimezone: ianaTimezone.allow(null).default(null)
        .when('followUpAt', { is: Joi.date().required(), then: Joi.required().invalid(null) }),
      // Every lead status is accepted here so that a request involving
      // 'converted' is recorded as a failed statusChange step
      // (LEAD_CONVERTED_PROTECTED) instead of rejecting the whole wrap-up.
      statusChange: Joi.string().valid(...Object.values(LEAD_STATUS)).allow(null).default(null),
      doNotContact: Joi.boolean().default(false),
    }).required(),
    sms: Joi.object({
      templateId: Joi.string().trim().max(64).allow(null, '').default(null),
      body: Joi.string().max(1600).allow('').required(),
      encoding: Joi.string().valid(...SMS_ENCODINGS).required(),
      segments: Joi.number().integer().min(0).max(20).required(),
      sendStatus: Joi.string().valid(...SMS_SEND_STATUSES.filter((v) => v !== 'sent_by_app')).required(),
    }).allow(null),
    qualification: Joi.object({
      answers: Joi.array().items(qualificationAnswer).max(50).unique('fieldKey').default([]),
    }).allow(null),
  }),
};

export const listCommunications = {
  params: leadParams,
  query: Joi.object({
    limit: Joi.number().integer().min(1).max(50).default(20),
    cursor: Joi.string().max(500).allow(''),
  }),
};

export const getQualification = { params: leadParams };

export const transcribeVoiceNote = { params: leadParams };

export const proposeQualification = {
  params: leadParams,
  body: Joi.object({
    notes: Joi.string().trim().min(1).max(5000).required(),
    language: Joi.string().valid(...PROPOSE_LANGUAGES).default('en'),
  }),
};
