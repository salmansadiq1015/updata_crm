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
    q: Joi.string().min(1).max(200).required(),
    categoryId: objectId,
    limit: Joi.number().integer().min(1).max(50).default(25),
  }),
};

export const barcodeSchema = {
  body: Joi.object({
    code: Joi.string().required().max(50),
  }),
};
