import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

const PLATFORMS = ['IOS', 'ANDROID'];

export const registerDeviceSchema = {
  body: Joi.object({
    deviceToken: Joi.string().required(),
    platform: Joi.string().valid(...PLATFORMS).required(),
    deviceId: Joi.string().allow('', null),
    appVersion: Joi.string().allow('', null),
  }),
};

export const removeDeviceSchema = {
  params: Joi.object({ deviceId: Joi.string().required() }),
};

export const listNotificationsSchema = {
  query: Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(25),
    cursor: objectId,
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
