import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

const SESSION_TYPES = ['ORDER_CREATION', 'REPORT_DICTATION', 'ADDRESS_CAPTURE', 'COMMAND', 'GENERAL'];
const SESSION_STATUSES = ['RECORDING', 'TRANSCRIBING', 'REVIEW', 'CONFIRMED', 'CANCELLED', 'FAILED'];
const DEVICE_TYPES = ['MOBILE', 'WEB'];

export const createSessionSchema = {
  body: Joi.object({
    sessionType: Joi.string().valid(...SESSION_TYPES).required(),
    language: Joi.string().max(10).default('de-CH'),
    contextModule: Joi.string(),
    contextRecordType: Joi.string(),
    contextRecordId: objectId,
    deviceType: Joi.string().valid(...DEVICE_TYPES),
  }),
};

export const sessionIdParamSchema = {
  params: Joi.object({ sessionId: objectId.required() }),
};

export const uploadAudioSchema = {
  params: Joi.object({ sessionId: objectId.required() }),
};

export const listSessionsSchema = {
  query: cursorPagination.keys({
    sessionType: Joi.string().valid(...SESSION_TYPES),
    status: Joi.string().valid(...SESSION_STATUSES),
    language: Joi.string(),
    deviceType: Joi.string().valid(...DEVICE_TYPES),
    dateFrom: Joi.date(),
    dateTo: Joi.date(),
  }),
};

export const submitCorrectionsSchema = {
  params: Joi.object({ sessionId: objectId.required() }),
  body: Joi.object({
    correctedTranscript: Joi.string().max(10000),
    entityCorrections: Joi.array().items(
      Joi.object({
        entityId: objectId.required(),
        correctedValue: Joi.string().required(),
      }),
    ),
  }),
};

export const confirmSessionSchema = {
  params: Joi.object({ sessionId: objectId.required() }),
};
