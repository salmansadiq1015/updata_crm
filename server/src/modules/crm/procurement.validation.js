import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';
import { INVENTORY_MOVEMENT_TYPES } from './inventoryMovement.model.js';
import { PURCHASE_ORDER_STATUSES } from './purchaseOrder.model.js';
import { SWISS_CANTONS, SWISS_POSTAL_CODE_PATTERN, PHONE_PATTERN } from './crm.constants.js';

const swissPostalCode = Joi.string().trim().max(10).pattern(SWISS_POSTAL_CODE_PATTERN).allow('', null);
const canton = Joi.string().trim().valid(...SWISS_CANTONS).allow('', null);
const phone = Joi.string().trim().max(30).pattern(PHONE_PATTERN).allow('', null);

const purchaseOrderItemSchema = Joi.object({
  itemId: objectId,
  sparePartId: objectId.allow(null),
  partNumber: Joi.string().trim().max(100).allow('', null),
  name: Joi.string().trim().max(255).required(),
  quantity: Joi.number().positive().required(),
  receivedQuantity: Joi.number().min(0),
  unitPrice: Joi.number().min(0).allow('', null),
  unit: Joi.string().trim().max(20).default('pcs'),
  supplierPartNumber: Joi.string().trim().max(100).allow('', null),
});

export const supplierIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const listSuppliersSchema = {
  query: cursorPagination.keys({
    search: Joi.string().trim().max(100),
  }),
};

export const searchSuppliersSchema = {
  query: Joi.object({
    q: Joi.string().trim().required().max(100),
    limit: Joi.number().integer().min(1).max(50).default(25),
  }),
};

export const createSupplierSchema = {
  body: Joi.object({
    name: Joi.string().trim().required().max(255),
    ownerName: Joi.string().trim().max(255).allow('', null),
    street: Joi.string().trim().max(255).allow('', null),
    postalCode: swissPostalCode,
    city: Joi.string().trim().max(100).allow('', null),
    canton,
    country: Joi.string().trim().max(2).default('CH'),
    phone,
    email: Joi.string().email().trim().max(255).allow('', null),
    website: Joi.string().uri({ scheme: ['http', 'https'] }).trim().max(255).allow('', null),
    uidNumber: Joi.string().trim().uppercase().max(50).allow('', null),
    vatNumber: Joi.string().trim().uppercase().max(50).allow('', null),
    notes: Joi.string().trim().max(5000).allow('', null),
  }),
};

export const updateSupplierSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: createSupplierSchema.body.fork(['name'], (schema) => schema.optional()).min(1),
};

export const listPurchaseOrdersSchema = {
  query: cursorPagination.keys({
    search: Joi.string().trim().max(100),
    status: Joi.string().valid('open', ...PURCHASE_ORDER_STATUSES),
    supplierId: objectId,
  }),
};

export const purchaseOrderIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const createPurchaseOrderSchema = {
  body: Joi.object({
    supplierId: objectId.allow(null),
    supplierName: Joi.string().trim().max(255).allow('', null),
    status: Joi.string().valid('draft', 'sent').default('sent'),
    expectedDelivery: Joi.date().iso().allow('', null),
    currency: Joi.string().trim().max(3).default('CHF'),
    notes: Joi.string().trim().max(2000).allow('', null),
    items: Joi.array().items(purchaseOrderItemSchema).min(1).max(100).required(),
  }),
};

export const updatePurchaseOrderSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    supplierId: objectId.allow(null),
    supplierName: Joi.string().trim().max(255).allow('', null),
    status: Joi.string().valid('draft', 'sent', 'partial'),
    expectedDelivery: Joi.date().iso().allow('', null),
    currency: Joi.string().trim().max(3),
    notes: Joi.string().trim().max(2000).allow('', null),
    items: Joi.array().items(purchaseOrderItemSchema).min(1).max(100),
  }).min(1),
};

export const receivePurchaseOrderSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    deliveryNoteNumber: Joi.string().trim().max(100).allow('', null),
    notes: Joi.string().trim().max(1000).allow('', null),
    items: Joi.array().items(purchaseOrderItemSchema.keys({
      receivedQuantity: Joi.number().min(0).required(),
    })).min(1).max(100).required(),
  }),
};

export const listInventoryMovementsSchema = {
  query: cursorPagination.keys({
    search: Joi.string().trim().max(100),
    type: Joi.string().valid(...INVENTORY_MOVEMENT_TYPES),
    supplierId: objectId,
    sparePartId: objectId,
  }),
};

export const listPartInventoryMovementsSchema = {
  params: Joi.object({ id: objectId.required() }),
  query: cursorPagination.keys({
    search: Joi.string().trim().max(100),
    type: Joi.string().valid(...INVENTORY_MOVEMENT_TYPES),
    supplierId: objectId,
  }),
};

export const listLowStockSchema = {
  query: cursorPagination.keys({
    search: Joi.string().trim().max(100),
    category: Joi.string().valid('filter', 'gasket', 'pump_part', 'valve', 'sensor', 'igniter', 'burner_part', 'control_board', 'other'),
    supplierId: objectId,
  }),
};

export const adjustStockSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    type: Joi.string().valid('in', 'out', 'correction').required(),
    quantity: Joi.number().positive().required(),
    deliveryNoteNumber: Joi.string().trim().max(100).allow('', null),
    reason: Joi.string().trim().max(1000).allow('', null),
  }),
};

export const deliveryNoteUploadSchema = {
  body: Joi.object({
    supplierId: objectId.allow(null),
    supplierName: Joi.string().trim().max(255).allow('', null),
    deliveryNoteNumber: Joi.string().trim().max(100).allow('', null),
  }),
};

export const deliveryNoteJobIdParamSchema = {
  params: Joi.object({ jobId: objectId.required() }),
};

export const confirmDeliveryNoteOcrSchema = {
  params: Joi.object({ jobId: objectId.required() }),
  body: Joi.object({
    supplierId: objectId.allow(null),
    deliveryNoteNumber: Joi.string().trim().max(100).allow('', null),
    notes: Joi.string().trim().max(1000).allow('', null),
    items: Joi.array().items(Joi.object({
      sparePartId: objectId.allow(null),
      partNumber: Joi.string().trim().max(100).allow('', null),
      name: Joi.string().trim().max(255).allow('', null),
      quantity: Joi.number().positive().required(),
      unit: Joi.string().trim().max(20).default('pcs'),
      confidence: Joi.number().min(0).max(1),
    })).min(1).max(100),
  }),
};
