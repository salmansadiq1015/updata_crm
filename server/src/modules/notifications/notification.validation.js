import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

const NOTIFICATION_CATEGORIES = ['TASK', 'ORDER', 'CHAT', 'SYSTEM', 'FINANCE', 'MAINTENANCE', 'DOCUMENT', 'CRM', 'PROJECT', 'SCHEDULING'];
const NOTIFICATION_CHANNELS = ['PUSH', 'EMAIL', 'WHATSAPP', 'SMS', 'IN_APP'];
const NOTIFICATION_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'];

export const createNotificationSchema = {
  body: Joi.object({
    type: Joi.string().required().trim(),
    category: Joi.string().valid(...NOTIFICATION_CATEGORIES).required(),
    priority: Joi.string().valid(...NOTIFICATION_PRIORITIES),
    channels: Joi.array().items(Joi.string().valid(...NOTIFICATION_CHANNELS)).min(1).required(),
    recipientIds: Joi.array().items(objectId.required()).min(1).required(),
    payload: Joi.object(),
    idempotencyKey: Joi.string().max(200),
    sourceModule: Joi.string(),
    sourceEvent: Joi.string(),
    sourceEntityType: Joi.string(),
    sourceEntityId: objectId,
  }),
};

export const notificationIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const searchNotificationsSchema = {
  query: cursorPagination.keys({
    type: Joi.string(),
    category: Joi.string(),
    status: Joi.string(),
    sourceModule: Joi.string(),
    sourceEntityType: Joi.string(),
    sourceEntityId: objectId,
    recipientId: objectId,
    dateFrom: Joi.date().iso(),
    dateTo: Joi.date().iso(),
  }),
};

export const searchNotificationHistorySchema = {
  query: cursorPagination.keys({
    type: Joi.string(),
    category: Joi.string(),
    channel: Joi.string().valid(...NOTIFICATION_CHANNELS),
    deliveryStatus: Joi.string(),
    notificationStatus: Joi.string(),
    sourceModule: Joi.string(),
    sourceEntityType: Joi.string(),
    sourceEntityId: objectId,
    recipientId: objectId,
    search: Joi.string().trim().max(100).allow(''),
    dateFrom: Joi.date().iso(),
    dateTo: Joi.date().iso(),
  }),
};

export const anonymizeNotificationHistorySchema = {
  body: Joi.object({
    recipientId: objectId,
    email: Joi.string().email(),
    phone: Joi.string().max(40),
  }).or('recipientId', 'email', 'phone'),
};

export const flagStaleDeliveriesSchema = {
  body: Joi.object({
    olderThanMinutes: Joi.number().integer().min(1).max(1440).default(60),
    channels: Joi.array().items(Joi.string().valid(...NOTIFICATION_CHANNELS)).min(1),
  }),
};
