import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

const ORDER_STATUSES = ['PLANNED', 'IN_PROGRESS', 'COMPLETED'];
const ASSIGNMENT_TYPES = ['INSTALLATION', 'MAINTENANCE', 'REPAIR', 'INSPECTION', 'PROJECT_WORK'];

export const listOrdersSchema = {
  query: Joi.object({
    dateFrom: Joi.date().iso(),
    dateTo: Joi.date().iso(),
    status: Joi.string().valid(...ORDER_STATUSES),
    type: Joi.string().valid(...ASSIGNMENT_TYPES),
    since: Joi.date().iso(),
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
