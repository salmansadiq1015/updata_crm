import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

// Per-device UI defaults (Rollenabhängige Startseite — Key User configurable).
const uiDeviceSchema = Joi.object({
  startPage: Joi.string().trim().max(200).allow('', null),
  sidebarOrder: Joi.array().items(Joi.string().trim().max(120)).max(100),
  hiddenModules: Joi.array().items(Joi.string().trim().max(120)).max(100),
  taskDefaults: Joi.object({
    assigneeFilter: Joi.string().trim().max(40).allow('', null),
    savedView: Joi.string().valid('none', 'dueToday', 'overdue', 'pool').allow('', null),
    status: Joi.string().trim().max(20).allow('', null),
    view: Joi.string().valid('list', 'board', 'calendar', 'timeline').allow('', null),
  }).allow(null),
}).allow(null);

const uiConfigSchema = Joi.object({
  desktop: uiDeviceSchema,
  mobile: uiDeviceSchema,
}).allow(null);

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
    uiConfig: uiConfigSchema,
  }),
};

export const roleIdParamSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
};
