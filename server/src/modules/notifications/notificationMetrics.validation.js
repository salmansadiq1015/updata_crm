import Joi from 'joi';

const NOTIFICATION_CHANNELS = ['PUSH', 'EMAIL', 'WHATSAPP', 'SMS', 'IN_APP'];

export const metricsQuerySchema = {
  query: Joi.object({
    period: Joi.string().valid('24h', '7d', '30d').default('24h'),
    channel: Joi.string().valid(...NOTIFICATION_CHANNELS),
  }),
};
