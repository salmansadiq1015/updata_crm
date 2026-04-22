import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

export const createSiteSchema = {
  body: Joi.object({
    name: Joi.string().required().trim().max(255),
    street: Joi.string().trim().max(255).allow('', null),
    postalCode: Joi.string().trim().max(10).allow('', null),
    city: Joi.string().trim().max(100).allow('', null),
    canton: Joi.string().trim().max(2).allow('', null),
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
    postalCode: Joi.string().trim().max(10).allow('', null),
    city: Joi.string().trim().max(100).allow('', null),
    canton: Joi.string().trim().max(2).allow('', null),
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
    canton: Joi.string().trim().max(2),
    postalCode: Joi.string().trim().max(10),
    customerId: objectId,
    search: Joi.string().trim().max(100),
  }),
};
