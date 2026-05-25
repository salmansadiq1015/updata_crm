import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

const installationPayload = {
  type: Joi.string().valid('boiler', 'heat_pump', 'solar_thermal', 'radiator_system', 'ventilation', 'hot_water', 'other'),
  manufacturer: Joi.string().trim().max(100),
  model: Joi.string().trim().max(100),
  serialNumber: Joi.string().trim().max(100).allow('', null),
  commissioningDate: Joi.date().iso().allow(null),
  warrantyEndDate: Joi.date().iso().allow(null),
  powerOutputKw: Joi.number().allow(null),
  fuelType: Joi.string().valid('gas', 'oil', 'electric', 'pellet', 'other').allow(null),
  yearOfManufacture: Joi.number().integer().min(1900).max(2100).allow(null),
  technicalNotes: Joi.string().max(5000).allow('', null),
};

export const siteInstallationsSchema = {
  params: Joi.object({ siteId: objectId.required() }),
};

export const createSiteInstallationSchema = {
  params: Joi.object({ siteId: objectId.required() }),
  body: Joi.object({
    ...installationPayload,
    type: installationPayload.type.required(),
    manufacturer: installationPayload.manufacturer.required(),
    model: installationPayload.model.required(),
    clientMutationId: Joi.string().trim().max(120).allow('', null),
  }),
};

export const updateInstallationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    ...installationPayload,
    baseUpdatedAt: Joi.date().iso().allow(null),
    clientMutationId: Joi.string().trim().max(120).allow('', null),
  }).min(1),
};

export const installationIdSchema = {
  params: Joi.object({ id: objectId.required() }),
};
