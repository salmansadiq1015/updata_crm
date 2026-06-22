import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

export const listRemindersSchema = {
  params: Joi.object({
    taskId: objectId.required(),
  }),
};

export const createReminderSchema = {
  params: Joi.object({
    taskId: objectId.required(),
  }),
  body: Joi.object({
    type: Joi.string().valid('RELATIVE', 'ABSOLUTE').required(),
    offsetMinutes: Joi.number().integer().when('type', {
      is: 'RELATIVE',
      then: Joi.required(),
      otherwise: Joi.forbidden(),
    }),
    fireAt: Joi.date().iso().when('type', {
      is: 'ABSOLUTE',
      then: Joi.required(),
      otherwise: Joi.forbidden(),
    }),
    channels: Joi.array()
      .items(Joi.string().valid('PUSH', 'IN_APP', 'EMAIL'))
      .min(1)
      .required(),
  }),
};

export const deleteReminderSchema = {
  params: Joi.object({
    taskId: objectId.required(),
    reminderId: objectId.required(),
  }),
};

export const snoozeReminderSchema = {
  params: Joi.object({
    taskId: objectId.required(),
    reminderId: objectId.required(),
  }),
  body: Joi.object({
    snoozeMinutes: Joi.number().integer().min(1).max(10080).required(),
  }),
};

export const setUserDefaultsSchema = {
  body: Joi.object({
    enabled: Joi.boolean(),
    defaultOffsetMinutes: Joi.number().integer(),
    defaultChannels: Joi.array()
      .items(Joi.string().valid('PUSH', 'IN_APP', 'EMAIL'))
      .min(1),
  }),
};
