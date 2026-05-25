import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

const ACTION_TYPES = ['NAVIGATE', 'SEARCH', 'UPDATE', 'CREATE'];

export const createCommandSchema = {
  body: Joi.object({
    intent: Joi.string().required(),
    language: Joi.string().required().max(12),
    phrases: Joi.array().items(Joi.string()).min(1).required(),
    actionType: Joi.string().valid(...ACTION_TYPES).required(),
    actionTarget: Joi.string().required(),
    actionParameters: Joi.object(),
    requiresConfirmation: Joi.boolean(),
  }),
};

export const updateCommandSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    intent: Joi.string(),
    language: Joi.string().max(12),
    phrases: Joi.array().items(Joi.string()).min(1),
    actionType: Joi.string().valid(...ACTION_TYPES),
    actionTarget: Joi.string(),
    actionParameters: Joi.object(),
    requiresConfirmation: Joi.boolean(),
  }).min(1),
};

export const commandIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const listCommandsSchema = {
  query: cursorPagination.keys({
    language: Joi.string(),
    isActive: Joi.boolean(),
    actionType: Joi.string().valid(...ACTION_TYPES),
  }),
};
