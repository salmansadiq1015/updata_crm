import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

export const integrationKeyParamSchema = {
  params: Joi.object({ key: Joi.string().required() }),
};

export const updateConfigSchema = {
  params: Joi.object({ key: Joi.string().required() }),
  body: Joi.object({
    displayName: Joi.string(),
    provider: Joi.string().allow('', null),
    config: Joi.object(),
    syncSchedule: Joi.string().allow('', null),
    credentialsRef: Joi.string().allow('', null),
  }).min(1),
};

export const healthHistorySchema = {
  params: Joi.object({ key: Joi.string().required() }),
  query: Joi.object({
    period: Joi.string().valid('24h', '7d', '30d'),
  }),
};

export const syncHistorySchema = {
  params: Joi.object({ key: Joi.string().required() }),
  query: cursorPagination.keys({
    syncType: Joi.string(),
    status: Joi.string(),
  }),
};

export const syncIdParamSchema = {
  params: Joi.object({
    key: Joi.string().required(),
    syncId: objectId.required(),
  }),
};
