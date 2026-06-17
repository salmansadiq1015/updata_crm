import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

const TYPES = ['SUPPLIER', 'MANUFACTURER', 'IGH', 'GENERIC'];
const FORMATS = ['CSV', 'JSON', 'XML'];

const credentialsSchema = Joi.object({
  username: Joi.string().trim().max(255).allow('', null),
  password: Joi.string().max(2000).allow('', null),
  apiKey: Joi.string().max(2000).allow('', null),
  token: Joi.string().max(2000).allow('', null),
}).default({});

const connectionBody = Joi.object({
  name: Joi.string().trim().max(160).required(),
  providerKey: Joi.string().trim().max(80).required(),
  type: Joi.string().valid(...TYPES).required(),
  endpointUrl: Joi.string().trim().uri({ scheme: ['http', 'https'] }).max(1000).allow('', null),
  format: Joi.string().valid(...FORMATS).default('CSV'),
  syncSchedule: Joi.string().trim().max(80).allow('', null),
  isEnabled: Joi.boolean(),
  isPreferred: Joi.boolean(),
  preferredRank: Joi.number().integer().min(0).max(100000),
  supplierId: objectId.allow(null),
  supplierName: Joi.string().trim().max(255).allow('', null),
  manufacturerName: Joi.string().trim().max(255).allow('', null),
  defaultCategoryId: objectId.allow(null),
  defaultMarkupPercent: Joi.number().min(-100).max(1000).allow(null),
  defaultMarginPercent: Joi.number().min(-100).max(99.99).allow(null),
  credentials: credentialsSchema,
  requestHeaders: Joi.object().pattern(Joi.string().max(100), Joi.string().max(1000)).default({}),
});

export const createConnectionSchema = { body: connectionBody };

export const updateConnectionSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: connectionBody.fork(['name', 'providerKey', 'type'], (schema) => schema.optional()).min(1),
};

export const listConnectionsSchema = {
  query: cursorPagination.keys({
    q: Joi.string().trim().max(200),
    search: Joi.string().trim().max(200),
    type: Joi.string().valid(...TYPES),
    isEnabled: Joi.boolean(),
    isPreferred: Joi.boolean(),
    lastSyncStatus: Joi.string().valid('NEVER', 'RUNNING', 'HEALTHY', 'FAILED', 'DISABLED'),
    supplierId: objectId,
    manufacturerName: Joi.string().trim().max(255),
  }),
};

export const connectionIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const triggerConnectionSyncSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    mode: Joi.string().valid('MANUAL', 'FULL', 'DELTA').default('MANUAL'),
  }).default({}),
};
