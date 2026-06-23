import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

const PLATFORMS = ['IOS', 'ANDROID'];
const NOTIFICATION_CHANNELS = ['PUSH', 'EMAIL', 'WHATSAPP', 'SMS', 'IN_APP'];

export const registerDeviceSchema = {
  body: Joi.object({
    token: Joi.string(),
    deviceToken: Joi.string(),
    platform: Joi.string().uppercase().valid(...PLATFORMS).required(),
    deviceId: Joi.string().allow('', null),
    device_id: Joi.string().allow('', null),
    appVersion: Joi.string().allow('', null),
    app_version: Joi.string().allow('', null),
  }).or('token', 'deviceToken'),
};

export const removeDeviceSchema = {
  params: Joi.object({ deviceId: Joi.string().required() }),
};

export const listNotificationsSchema = {
  query: Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(25),
    cursor: Joi.string().isoDate().allow(null, '').optional(),
  }),
};

export const markNotificationReadSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const getPreferencesSchema = {
  query: Joi.object({}),
};

export const updatePreferencesSchema = {
  body: Joi.object({
    preferences: Joi.alternatives().try(
      Joi.array().items(
        Joi.object({
          notificationType: Joi.string().required(),
          channel: Joi.string().valid(...NOTIFICATION_CHANNELS).required(),
          enabled: Joi.boolean().required(),
        }),
      ),
      Joi.object().pattern(Joi.string(), Joi.boolean()),
    ),
    quietHours: Joi.object({
      enabled: Joi.boolean(),
      startTime: Joi.string().max(5),
      endTime: Joi.string().max(5),
      timezone: Joi.string(),
      bypassCritical: Joi.boolean(),
    }),
    quiet_hours: Joi.object({
      enabled: Joi.boolean(),
      start: Joi.string().max(5),
      end: Joi.string().max(5),
      startTime: Joi.string().max(5),
      endTime: Joi.string().max(5),
      timezone: Joi.string(),
      bypassCritical: Joi.boolean(),
    }),
    newAssignment: Joi.boolean(),
    orderChanged: Joi.boolean(),
    chatMessage: Joi.boolean(),
    dailyReminder: Joi.boolean(),
    escalation: Joi.boolean(),
    quietHoursEnabled: Joi.boolean(),
    quietHoursStart: Joi.string().max(5),
    quietHoursEnd: Joi.string().max(5),
  }),
};
