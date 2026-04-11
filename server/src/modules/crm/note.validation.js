import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

export const createNoteSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    text: Joi.string().required().max(2000),
    category: Joi.string().valid('general', 'warning', 'access_info', 'technical').default('general'),
    isPinned: Joi.boolean().default(false),
    isWarning: Joi.boolean().default(false),
  }),
};

export const updateNoteSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    text: Joi.string().max(2000),
    category: Joi.string().valid('general', 'warning', 'access_info', 'technical'),
    isPinned: Joi.boolean(),
    isWarning: Joi.boolean(),
  }).min(1),
};

export const noteIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};
