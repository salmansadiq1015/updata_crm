import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';
import {
  VEHICLE_STATUSES, VEHICLE_FUEL_TYPES, VEHICLE_ASSET_TYPES, VEHICLE_METER_UNITS,
  VEHICLE_TRANSMISSIONS, VEHICLE_OWNERSHIP_TYPES, VEHICLE_SERVICE_TYPES, VEHICLE_COST_TYPES,
} from './vehicle.constants.js';
import { VEHICLE_NOTE_CATEGORIES } from './vehicleNote.model.js';

const text = (max) => Joi.string().trim().max(max).allow('', null);
const optDate = Joi.date().iso().allow(null, '');
const optNum = (max = 1e9) => Joi.number().min(0).max(max).allow(null);
const currency = Joi.string().trim().uppercase().length(3).pattern(/^[A-Z]{3}$/);

const vehicleBody = {
  kennzeichen: Joi.string().trim().min(1).max(30),
  label: text(120),
  fleetNumber: text(40),
  assetType: Joi.string().valid(...VEHICLE_ASSET_TYPES),
  make: text(80),
  model: text(120),
  vin: text(40),
  color: text(40),
  fuelType: Joi.string().valid(...VEHICLE_FUEL_TYPES),
  transmission: Joi.string().valid(...VEHICLE_TRANSMISSIONS).allow(null, ''),
  year: Joi.number().integer().min(1950).max(2100).allow(null),
  seats: Joi.number().integer().min(0).max(200).allow(null),
  payloadKg: optNum(1e6),
  powerKw: optNum(1e5),
  mileageKm: optNum(1e8),
  meterUnit: Joi.string().valid(...VEHICLE_METER_UNITS),
  status: Joi.string().valid(...VEHICLE_STATUSES),
  currentDriverId: objectId.allow(null),
  department: text(120),
  location: text(160),
  costCenter: text(60),
  tags: Joi.array().items(Joi.string().trim().max(40)).max(20),
  ownershipType: Joi.string().valid(...VEHICLE_OWNERSHIP_TYPES),
  purchaseDate: optDate,
  purchasePrice: optNum(1e9),
  provider: text(160),
  contractNumber: text(80),
  contractEnd: optDate,
  monthlyCost: optNum(1e7),
  currency,
  registrationExpiry: optDate,
  inspectionDue: optDate,
  emissionTestDue: optDate,
  insuranceProvider: text(160),
  insurancePolicyNumber: text(80),
  insuranceExpiry: optDate,
  nextServiceDate: optDate,
  nextServiceKm: optNum(1e8),
};

const idParam = Joi.object({ id: objectId.required() });

export const listVehiclesSchema = {
  query: Joi.object({
    search: Joi.string().trim().max(200).allow(''),
    status: Joi.string().valid('all', ...VEHICLE_STATUSES),
    assetType: Joi.string().valid('all', ...VEHICLE_ASSET_TYPES),
    attention: Joi.boolean(),
    driverId: objectId,
    sort: Joi.string().valid('plate', '-plate', 'nextService', 'meter', 'updated', 'created'),
    page: Joi.number().integer().min(1).max(10000),
    limit: Joi.number().integer().min(1).max(200),
  }),
};

export const vehicleIdParamSchema = { params: idParam };

export const createVehicleSchema = {
  body: Joi.object({ ...vehicleBody, kennzeichen: vehicleBody.kennzeichen.required() }),
};

export const updateVehicleSchema = {
  params: idParam,
  body: Joi.object(vehicleBody).min(1),
};

export const assignDriverSchema = {
  params: idParam,
  body: Joi.object({ driverId: objectId.allow(null) }),
};

export const createServiceSchema = {
  params: idParam,
  body: Joi.object({
    type: Joi.string().valid(...VEHICLE_SERVICE_TYPES).default('maintenance'),
    date: Joi.date().iso().required(),
    mileageKm: optNum(1e8),
    description: Joi.string().trim().max(1000).required(),
    garage: text(255),
    cost: optNum(1e8),
    currency,
    invoiceNumber: text(80),
    nextServiceDate: optDate,
    nextServiceKm: optNum(1e8),
  }),
};

export const listCostsSchema = {
  params: idParam,
  query: Joi.object({
    type: Joi.string().valid('all', 'service', ...VEHICLE_COST_TYPES),
    from: Joi.date().iso(),
    to: Joi.date().iso(),
  }),
};

export const createCostSchema = {
  params: idParam,
  body: Joi.object({
    type: Joi.string().valid(...VEHICLE_COST_TYPES).required(),
    date: Joi.date().iso().required(),
    amount: Joi.number().min(0).max(1e8).required(),
    currency,
    quantity: optNum(1e6),
    quantityUnit: Joi.string().valid('l', 'kwh', 'kg', 'gal').allow(null, ''),
    meterReading: optNum(1e8),
    vendor: text(160),
    note: text(500),
  }),
};

export const listBookingsSchema = {
  params: idParam,
  query: Joi.object({ includePast: Joi.boolean() }),
};

export const createBookingSchema = {
  params: idParam,
  body: Joi.object({
    start: Joi.date().iso().required(),
    end: Joi.date().iso().greater(Joi.ref('start')).required(),
    bookedFor: objectId.allow(null),
    purpose: text(300),
    destination: text(200),
  }),
};

export const createMaterialSchema = {
  params: idParam,
  body: Joi.object({
    name: Joi.string().trim().max(255).required(),
    quantity: Joi.number().min(0).default(1),
    unit: text(20),
    note: text(500),
  }),
};

export const createNoteSchema = {
  params: idParam,
  body: Joi.object({
    body: Joi.string().trim().max(5000).required(),
    category: Joi.string().valid(...VEHICLE_NOTE_CATEGORIES).default('general'),
  }),
};

export const subResourceParamSchema = {
  params: Joi.object({ id: objectId.required(), subId: objectId.required() }),
};
