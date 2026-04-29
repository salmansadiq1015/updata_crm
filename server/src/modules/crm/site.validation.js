import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';
import { SWISS_CANTONS, SWISS_POSTAL_CODE_PATTERN } from './crm.constants.js';

const swissPostalCode = Joi.string().trim().max(10)
  .pattern(SWISS_POSTAL_CODE_PATTERN)
  .messages({ 'string.pattern.base': 'Swiss postal code must be exactly 4 digits (1000-9999)' });

const canton = Joi.string().trim()
  .valid(...SWISS_CANTONS)
  .messages({ 'any.only': 'Must be a valid Swiss canton code (e.g., ZH, BE, GE)' });

export const createSiteSchema = {
  body: Joi.object({
    name: Joi.string().required().trim().max(255),
    street: Joi.string().trim().max(255).allow('', null),
    postalCode: swissPostalCode.allow('', null),
    city: Joi.string().trim().max(100).allow('', null),
    canton: canton.allow('', null),
    country: Joi.string().trim().max(2).default('CH'),
    floorUnit: Joi.string().trim().max(100).allow('', null),
    accessInstructions: Joi.string().max(2000).allow('', null),
    siteType: Joi.string().valid('residential', 'commercial', 'industrial').default('residential'),
    latitude: Joi.number().min(-90).max(90).allow(null),
    longitude: Joi.number().min(-180).max(180).allow(null),
  }),
};

export const updateSiteSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    name: Joi.string().trim().max(255),
    street: Joi.string().trim().max(255).allow('', null),
    postalCode: swissPostalCode.allow('', null),
    city: Joi.string().trim().max(100).allow('', null),
    canton: canton.allow('', null),
    country: Joi.string().trim().max(2),
    floorUnit: Joi.string().trim().max(100).allow('', null),
    accessInstructions: Joi.string().max(2000).allow('', null),
    siteType: Joi.string().valid('residential', 'commercial', 'industrial'),
    latitude: Joi.number().min(-90).max(90).allow(null),
    longitude: Joi.number().min(-180).max(180).allow(null),
  }).min(1),
};

export const siteIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const customerIdParamSchema = {
  params: Joi.object({ customerId: objectId.required() }),
};

export const listSitesSchema = {
  query: cursorPagination.keys({
    status: Joi.string().valid('active', 'inactive'),
    siteType: Joi.string().valid('residential', 'commercial', 'industrial'),
    canton: canton.allow(''),
    postalCode: swissPostalCode.allow(''),
    customerId: objectId,
    search: Joi.string().trim().max(100),
  }),
};

export const siteActivitySchema = {
  params: Joi.object({ id: objectId.required() }),
  query: cursorPagination.keys({
    eventType: Joi.string().trim().max(100),
  }),
};
