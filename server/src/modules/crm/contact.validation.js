import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';
import { PHONE_PATTERN } from './crm.constants.js';

const phone = Joi.string().trim().max(30)
  .pattern(PHONE_PATTERN)
  .messages({ 'string.pattern.base': 'Please enter a valid phone number (e.g., +41 44 123 45 67)' });

export const createContactSchema = {
  body: Joi.object({
    firstName: Joi.string().required().trim().max(100),
    lastName: Joi.string().required().trim().max(100),
    functionTitle: Joi.string().trim().max(100).allow('', null),
    phone: phone.allow('', null),
    mobile: phone.allow('', null),
    email: Joi.string().email().trim().max(255).allow('', null),
    isPrimary: Joi.boolean(),
    notes: Joi.string().max(2000).allow('', null),
  }),
};

export const updateContactSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    firstName: Joi.string().trim().max(100),
    lastName: Joi.string().trim().max(100),
    functionTitle: Joi.string().trim().max(100).allow('', null),
    phone: phone.allow('', null),
    mobile: phone.allow('', null),
    email: Joi.string().email().trim().max(255).allow('', null),
    isPrimary: Joi.boolean(),
    notes: Joi.string().max(2000).allow('', null),
  }).min(1),
};

export const contactIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const customerIdParamSchema = {
  params: Joi.object({ customerId: objectId.required() }),
};

export const searchContactsSchema = {
  query: Joi.object({
    q: Joi.string().required().trim().min(2).max(100),
    limit: Joi.number().integer().min(1).max(50).default(25),
  }),
};

export const contactOverviewQuerySchema = {
  query: Joi.object({
    search: Joi.string().trim().max(100).allow('', null).default(''),
    type: Joi.string().valid('all', 'private', 'business').default('all'),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(25),
  }),
};
