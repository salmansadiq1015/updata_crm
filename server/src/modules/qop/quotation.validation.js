import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';
import { catalogSnapshotJoi } from '../../shared/validation/catalogSnapshot.schema.js';

const QUOTATION_STATUSES = [
  'DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED', 'CONVERTED',
];

const LINE_ITEM_TYPES = ['service', 'material', 'text', 'subtotal', 'optional'];

const lineItemSchema = Joi.object({
  position: Joi.number().integer().required(),
  type: Joi.string().valid(...LINE_ITEM_TYPES).required(),
  catalogItemId: objectId.allow(null),
  catalogSnapshot: catalogSnapshotJoi,
  description: Joi.string().max(2000).required(),
  unit: Joi.string().max(20).allow('', null),
  quantity: Joi.number().min(0),
  unitPrice: Joi.number().min(0),
  discountPercent: Joi.number().min(0).max(100),
  vatRate: Joi.number().valid(0, 2.6, 8.1).required(),
});

export const createQuotationSchema = {
  body: Joi.object({
    customerId: objectId.required(),
    customerName: Joi.string().required().trim().max(255),
    contactId: objectId.allow(null),
    projectId: objectId.allow(null),
    departmentId: objectId.allow(null),
    language: Joi.string().valid('de', 'fr', 'it', 'en'),
    title: Joi.string().max(500).allow(''),
    introduction: Joi.string().max(5000).allow(''),
    validUntil: Joi.date().iso().required(),
    currency: Joi.string().valid('CHF', 'EUR'),
    lineItems: Joi.array().items(lineItemSchema).min(1).max(50),
    globalDiscountPercent: Joi.number().min(0).max(100),
    paymentTerms: Joi.string().max(1000).allow(''),
    notes: Joi.string().max(5000).allow(''),
    termsAndConditions: Joi.string().max(10000).allow(''),
    assignedUserId: objectId.allow(null),
  }),
};

export const updateQuotationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    version: Joi.number().integer().required(),
    customerId: objectId,
    customerName: Joi.string().trim().max(255),
    contactId: objectId.allow(null),
    projectId: objectId.allow(null),
    departmentId: objectId.allow(null),
    language: Joi.string().valid('de', 'fr', 'it', 'en'),
    title: Joi.string().max(500).allow(''),
    introduction: Joi.string().max(5000).allow(''),
    validUntil: Joi.date().iso(),
    currency: Joi.string().valid('CHF', 'EUR'),
    lineItems: Joi.array().items(lineItemSchema).min(1).max(50),
    globalDiscountPercent: Joi.number().min(0).max(100),
    paymentTerms: Joi.string().max(1000).allow(''),
    notes: Joi.string().max(5000).allow(''),
    termsAndConditions: Joi.string().max(10000).allow(''),
    assignedUserId: objectId.allow(null),
  }).min(1),
};

export const listQuotationsSchema = {
  query: cursorPagination.keys({
    status: Joi.string().valid(...QUOTATION_STATUSES),
    customerId: objectId,
    departmentId: Joi.alternatives().try(objectId, Joi.array().items(objectId)),
    assignedUserId: objectId,
    currency: Joi.string().valid('CHF', 'EUR'),
    dateFrom: Joi.date().iso(),
    dateTo: Joi.date().iso(),
    amountMin: Joi.number(),
    amountMax: Joi.number(),
    search: Joi.string().trim().max(100),
  }),
};

export const quotationIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const duplicateSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const transitionStatusSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    targetStatus: Joi.string().valid(...QUOTATION_STATUSES).required(),
    reason: Joi.string().max(2000).allow('', null),
  }),
};

export const sendSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const convertSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    selectedLineItemIds: Joi.array().items(objectId).min(1).optional(),
  }),
};

export const snoozeReminderSchema = {
  params: Joi.object({
    id: objectId.required(),
    remId: objectId.required(),
  }),
  body: Joi.object({
    snoozedUntil: Joi.date().iso().required(),
  }),
};
