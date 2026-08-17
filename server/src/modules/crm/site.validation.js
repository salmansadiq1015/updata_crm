import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';
import { SWISS_CANTONS, SWISS_POSTAL_CODE_PATTERN } from './crm.constants.js';

const swissPostalCode = Joi.string().trim().max(10)
  .pattern(SWISS_POSTAL_CODE_PATTERN)
  .messages({ 'string.pattern.base': 'Swiss postal code must be exactly 4 digits (1000-9999)' });

const canton = Joi.string().trim()
  .valid(...SWISS_CANTONS)
  .messages({ 'any.only': 'Must be a valid Swiss canton code (e.g., ZH, BE, GE)' });

// Named party + address block for an object (billing / ownership) — feedback #10.
// Free-form (postal code not forced to the strict Swiss pattern here).
const addressParty = Joi.object({
  name: Joi.string().trim().max(255).allow('', null),
  careOf: Joi.string().trim().max(255).allow('', null),
  street: Joi.string().trim().max(255).allow('', null),
  postalCode: Joi.string().trim().max(10).allow('', null),
  city: Joi.string().trim().max(100).allow('', null),
  canton: canton.allow('', null),
}).allow(null);

// Objektinformationen blocks (client feedback).
const emergencyHeating = Joi.object({
  present: Joi.boolean().default(false),
  number: Joi.string().trim().max(100).allow('', null),
}).allow(null);

const keyBox = Joi.object({
  present: Joi.boolean().default(false),
  code: Joi.string().trim().max(100).allow('', null),
  depositedBy: Joi.string().trim().max(255).allow('', null),
  depositedAt: Joi.date().iso().allow(null),
}).allow(null);

const advertisingBoard = Joi.object({
  count: Joi.number().integer().min(0).allow(null),
  type: Joi.string().trim().max(255).allow('', null),
  location: Joi.string().trim().max(255).allow('', null),
}).allow(null);

export const createSiteSchema = {
  body: Joi.object({
    name: Joi.string().required().trim().max(255),
    street: Joi.string().trim().max(255).required(),
    postalCode: swissPostalCode.required(),
    city: Joi.string().trim().max(100).required(),
    canton: canton.allow('', null),
    country: Joi.string().trim().max(2).default('CH'),
    floorUnit: Joi.string().trim().max(100).allow('', null),
    accessInstructions: Joi.string().max(2000).allow('', null),
    siteType: Joi.string().valid('residential', 'commercial', 'industrial').default('residential'),
    latitude: Joi.number().min(-90).max(90).allow(null),
    longitude: Joi.number().min(-180).max(180).allow(null),
    billingAddress: addressParty,
    ownership: addressParty,
    management: addressParty,
    emergencyHeating,
    keyBox,
    advertisingBoard,
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
    billingAddress: addressParty,
    ownership: addressParty,
    management: addressParty,
    emergencyHeating,
    keyBox,
    advertisingBoard,
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
    type: Joi.string().trim().max(50),
    dateFrom: Joi.date().iso(),
    dateTo: Joi.date().iso(),
    order: Joi.string().valid('asc', 'desc').default('desc'),
  }),
};

export const siteActivityExportSchema = {
  params: Joi.object({ id: objectId.required() }),
  query: Joi.object({
    format: Joi.string().valid('csv', 'pdf').default('csv'),
    type: Joi.string().trim().max(50),
    dateFrom: Joi.date().iso(),
    dateTo: Joi.date().iso(),
    order: Joi.string().valid('asc', 'desc').default('desc'),
  }),
};
