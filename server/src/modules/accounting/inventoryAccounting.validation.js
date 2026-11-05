import { CURRENCY_CODES } from '../../shared/data/currencies.js';
import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';
import { INVENTORY_COSTING_METHODS } from './inventoryAccountingEntry.model.js';

const currency = Joi.string().trim().uppercase().valid(...CURRENCY_CODES);
const costingMethod = Joi.string().trim().uppercase().valid(...INVENTORY_COSTING_METHODS);

export const inventoryValuationSchema = {
  query: Joi.object({
    currency,
    category: Joi.string().trim().max(80),
    costingMethod: costingMethod.default('WEIGHTED_AVERAGE'),
    limit: Joi.number().integer().min(1).max(5000).default(1000),
  }),
};

export const inventoryMovementsSchema = {
  query: Joi.object({
    currency,
    costingMethod: costingMethod.default('WEIGHTED_AVERAGE'),
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso(),
    type: Joi.string().valid('in', 'out', 'correction', 'receipt', 'issue', 'adjustment'),
    limit: Joi.number().integer().min(1).max(1000).default(250),
  }),
};

export const postInventoryMovementSchema = {
  params: Joi.object({ movementId: objectId.required() }),
  body: Joi.object({
    costingMethod: costingMethod.default('WEIGHTED_AVERAGE'),
  }).default({}),
};

export const postInventoryPeriodSchema = {
  body: Joi.object({
    currency,
    costingMethod: costingMethod.default('WEIGHTED_AVERAGE'),
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso(),
    type: Joi.string().valid('in', 'out', 'correction', 'receipt', 'issue', 'adjustment'),
    limit: Joi.number().integer().min(1).max(1000).default(250),
  }).default({}),
};

export const inventoryEntriesSchema = {
  query: Joi.object({
    currency,
    costingMethod,
    limit: Joi.number().integer().min(1).max(500).default(100),
  }),
};
