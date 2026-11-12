import Joi from 'joi';
import { ASSIGNMENT_TYPES, ASSIGNMENT_STATUSES } from './assignment.model.js';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
// Month view plus adjacent-range prefetch stays far below this; it bounds the
// payload of a single request (every assignment in the range is returned).
export const MAX_CALENDAR_RANGE_DAYS = 120;

const employeeIdList = Joi.string().allow('').custom((value, helpers) => {
  const ids = String(value).split(',').map((id) => id.trim()).filter(Boolean);
  if (ids.some((id) => !OBJECT_ID.test(id))) return helpers.error('string.employeeIds');
  return ids.join(',');
}).messages({ 'string.employeeIds': '{{#label}} must be a comma-separated list of ids' });

export const calendarQuerySchema = {
  query: Joi.object({
    startDate: Joi.date().iso().required(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')).required(),
    employeeIds: employeeIdList,
    // The calendar's team filter sends the department *name* (User.department);
    // an id (preferred department) is accepted too.
    teamId: Joi.string().trim().max(100).allow(null, ''),
    type: Joi.string().valid(...ASSIGNMENT_TYPES).allow(''),
    status: Joi.string().valid(...ASSIGNMENT_STATUSES).allow(''),
    view: Joi.string().valid('DAY', 'WEEK', 'MONTH'),
  }).custom((value, helpers) => {
    const days = (new Date(value.endDate) - new Date(value.startDate)) / 86400000;
    if (days > MAX_CALENDAR_RANGE_DAYS) return helpers.error('object.calendarRange');
    return value;
  }).messages({ 'object.calendarRange': `The calendar range may span at most ${MAX_CALENDAR_RANGE_DAYS} days` }),
};
