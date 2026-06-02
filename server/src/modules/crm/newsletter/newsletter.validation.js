import Joi from 'joi';
import { objectId, cursorPagination } from '../../../shared/validation/commonSchemas.js';

/**
 * Structured recipient filter (CRM-013 AC-2).
 *
 * Only fields backed by the Customer model are accepted; unknown keys are
 * stripped by the validate() middleware to prevent NoSQL-injection via the
 * recipient query. Note: "installation type" filtering is NOT supported —
 * the Customer model has no installation-type field.
 */
const recipientFilterSchema = Joi.object({
  type: Joi.string().valid('private', 'business'),
  canton: Joi.string().trim().max(2),
  city: Joi.string().trim().max(100),
  optInOnly: Joi.boolean().default(true),
});

export const createNewsletterSchema = {
  body: Joi.object({
    subject: Joi.string().required().trim().max(255),
    bodyHtml: Joi.string().required(),
    bodyText: Joi.string().allow('', null),
    channels: Joi.array().items(Joi.string().valid('email')).default(['email']),
    recipientFilter: recipientFilterSchema.default({ optInOnly: true }),
  }),
};

export const updateNewsletterSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    subject: Joi.string().trim().max(255),
    bodyHtml: Joi.string(),
    bodyText: Joi.string().allow('', null),
    channels: Joi.array().items(Joi.string().valid('email')),
    recipientFilter: recipientFilterSchema,
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
    recipientFilter: recipientFilterSchema.default({ optInOnly: true }),
  }),
};

// Public unsubscribe endpoint (CRM-013 AC-10, nDSG) — unauthenticated.
export const unsubscribeSchema = {
  query: Joi.object({
    customerId: objectId.required(),
    token: Joi.string().hex().required(),
  }),
};
