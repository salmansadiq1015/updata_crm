import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

const ORDER_STATUSES = ['PLANNED', 'IN_PROGRESS', 'COMPLETED'];
const ASSIGNMENT_TYPES = ['SERVICE_CALL', 'PROJECT_WORK', 'MAINTENANCE', 'INSTALLATION', 'INSPECTION', 'OTHER'];

export const listOrdersSchema = {
  query: Joi.object({
    dateFrom: Joi.date().iso(),
    dateTo: Joi.date().iso(),
    status: Joi.string().valid(...ORDER_STATUSES),
    type: Joi.string().valid(...ASSIGNMENT_TYPES),
    orderType: Joi.string().valid(...ASSIGNMENT_TYPES),
    since: Joi.date().iso(),
    // Field-ops: return all orders (not filtered by current employee)
    all: Joi.boolean(),
    search: Joi.string().max(200),
    limit: Joi.number().integer().min(1).max(500),
    cursor: Joi.string(),
    sortBy: Joi.string().valid('createdAt', 'startDatetime', 'assignmentNumber'),
    sortOrder: Joi.string().valid('asc', 'desc'),
    employeeId: objectId,
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
