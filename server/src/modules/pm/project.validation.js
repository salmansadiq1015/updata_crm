import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

const PROJECT_STATUSES = [
  'DRAFT',
  'PLANNING',
  'SCHEDULED',
  'WAITING_FOR_MATERIAL',
  'IN_PROGRESS',
  'AWAITING_CUSTOMER_APPROVAL',
  'AWAITING_QUOTATION_APPROVAL',
  'ON_HOLD',
  'COMPLETED',
  'INVOICED',
  'ARCHIVED',
];
const PROJECT_TYPES = ['NEW_INSTALLATION', 'RENOVATION', 'MAINTENANCE', 'SERVICE_CONTRACT', 'OTHER'];

const projectStatusFilter = Joi.string().trim().custom((value, helpers) => {
  const statuses = value.split(',').map((status) => status.trim()).filter(Boolean);
  if (statuses.length === 0) return helpers.error('any.invalid');
  const invalidStatus = statuses.find((status) => !PROJECT_STATUSES.includes(status));
  if (invalidStatus) return helpers.message(`status contains invalid project status: ${invalidStatus}`);
  return statuses.join(',');
}, 'project status filter');

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
    plannedEndDate: Joi.date().iso().when('plannedStartDate', {
      is: Joi.exist(),
      then: Joi.date().greater(Joi.ref('plannedStartDate')).messages({
        'date.greater': 'Planned end date must be after planned start date',
      }),
    }),
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
    plannedEndDate: Joi.date().iso().allow(null).when('plannedStartDate', {
      is: Joi.date().iso(),
      then: Joi.date().greater(Joi.ref('plannedStartDate')).messages({
        'date.greater': 'Planned end date must be after planned start date',
      }),
    }),
    estimatedBudget: Joi.number().min(0).allow(null),
    currency: Joi.string().trim().max(3),
    notes: Joi.string().max(5000).allow('', null),
    status: Joi.string().valid(...PROJECT_STATUSES),
  }).min(1),
};

export const listProjectsSchema = {
  query: cursorPagination.keys({
    status: projectStatusFilter,
    projectType: Joi.string().valid(...PROJECT_TYPES),
    customerId: objectId,
    projectManagerId: objectId,
    search: Joi.string().trim().max(100),
    myOnly: Joi.boolean().default(false),
    plannedStartFrom: Joi.date().iso(),
    plannedStartTo: Joi.date().iso(),
    includeDeleted: Joi.boolean().default(false),
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

export const createFromTemplateSchema = {
  body: Joi.object({
    templateId: objectId.required(),
    name: Joi.string().trim().max(255),
    customerId: objectId,
    siteId: objectId.allow(null),
    projectManagerId: objectId,
    projectType: Joi.string().valid(...PROJECT_TYPES),
    plannedStartDate: Joi.date().iso(),
    plannedEndDate: Joi.date().iso(),
  }),
};

export const exportProjectsSchema = {
  query: Joi.object({
    status: Joi.string().valid(...PROJECT_STATUSES),
    projectType: Joi.string().valid(...PROJECT_TYPES),
    customerId: objectId,
    projectManagerId: objectId,
    search: Joi.string().trim().max(100),
    format: Joi.string().valid('csv').default('csv'),
  }),
};
