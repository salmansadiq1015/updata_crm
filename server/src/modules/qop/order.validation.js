import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';
import { catalogSnapshotJoi } from '../../shared/validation/catalogSnapshot.schema.js';

const ORDER_STATUSES = ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

const lineItemSchema = Joi.object({
  position: Joi.number().integer().min(1).required(),
  articleNumber: Joi.string().trim().max(50).allow('', null),
  catalogItemId: objectId.allow(null),
  catalogSnapshot: catalogSnapshotJoi,
  description: Joi.string().required().trim().max(1000),
  unit: Joi.string().trim().max(20).default('pcs'),
  quantity: Joi.number().min(0).required(),
  unitPrice: Joi.number().min(0).required(),
  discountPercent: Joi.number().min(0).max(100).default(0),
  vatRate: Joi.number().min(0).required(),
});

export const createOrderSchema = {
  body: Joi.object({
    customerId: objectId.required(),
    customerName: Joi.string().required().trim().max(255),
    contactId: objectId.allow(null),
    projectId: objectId.allow(null),
    departmentId: objectId.allow(null),
    language: Joi.string().valid('de', 'fr', 'it', 'en').default('de'),
    title: Joi.string().trim().max(500).allow('', null),
    lineItems: Joi.array().items(lineItemSchema).default([]),
    currency: Joi.string().valid('CHF', 'EUR').default('CHF'),
    globalDiscountPercent: Joi.number().min(0).max(100).default(0),
    paymentTerms: Joi.string().max(1000).allow('', null),
    notes: Joi.string().max(5000).allow('', null),
    termsAndConditions: Joi.string().max(10000).allow('', null),
    requestedDate: Joi.date().iso().allow(null),
    assignedTeam: Joi.array().items(objectId).default([]),
    specialInstructions: Joi.string().max(5000).allow('', null),
    sourceQuotationId: objectId.allow(null),
    sourceQuotationNumber: Joi.string().allow('', null),
  }),
};

export const updateOrderSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    customerName: Joi.string().trim().max(255),
    contactId: objectId.allow(null),
    projectId: objectId.allow(null),
    departmentId: objectId.allow(null),
    language: Joi.string().valid('de', 'fr', 'it', 'en'),
    title: Joi.string().trim().max(500).allow('', null),
    lineItems: Joi.array().items(lineItemSchema),
    currency: Joi.string().valid('CHF', 'EUR'),
    globalDiscountPercent: Joi.number().min(0).max(100),
    paymentTerms: Joi.string().max(1000).allow('', null),
    notes: Joi.string().max(5000).allow('', null),
    termsAndConditions: Joi.string().max(10000).allow('', null),
    requestedDate: Joi.date().iso().allow(null),
    assignedTeam: Joi.array().items(objectId),
    specialInstructions: Joi.string().max(5000).allow('', null),
    version: Joi.number().integer().required(),
  }).min(1),
};

export const listOrdersSchema = {
  query: cursorPagination.keys({
    status: Joi.string().valid(...ORDER_STATUSES),
    customerId: objectId,
    projectId: objectId,
    sourceQuotationId: objectId,
    departmentId: objectId,
    dateFrom: Joi.date().iso(),
    dateTo: Joi.date().iso(),
    amountMin: Joi.number(),
    amountMax: Joi.number(),
    search: Joi.string().trim().max(100),
  }),
};

export const orderIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const transitionOrderStatusSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    targetStatus: Joi.string().valid(...ORDER_STATUSES).required(),
    reason: Joi.string().max(2000).allow(null).default(null),
  }),
};
