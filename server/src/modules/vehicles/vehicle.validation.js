import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';
import { VEHICLE_STATUSES, VEHICLE_FUEL_TYPES } from './vehicle.model.js';
import { VEHICLE_NOTE_CATEGORIES } from './vehicleNote.model.js';

const vehicleBody = {
  kennzeichen: Joi.string().trim().max(30),
  label: Joi.string().trim().max(120).allow('', null),
  make: Joi.string().trim().max(80).allow('', null),
  model: Joi.string().trim().max(120).allow('', null),
  vin: Joi.string().trim().max(40).allow('', null),
  fuelType: Joi.string().valid(...VEHICLE_FUEL_TYPES),
  year: Joi.number().integer().min(1950).max(2100).allow(null),
  mileageKm: Joi.number().min(0).allow(null),
  status: Joi.string().valid(...VEHICLE_STATUSES),
  currentDriverId: objectId.allow(null),
  nextServiceDate: Joi.date().iso().allow(null),
  nextServiceKm: Joi.number().min(0).allow(null),
};

export const listVehiclesSchema = {
  query: Joi.object({
    search: Joi.string().trim().max(200).allow(''),
    status: Joi.string().valid('all', ...VEHICLE_STATUSES),
  }),
};

export const vehicleIdParamSchema = { params: Joi.object({ id: objectId.required() }) };

export const createVehicleSchema = {
  body: Joi.object({ ...vehicleBody, kennzeichen: Joi.string().trim().max(30).required() }),
};

export const updateVehicleSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object(vehicleBody).min(1),
};

export const assignDriverSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({ driverId: objectId.allow(null) }),
};

export const createServiceSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    date: Joi.date().iso().required(),
    mileageKm: Joi.number().min(0).allow(null),
    description: Joi.string().trim().max(1000).required(),
    garage: Joi.string().trim().max(255).allow('', null),
    cost: Joi.number().min(0).allow(null),
  }),
};

export const createMaterialSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    name: Joi.string().trim().max(255).required(),
    quantity: Joi.number().min(0).default(1),
    unit: Joi.string().trim().max(20).allow('', null),
    note: Joi.string().trim().max(500).allow('', null),
  }),
};

export const createNoteSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    body: Joi.string().trim().max(5000).required(),
    category: Joi.string().valid(...VEHICLE_NOTE_CATEGORIES).default('general'),
  }),
};

export const subResourceParamSchema = {
  params: Joi.object({ id: objectId.required(), subId: objectId.required() }),
};
