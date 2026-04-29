import Joi from 'joi';
import { objectId, cursorPagination } from '../../../shared/validation/commonSchemas.js';

export const createNewsletterSchema = {
  body: Joi.object({
    subject: Joi.string().required().trim().max(255),
    bodyHtml: Joi.string().required(),
    bodyText: Joi.string().allow('', null),
    channels: Joi.array().items(Joi.string().valid('email')).default(['email']),
    recipientFilter: Joi.object().default({}),
  }),
};

export const updateNewsletterSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    subject: Joi.string().trim().max(255),
    bodyHtml: Joi.string(),
    bodyText: Joi.string().allow('', null),
    channels: Joi.array().items(Joi.string().valid('email')),
    recipientFilter: Joi.object(),
  }).min(1),
};

export const listNewslettersSchema = {
  query: cursorPagination.keys({
    status: Joi.string().valid('draft', 'scheduled', 'sending', 'sent', 'cancelled'),
    search: Joi.string().trim().max(100),
  }),
};

export const newsletterIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const scheduleNewsletterSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    scheduledAt: Joi.date().iso().required(),
  }),
};

export const countRecipientsSchema = {
  body: Joi.object({
    recipientFilter: Joi.object().default({}),
  }),
};
