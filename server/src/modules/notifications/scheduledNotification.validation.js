import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

const NOTIFICATION_CHANNELS = ['PUSH', 'EMAIL', 'WHATSAPP', 'SMS', 'IN_APP'];
const NOTIFICATION_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'];

export const createScheduledSchema = {
  body: Joi.object({
    notificationType: Joi.string().required().trim(),
    category: Joi.string(),
    scheduleType: Joi.string().valid('ONE_TIME', 'RECURRING').required(),
    scheduledAt: Joi.date().iso().when('scheduleType', {
      is: 'ONE_TIME',
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),
    cronExpression: Joi.string().when('scheduleType', {
      is: 'RECURRING',
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),
    timezone: Joi.string().default('Europe/Zurich'),
    endDate: Joi.date().iso(),
    recipientIds: Joi.array().items(objectId),
    recipientQuery: Joi.object(),
    channels: Joi.array().items(Joi.string().valid(...NOTIFICATION_CHANNELS)).min(1).required(),
    payload: Joi.object(),
    priority: Joi.string().valid(...NOTIFICATION_PRIORITIES),
  }),
};

export const updateScheduledSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    notificationType: Joi.string().trim(),
    category: Joi.string(),
    scheduleType: Joi.string().valid('ONE_TIME', 'RECURRING'),
    scheduledAt: Joi.date().iso(),
    cronExpression: Joi.string(),
    timezone: Joi.string(),
    endDate: Joi.date().iso(),
    recipientIds: Joi.array().items(objectId),
    recipientQuery: Joi.object(),
    channels: Joi.array().items(Joi.string().valid(...NOTIFICATION_CHANNELS)).min(1),
    payload: Joi.object(),
    priority: Joi.string().valid(...NOTIFICATION_PRIORITIES),
  }).min(1),
};

export const scheduledIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const listScheduledSchema = {
  query: cursorPagination.keys({
    status: Joi.string(),
    notificationType: Joi.string(),
    sourceEntityType: Joi.string(),
    sourceEntityId: objectId,
  }),
};
