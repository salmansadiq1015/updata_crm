import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

export const pickerArticlesSchema = {
  query: Joi.object({
    q: Joi.string().min(1).max(200).required(),
    categoryId: objectId,
    type: Joi.string().valid('MATERIAL', 'SERVICE'),
    source: Joi.string().valid('INTERNAL', 'IGH'),
    limit: Joi.number().integer().min(1).max(50).default(25),
  }),
};

export const pickerTextBlocksSchema = {
  query: Joi.object({
    // Optional: an empty query lists the most recent blocks so the picker can
    // show suggestions before the user types (the service handles both cases).
    q: Joi.string().max(200).allow('').default(''),
    categoryId: objectId,
    limit: Joi.number().integer().min(1).max(50).default(25),
  }),
};

export const barcodeSchema = {
  body: Joi.object({
    code: Joi.string().required().max(50),
  }),
};

export const articleUseSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
};
