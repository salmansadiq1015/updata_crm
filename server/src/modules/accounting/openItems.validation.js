import { CURRENCY_CODES } from '../../shared/data/currencies.js';
import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

export const listOpenItemsSchema = {
  query: cursorPagination.keys({
    currency: Joi.string().valid(...CURRENCY_CODES),
    entityType: Joi.string().valid('AR', 'AP', 'ALL').default('ALL'),
    customerId: objectId,
    supplierId: objectId,
    agingBucket: Joi.string().valid('current', '1_30', '31_60', '61_90', '90_plus'),
    q: Joi.string().trim().max(200),
  }),
};

export const agingSchema = {
  query: Joi.object({
    currency: Joi.string().valid(...CURRENCY_CODES),
    entityType: Joi.string().valid('AR', 'AP', 'ALL').default('ALL'),
  }),
};

export const statementSchema = {
  params: Joi.object({
    entityId: objectId.required(),
  }),
  query: Joi.object({
    entityType: Joi.string().valid('customer', 'supplier').required(),
    dateFrom: Joi.date().iso(),
    dateTo: Joi.date().iso(),
  }),
  body: Joi.object({
    format: Joi.string().valid('json', 'pdf').default('json'),
    sendEmail: Joi.boolean().default(false),
    recipientEmail: Joi.string().email().trim().max(255),
  }).default({}),
};

export const netPositionSchema = {
  params: Joi.object({
    entityId: objectId.required(),
  }),
};

export const netItemsSchema = {
  body: Joi.object({
    customerId: objectId.required(),
    supplierId: objectId,
    arInvoiceIds: Joi.array().items(objectId.required()).min(1).max(100).required(),
    apInvoiceIds: Joi.array().items(objectId.required()).min(1).max(100).required(),
    amount: Joi.number().precision(2).positive(),
    reason: Joi.string().trim().max(500).allow('', null),
  }),
};
