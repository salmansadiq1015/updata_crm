import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

const PROJECT_STATUSES = ['DRAFT', 'PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'];
const PROJECT_TYPES = ['NEW_INSTALLATION', 'RENOVATION', 'MAINTENANCE', 'SERVICE_CONTRACT', 'OTHER'];

export const createProjectSchema = {
  body: Joi.object({
    name: Joi.string().required().trim().max(255),
    description: Joi.string().max(5000).allow('', null),
    projectType: Joi.string().valid(...PROJECT_TYPES).required(),
    customerId: objectId.required(),
    siteId: objectId.allow(null),
    projectManagerId: objectId.required(),
    teamId: objectId.allow(null),
    plannedStartDate: Joi.date().iso(),
    plannedEndDate: Joi.date().iso(),
    estimatedBudget: Joi.number().min(0),
    currency: Joi.string().trim().max(3),
    notes: Joi.string().max(5000).allow('', null),
  }),
};

export const updateProjectSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    name: Joi.string().trim().max(255),
    description: Joi.string().max(5000).allow('', null),
    projectType: Joi.string().valid(...PROJECT_TYPES),
    customerId: objectId,
    siteId: objectId.allow(null),
    projectManagerId: objectId,
    teamId: objectId.allow(null),
    plannedStartDate: Joi.date().iso().allow(null),
    plannedEndDate: Joi.date().iso().allow(null),
    estimatedBudget: Joi.number().min(0).allow(null),
    currency: Joi.string().trim().max(3),
    notes: Joi.string().max(5000).allow('', null),
  }).min(1),
};

export const listProjectsSchema = {
  query: cursorPagination.keys({
    status: Joi.string().valid(...PROJECT_STATUSES),
    projectType: Joi.string().valid(...PROJECT_TYPES),
    customerId: objectId,
    projectManagerId: objectId,
    search: Joi.string().trim().max(100),
  }),
};

export const searchProjectsSchema = {
  query: Joi.object({
    q: Joi.string().required().trim().min(2).max(100),
    limit: Joi.number().integer().min(1).max(50).default(25),
  }),
};

export const projectIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const duplicateProjectSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const bulkUpdateProjectsSchema = {
  body: Joi.object({
    ids: Joi.array().items(objectId).min(1).max(100).required(),
    data: Joi.object({
      status: Joi.string().valid(...PROJECT_STATUSES),
      projectType: Joi.string().valid(...PROJECT_TYPES),
    }).min(1).required(),
  }),
};

export const bulkDeleteProjectsSchema = {
  body: Joi.object({
    ids: Joi.array().items(objectId).min(1).max(100).required(),
  }),
};
