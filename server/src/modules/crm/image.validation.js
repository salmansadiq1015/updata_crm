import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

export const createImageSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    caption: Joi.string().trim().max(255).allow('', null),
    category: Joi.string().valid('nameplate', 'damage', 'before_after', 'general').default('general'),
    sortOrder: Joi.number().integer().min(0).default(0),
  }),
};

export const imageIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};
