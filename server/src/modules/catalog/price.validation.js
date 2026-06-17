import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

const priceUpdateBodySchema = Joi.object({
  type: Joi.string().valid('individual', 'bulk', 'percentage').required(),

  articleId: Joi.when('type', {
    is: 'individual',
    then: objectId.required(),
    otherwise: Joi.forbidden(),
  }),
  newPrice: Joi.when('type', {
    is: 'individual',
    then: Joi.number().min(0).required(),
    otherwise: Joi.forbidden(),
  }),

  updates: Joi.when('type', {
    is: 'bulk',
    then: Joi.array().items(
      Joi.object({
        articleId: objectId.required(),
        newPrice: Joi.number().min(0).required(),
      }),
    ).min(1).max(10000).required(),
    otherwise: Joi.forbidden(),
  }),

  filter: Joi.when('type', {
    is: 'percentage',
    then: Joi.object({
      categoryId: objectId,
      type: Joi.string().valid('MATERIAL', 'SERVICE'),
      status: Joi.string().valid('ACTIVE', 'INACTIVE'),
      source: Joi.string().valid('INTERNAL', 'IGH', 'SUPPLIER', 'MANUFACTURER'),
      catalogConnectionId: objectId,
      supplierId: objectId,
      manufacturerName: Joi.string().trim().max(255),
      productGroup: Joi.string().trim().max(100),
    }).min(1).required(),
    otherwise: Joi.forbidden(),
  }),
  percentage: Joi.when('type', {
    is: 'percentage',
    then: Joi.number().min(-100).max(1000).required(),
    otherwise: Joi.forbidden(),
  }),

  description: Joi.string().max(500),
});

export const updatePriceSchema = {
  body: priceUpdateBodySchema,
};

export const previewPriceSchema = {
  body: priceUpdateBodySchema,
};

export const priceHistorySchema = {
  params: Joi.object({
    articleId: objectId.required(),
  }),
  query: Joi.object({
    from: Joi.date().iso(),
    to: Joi.date().iso(),
  }),
};

export const schedulePriceSchema = {
  body: priceUpdateBodySchema.keys({
    scheduledDate: Joi.date().iso().greater('now').required(),
  }),
};

export const listBatchesSchema = {
  query: cursorPagination.keys({
    status: Joi.string().valid('PENDING', 'APPLIED', 'ROLLED_BACK'),
    type: Joi.string().valid('MANUAL', 'PERCENTAGE', 'IMPORT', 'SCHEDULED'),
  }),
};

export const rollbackSchema = {
  params: Joi.object({
    batchId: objectId.required(),
  }),
};
