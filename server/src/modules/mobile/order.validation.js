import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

const ORDER_STATUSES = ['PLANNED', 'CONFIRMED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED'];
const ASSIGNMENT_TYPES = ['SERVICE_CALL', 'PROJECT_WORK', 'MAINTENANCE', 'INSTALLATION', 'INSPECTION', 'OTHER'];
const PRIORITIES = ['NORMAL', 'HIGH', 'URGENT'];
const ASSIGNMENT_TARGET_TYPES = ['EMPLOYEE', 'TEAM', 'DEPARTMENT'];

export const listOrdersSchema = {
  query: Joi.object({
    dateFrom: Joi.date().iso(),
    dateTo: Joi.date().iso(),
    status: Joi.string().valid(...ORDER_STATUSES),
    type: Joi.string().valid(...ASSIGNMENT_TYPES),
    orderType: Joi.string().valid(...ASSIGNMENT_TYPES),
    priority: Joi.string().valid(...PRIORITIES),
    since: Joi.date().iso(),
    // Field-ops: return all orders (not filtered by current employee)
    all: Joi.boolean(),
    search: Joi.string().max(200),
    limit: Joi.number().integer().min(1).max(500),
    cursor: Joi.string(),
    sortBy: Joi.string().valid('createdAt', 'startDatetime', 'endDatetime', 'assignmentNumber', 'priority', 'status'),
    sortOrder: Joi.string().valid('asc', 'desc'),
    employeeId: objectId,
    projectId: objectId,
    customerId: objectId,
    siteId: objectId,
    teamId: Joi.string().trim().max(100).allow(''),
    assignmentTargetType: Joi.string().valid(...ASSIGNMENT_TARGET_TYPES),
    assignmentTargetId: Joi.string().trim().max(100).allow(''),
  }),
};

export const orderIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const updateStatusSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    status: Joi.string().valid('IN_PROGRESS', 'PAUSED', 'COMPLETED').required(),
  }),
};
