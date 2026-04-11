import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

export const createSequenceSchema = {
  body: Joi.object({
    documentType: Joi.string().valid('quotation', 'order', 'invoice').required(),
    departmentId: objectId.allow(null),
    prefix: Joi.string().required().trim().max(10),
    yearFormat: Joi.string().valid('YYYY', 'YY', 'none'),
    separator: Joi.string().max(3),
    paddingLength: Joi.number().integer().min(1).max(8),
    resetsAnnually: Joi.boolean(),
  }),
};

export const updateSequenceSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    prefix: Joi.string().trim().max(10),
    yearFormat: Joi.string().valid('YYYY', 'YY', 'none'),
    separator: Joi.string().max(3),
    paddingLength: Joi.number().integer().min(1).max(8),
    resetsAnnually: Joi.boolean(),
    isActive: Joi.boolean(),
  }).min(1),
};

export const sequenceIdSchema = {
  params: Joi.object({ id: objectId.required() }),
};
