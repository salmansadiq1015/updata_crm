import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

const ORDER_STATUSES = ['PLANNED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const ASSIGNMENT_TYPES = ['SERVICE_CALL', 'PROJECT_WORK', 'MAINTENANCE', 'INSTALLATION', 'INSPECTION', 'OTHER'];
const PRIORITIES = ['NORMAL', 'HIGH', 'URGENT'];

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
  }),
};

export const orderIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const updateStatusSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    status: Joi.string().valid('IN_PROGRESS', 'COMPLETED').required(),
  }),
};
