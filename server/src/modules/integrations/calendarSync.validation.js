import Joi from 'joi';

const CALENDAR_PROVIDERS = ['google', 'outlook'];

export const connectSchema = {
  body: Joi.object({
    provider: Joi.string().valid(...CALENDAR_PROVIDERS).required(),
  }),
};

export const callbackSchema = {
  query: Joi.object({
    code: Joi.string().required(),
    state: Joi.string(),
    provider: Joi.string().valid(...CALENDAR_PROVIDERS),
  }).or('provider', 'state'),
};

export const disconnectSchema = {
  body: Joi.object({
    provider: Joi.string().valid(...CALENDAR_PROVIDERS).required(),
  }),
};
