import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

export const updateIghConfigSchema = {
  body: Joi.object({
    endpointUrl: Joi.string().max(500),
    credentials: Joi.object({
      username: Joi.string(),
      apiKey: Joi.string(),
    }),
    syncSchedule: Joi.string().max(50),
    isEnabled: Joi.boolean(),
  }).min(1),
};

export const importJobParamSchema = {
  params: Joi.object({
    jobId: objectId.required(),
  }),
};

export const previewImportSchema = {
  body: Joi.object({
    type: Joi.string().valid('FULL', 'DELTA').default('FULL'),
  }).default({}),
};

export const importHistorySchema = {
  query: cursorPagination.keys({
    type: Joi.string().valid('FULL', 'DELTA'),
    status: Joi.string().valid('PENDING', 'RUNNING', 'PREVIEW', 'COMPLETED', 'FAILED'),
  }),
};
