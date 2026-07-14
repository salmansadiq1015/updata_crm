import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';
import { SWISS_CANTONS, SWISS_POSTAL_CODE_PATTERN, PHONE_PATTERN } from './crm.constants.js';

const swissPostalCode = Joi.string().trim().max(10)
  .pattern(SWISS_POSTAL_CODE_PATTERN)
  .messages({ 'string.pattern.base': 'Swiss postal code must be exactly 4 digits (1000-9999)' });

const canton = Joi.string().trim()
  .valid(...SWISS_CANTONS)
  .messages({ 'any.only': 'Must be a valid Swiss canton code (e.g., ZH, BE, GE)' });

const phone = Joi.string().trim().max(30)
  .pattern(PHONE_PATTERN)
  .messages({ 'string.pattern.base': 'Please enter a valid phone number (e.g., +41 44 123 45 67)' });

const taxIdentifier = Joi.string().trim().uppercase().max(50);
const businessRequiredText = (label, max = 255) => Joi.when('type', {
  is: 'business',
  then: Joi.string().trim().max(max).required().messages({ 'any.required': `${label} is required for company customers`, 'string.empty': `${label} is required for company customers` }),
  otherwise: Joi.string().trim().max(max).allow('', null),
});
const businessRequiredTaxIdentifier = Joi.when('type', {
  is: 'business',
  then: taxIdentifier.required().messages({ 'any.required': 'UID number is required for company customers', 'string.empty': 'UID number is required for company customers' }),
  otherwise: taxIdentifier.allow('', null),
});

export const createCustomerSchema = {
  body: Joi.object({
    name: Joi.string().required().trim().max(255),
    type: Joi.string().valid('private', 'business').required(),
    ownerName: businessRequiredText('Owner name'),
    salutation: Joi.string().valid('herr', 'frau', 'familie', 'firma', 'herr_frau', 'frau_herr').allow('', null),
    street: Joi.string().trim().max(255).required(),
    postalCode: swissPostalCode.required(),
    city: Joi.string().trim().max(100).required(),
    canton: canton.allow('', null),
    country: Joi.string().trim().max(2).default('CH'),
    phone: phone.allow('', null),
    mobile: phone.allow('', null),
    email: Joi.string().email().trim().max(255).allow('', null),
    website: Joi.string().uri({ scheme: ['http', 'https'] }).trim().max(255).allow('', null),
    uidNumber: businessRequiredTaxIdentifier,
    vatNumber: taxIdentifier.allow('', null),
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
    ownerName: businessRequiredText('Owner name'),
    salutation: Joi.string().valid('herr', 'frau', 'familie', 'firma', 'herr_frau', 'frau_herr').allow('', null),
    street: Joi.string().trim().max(255).allow('', null),
    postalCode: swissPostalCode.allow('', null),
    city: Joi.string().trim().max(100).allow('', null),
    canton: canton.allow('', null),
    country: Joi.string().trim().max(2),
    phone: phone.allow('', null),
    mobile: phone.allow('', null),
    email: Joi.string().email().trim().max(255).allow('', null),
    website: Joi.string().uri({ scheme: ['http', 'https'] }).trim().max(255).allow('', null),
    uidNumber: businessRequiredTaxIdentifier,
    vatNumber: taxIdentifier.allow('', null),
    newsletterOptIn: Joi.boolean(),
    newsletterChannel: Joi.string().valid('email', 'whatsapp', 'both'),
    notes: Joi.string().max(5000).allow('', null),
  }).min(1),
};

export const listCustomersSchema = {
  query: cursorPagination.keys({
    status: Joi.string().valid('active', 'archived'),
    type: Joi.string().valid('private', 'business'),
    postalCode: swissPostalCode.allow(''),
    canton: canton.allow(''),
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
    postalCode: swissPostalCode.allow('', null),
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
    postalCode: swissPostalCode.allow(''),
    canton: canton.allow(''),
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
