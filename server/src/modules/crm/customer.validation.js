import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

export const createCustomerSchema = {
  body: Joi.object({
    name: Joi.string().required().trim().max(255),
    type: Joi.string().valid('private', 'business').required(),
    street: Joi.string().trim().max(255).allow('', null),
    postalCode: Joi.string().trim().max(10).allow('', null),
    city: Joi.string().trim().max(100).allow('', null),
    canton: Joi.string().trim().max(2).allow('', null),
    country: Joi.string().trim().max(2).default('CH'),
    phone: Joi.string().trim().max(30).allow('', null),
    mobile: Joi.string().trim().max(30).allow('', null),
    email: Joi.string().email().trim().max(255).allow('', null),
    website: Joi.string().trim().max(255).allow('', null),
    newsletterOptIn: Joi.boolean().default(false),
    newsletterChannel: Joi.string().valid('email', 'whatsapp', 'both').default('email'),
    notes: Joi.string().max(5000).allow('', null),
  }),
};

export const updateCustomerSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    name: Joi.string().trim().max(255),
    type: Joi.string().valid('private', 'business'),
    street: Joi.string().trim().max(255).allow('', null),
    postalCode: Joi.string().trim().max(10).allow('', null),
    city: Joi.string().trim().max(100).allow('', null),
    canton: Joi.string().trim().max(2).allow('', null),
    country: Joi.string().trim().max(2),
    phone: Joi.string().trim().max(30).allow('', null),
    mobile: Joi.string().trim().max(30).allow('', null),
    email: Joi.string().email().trim().max(255).allow('', null),
    website: Joi.string().trim().max(255).allow('', null),
    newsletterOptIn: Joi.boolean(),
    newsletterChannel: Joi.string().valid('email', 'whatsapp', 'both'),
    notes: Joi.string().max(5000).allow('', null),
  }).min(1),
};

export const listCustomersSchema = {
  query: cursorPagination.keys({
    status: Joi.string().valid('active', 'archived'),
    type: Joi.string().valid('private', 'business'),
    postalCode: Joi.string().trim().max(10),
    canton: Joi.string().trim().max(2),
    newsletterOptIn: Joi.string().valid('true', 'false'),
    search: Joi.string().trim().max(100),
  }),
};

export const searchCustomersSchema = {
  query: Joi.object({
    q: Joi.string().required().trim().min(2).max(100),
    limit: Joi.number().integer().min(1).max(50).default(25),
  }),
};

export const duplicateCheckSchema = {
  query: Joi.object({
    name: Joi.string().required().trim().max(255),
    postalCode: Joi.string().trim().max(10).allow('', null),
  }),
};

export const customerIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const mergeCustomersSchema = {
  body: Joi.object({
    sourceId: objectId.required(),
    targetId: objectId.required(),
  }),
};

export const bulkUpdateCustomersSchema = {
  body: Joi.object({
    ids: Joi.array().items(objectId).min(1).max(100).required(),
    data: Joi.object({
      status: Joi.string().valid('active', 'archived'),
      type: Joi.string().valid('private', 'business'),
      newsletterOptIn: Joi.boolean(),
      newsletterChannel: Joi.string().valid('email', 'whatsapp', 'both'),
    }).min(1).required(),
  }),
};

export const bulkDeleteCustomersSchema = {
  body: Joi.object({
    ids: Joi.array().items(objectId).min(1).max(100).required(),
  }),
};

export const exportCustomersSchema = {
  query: Joi.object({
    status: Joi.string().valid('active', 'archived'),
    type: Joi.string().valid('private', 'business'),
    postalCode: Joi.string().trim().max(10),
    canton: Joi.string().trim().max(2),
    newsletterOptIn: Joi.string().valid('true', 'false'),
    search: Joi.string().trim().max(100),
    format: Joi.string().valid('csv').default('csv'),
  }),
};

export const customerActivitySchema = {
  params: Joi.object({ id: objectId.required() }),
  query: cursorPagination.keys({
    eventType: Joi.string().trim().max(100),
  }),
};
