import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

const CATEGORIES = ['filter', 'gasket', 'pump_part', 'valve', 'sensor', 'igniter', 'burner_part', 'control_board', 'other'];

export const createSparePartSchema = {
  body: Joi.object({
    partNumber: Joi.string().trim().required().max(100),
    name: Joi.string().trim().required().max(255),
    description: Joi.string().max(2000).allow('', null),
    manufacturer: Joi.string().trim().max(255).allow('', null),
    category: Joi.string().valid(...CATEGORIES).required(),
    unitPrice: Joi.number().min(0).allow(null),
    currency: Joi.string().max(3).default('CHF'),
    unit: Joi.string().max(20).default('pcs'),
    minStockLevel: Joi.number().min(0).default(0),
    currentStock: Joi.number().min(0).default(0),
    supplierId: objectId.allow(null),
    supplierPartNumber: Joi.string().max(100).allow('', null),
    compatibleInstallationTypes: Joi.array().items(Joi.string().trim().max(50)).default([]),
    isActive: Joi.boolean().default(true),
  }),
};

export const updateSparePartSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    partNumber: Joi.string().trim().max(100),
    name: Joi.string().trim().max(255),
    description: Joi.string().max(2000).allow('', null),
    manufacturer: Joi.string().trim().max(255).allow('', null),
    category: Joi.string().valid(...CATEGORIES),
    unitPrice: Joi.number().min(0).allow(null),
    currency: Joi.string().max(3),
    unit: Joi.string().max(20),
    minStockLevel: Joi.number().min(0),
    currentStock: Joi.number().min(0),
    supplierId: objectId.allow(null),
    supplierPartNumber: Joi.string().max(100).allow('', null),
    compatibleInstallationTypes: Joi.array().items(Joi.string().trim().max(50)),
    isActive: Joi.boolean(),
  }).min(1),
};

export const sparePartIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const deleteSparePartSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const listSparePartsSchema = {
  query: cursorPagination.keys({
    category: Joi.string().valid(...CATEGORIES),
    isActive: Joi.string().valid('true', 'false'),
    supplierId: objectId,
    manufacturer: Joi.string().trim().max(255),
    search: Joi.string().trim().max(100),
  }),
};

export const searchSparePartsSchema = {
  query: Joi.object({
    q: Joi.string().trim().required().max(100),
    limit: Joi.number().integer().min(1).max(50).default(20),
  }),
};

export const exportSparePartsSchema = {
  query: Joi.object({
    category: Joi.string().valid(...CATEGORIES),
    isActive: Joi.string().valid('true', 'false'),
    supplierId: objectId,
    manufacturer: Joi.string().trim().max(255),
    search: Joi.string().trim().max(100),
    format: Joi.string().valid('csv').default('csv'),
  }),
};

// --- Installation ↔ SparePart linking ---

export const linkSparePartSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    sparePartId: objectId.required(),
    quantity: Joi.number().integer().min(1).default(1),
    lastReplacedDate: Joi.date().iso().allow(null),
    notes: Joi.string().max(1000).allow('', null),
  }),
};

export const unlinkSparePartSchema = {
  params: Joi.object({
    id: objectId.required(),
    sparePartId: objectId.required(),
  }),
};
