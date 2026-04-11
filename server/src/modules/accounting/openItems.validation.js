import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

export const listOpenItemsSchema = {
  query: cursorPagination.keys({
    entityType: Joi.string().valid('AR', 'AP', 'ALL').default('ALL'),
    customerId: objectId,
    supplierId: objectId,
    agingBucket: Joi.string().valid('current', '1_30', '31_60', '61_90', '90_plus'),
  }),
};

export const agingSchema = {
  query: Joi.object({
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
};

export const netPositionSchema = {
  params: Joi.object({
    entityId: objectId.required(),
  }),
};
