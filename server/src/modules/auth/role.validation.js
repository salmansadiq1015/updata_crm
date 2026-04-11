import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

export const createRoleSchema = {
  body: Joi.object({
    name: Joi.string().required().trim().max(50),
    description: Joi.string().trim().max(255).allow('').default(''),
    permissions: Joi.array().items(objectId).min(1).required(),
  }),
};

export const updateRoleSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    name: Joi.string().trim().max(50),
    description: Joi.string().trim().max(255).allow(''),
    permissions: Joi.array().items(objectId).min(1),
  }),
};

export const roleIdParamSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
};
