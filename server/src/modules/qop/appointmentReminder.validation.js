import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

const REMINDER_STATUSES = ['PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'RESPONDED'];
const CHANNELS = ['whatsapp', 'email', 'both'];
const LANGUAGES = ['de', 'fr', 'it', 'en'];
const CUSTOMER_RESPONSES = ['confirmed', 'reschedule'];

export const listSchema = {
  query: Joi.object({
    appointmentId: objectId,
    customerId: objectId,
    status: Joi.string().valid(...REMINDER_STATUSES),
  }),
};

export const createSchema = {
  body: Joi.object({
    appointmentId: objectId.required(),
    customerId: objectId.required(),
    channel: Joi.string().valid(...CHANNELS).default('email'),
    language: Joi.string().valid(...LANGUAGES).default('de'),
    scheduledAt: Joi.date().iso().required(),
  }),
};

export const getByIdSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const updateStatusSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    status: Joi.string().valid(...REMINDER_STATUSES).required(),
    customerResponse: Joi.string().valid(...CUSTOMER_RESPONSES).allow(null).default(null),
  }),
};
