import Joi from 'joi';

const NOTIFICATION_CHANNELS = ['PUSH', 'EMAIL', 'WHATSAPP', 'SMS', 'IN_APP'];

export const updatePreferencesSchema = {
  body: Joi.object({
    preferences: Joi.array().items(
      Joi.object({
        notificationType: Joi.string().required(),
        channel: Joi.string().valid(...NOTIFICATION_CHANNELS).required(),
        enabled: Joi.boolean().required(),
      }),
    ),
    quietHours: Joi.object({
      enabled: Joi.boolean(),
      startTime: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/).messages({
        'string.pattern.base': 'startTime must be in HH:MM format',
      }),
      endTime: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/).messages({
        'string.pattern.base': 'endTime must be in HH:MM format',
      }),
      timezone: Joi.string(),
      bypassCritical: Joi.boolean(),
    }),
  }),
};
