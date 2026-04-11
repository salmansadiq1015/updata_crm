import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

const TASK_LIST_TYPES = ['PERSONAL', 'GROUP'];
const MEMBER_ROLES = ['VIEWER', 'EDITOR', 'ADMIN'];

export const createTaskListSchema = {
  body: Joi.object({
    name: Joi.string().required().trim().max(200),
    type: Joi.string().valid(...TASK_LIST_TYPES).default('PERSONAL'),
    color: Joi.string().trim().max(7).allow(null, ''),
    icon: Joi.string().trim().max(50).allow(null, ''),
    sortOrder: Joi.number().integer().min(0),
  }),
};

export const updateTaskListSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    name: Joi.string().trim().max(200),
    color: Joi.string().trim().max(7).allow(null, ''),
    icon: Joi.string().trim().max(50).allow(null, ''),
    sortOrder: Joi.number().integer().min(0),
  }).min(1),
};

export const listIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const archiveSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const reorderSchema = {
  body: Joi.object({
    orderedIds: Joi.array().items(objectId.required()).min(1).max(100).required(),
  }),
};

export const addMemberSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    userId: objectId.required(),
    role: Joi.string().valid(...MEMBER_ROLES).default('EDITOR'),
  }),
};

export const updateMemberRoleSchema = {
  params: Joi.object({
    id: objectId.required(),
    userId: objectId.required(),
  }),
  body: Joi.object({
    role: Joi.string().valid(...MEMBER_ROLES).required(),
  }),
};

export const memberParamsSchema = {
  params: Joi.object({
    id: objectId.required(),
    userId: objectId.required(),
  }),
};
