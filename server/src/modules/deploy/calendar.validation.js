import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';
import { ASSIGNMENT_TYPES, ASSIGNMENT_STATUSES } from './assignment.model.js';

export const calendarQuerySchema = {
  query: Joi.object({
    startDate: Joi.date().iso().required(),
    endDate: Joi.date().iso().required(),
    employeeIds: Joi.string().allow(''),
    teamId: objectId.allow(null),
    type: Joi.string().valid(...ASSIGNMENT_TYPES).allow(''),
    status: Joi.string().valid(...ASSIGNMENT_STATUSES).allow(''),
    view: Joi.string().valid('DAY', 'WEEK', 'MONTH'),
  }),
};
