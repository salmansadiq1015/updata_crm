import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

export const createInstallationSchema = {
  body: Joi.object({
    type: Joi.string().valid('boiler', 'heat_pump', 'solar_thermal', 'radiator_system', 'ventilation', 'hot_water', 'other').required(),
    manufacturer: Joi.string().trim().max(100).allow('', null),
    model: Joi.string().trim().max(100).allow('', null),
    serialNumber: Joi.string().trim().max(100).allow('', null),
    commissioningDate: Joi.date().iso().allow(null),
    warrantyEndDate: Joi.date().iso().allow(null),
    powerOutputKw: Joi.number().allow(null),
    fuelType: Joi.string().valid('gas', 'oil', 'electric', 'pellet', 'other').allow(null),
    yearOfManufacture: Joi.number().integer().min(1900).max(2100).allow(null),
    technicalNotes: Joi.string().max(5000).allow('', null),
  }),
};

export const updateInstallationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    type: Joi.string().valid('boiler', 'heat_pump', 'solar_thermal', 'radiator_system', 'ventilation', 'hot_water', 'other'),
    manufacturer: Joi.string().trim().max(100).allow('', null),
    model: Joi.string().trim().max(100).allow('', null),
    serialNumber: Joi.string().trim().max(100).allow('', null),
    commissioningDate: Joi.date().iso().allow(null),
    warrantyEndDate: Joi.date().iso().allow(null),
    powerOutputKw: Joi.number().allow(null),
    fuelType: Joi.string().valid('gas', 'oil', 'electric', 'pellet', 'other').allow(null),
    yearOfManufacture: Joi.number().integer().min(1900).max(2100).allow(null),
    technicalNotes: Joi.string().max(5000).allow('', null),
  }).min(1),
};

export const decommissionSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    reason: Joi.string().required().max(500),
  }),
};

export const installationIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const siteIdParamSchema = {
  params: Joi.object({ siteId: objectId.required() }),
};

export const listInstallationsSchema = {
  query: cursorPagination.keys({
    status: Joi.string().valid('active', 'decommissioned'),
    type: Joi.string().valid('boiler', 'heat_pump', 'solar_thermal', 'radiator_system', 'ventilation', 'hot_water', 'other'),
    fuelType: Joi.string().valid('gas', 'oil', 'electric', 'pellet', 'other'),
    siteId: objectId,
    manufacturer: Joi.string().trim().max(100),
    search: Joi.string().trim().max(100),
  }),
};
