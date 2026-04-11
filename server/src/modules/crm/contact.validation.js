import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

export const createContactSchema = {
  body: Joi.object({
    firstName: Joi.string().required().trim().max(100),
    lastName: Joi.string().required().trim().max(100),
    functionTitle: Joi.string().trim().max(100).allow('', null),
    phone: Joi.string().trim().max(30).allow('', null),
    mobile: Joi.string().trim().max(30).allow('', null),
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
    phone: Joi.string().trim().max(30).allow('', null),
    mobile: Joi.string().trim().max(30).allow('', null),
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
