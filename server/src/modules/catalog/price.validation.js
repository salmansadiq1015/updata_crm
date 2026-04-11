import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

export const updatePriceSchema = {
  body: Joi.object({
    type: Joi.string().valid('individual', 'bulk', 'percentage').required(),

    // individual
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

    // bulk
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

    // percentage
    filter: Joi.when('type', {
      is: 'percentage',
      then: Joi.object().required(),
      otherwise: Joi.forbidden(),
    }),
    percentage: Joi.when('type', {
      is: 'percentage',
      then: Joi.number().required(),
      otherwise: Joi.forbidden(),
    }),

    // shared optional
    description: Joi.string().max(500),
  }),
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
  body: Joi.object({
    scheduledDate: Joi.date().iso().greater('now').required(),
    type: Joi.string().valid('MANUAL', 'PERCENTAGE', 'IMPORT', 'SCHEDULED'),
    description: Joi.string().max(500),
    updates: Joi.array().items(
      Joi.object({
        articleId: objectId.required(),
        newPrice: Joi.number().min(0).required(),
      }),
    ),
    filter: Joi.object(),
    percentage: Joi.number(),
  }),
};

export const rollbackSchema = {
  params: Joi.object({
    batchId: objectId.required(),
  }),
};
