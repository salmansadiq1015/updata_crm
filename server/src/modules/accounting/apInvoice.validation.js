import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

const AP_STATUSES = ['RECORDED', 'APPROVED', 'PAID', 'PARTIALLY_PAID', 'DISPUTED', 'CANCELLED'];
const CURRENCIES = ['CHF', 'EUR'];

const lineItemSchema = Joi.object({
  position: Joi.number().integer(),
  description: Joi.string().required().trim().max(1000),
  quantity: Joi.number().min(0),
  unit: Joi.string().trim().max(20),
  unitPrice: Joi.number().min(0),
  vatRate: Joi.number().min(0),
  accountId: objectId.allow(null),
  costCenter: Joi.string().trim().max(50).allow('', null),
});

export const createApSchema = {
  body: Joi.object({
    supplierId: objectId.required(),
    supplierName: Joi.string().required().trim().max(255),
    supplierInvoiceNumber: Joi.string().required().trim().max(50),
    invoiceDate: Joi.date().iso().required(),
    dueDate: Joi.date().iso().required(),
    paymentTermsDays: Joi.number().integer().min(0),
    lineItems: Joi.array().items(lineItemSchema).min(1).required(),
    currency: Joi.string().valid(...CURRENCIES),
    projectReference: Joi.string().trim().max(100).allow('', null),
    orderReference: Joi.string().trim().max(100).allow('', null),
    documentId: objectId.allow(null),
  }),
};

export const updateApSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    supplierName: Joi.string().trim().max(255),
    supplierInvoiceNumber: Joi.string().trim().max(50),
    invoiceDate: Joi.date().iso(),
    dueDate: Joi.date().iso(),
    paymentTermsDays: Joi.number().integer().min(0),
    lineItems: Joi.array().items(lineItemSchema).min(1),
    currency: Joi.string().valid(...CURRENCIES),
    projectReference: Joi.string().trim().max(100).allow('', null),
    orderReference: Joi.string().trim().max(100).allow('', null),
    documentId: objectId.allow(null),
    version: Joi.number().integer().required(),
  }).min(1),
};

export const approveApSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const disputeApSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    reason: Joi.string().required().trim().max(500),
  }),
};

export const listApSchema = {
  query: cursorPagination.keys({
    status: Joi.string().valid(...AP_STATUSES),
    supplierId: objectId,
    dueDateFrom: Joi.date().iso(),
    dueDateTo: Joi.date().iso(),
  }),
};

export const createBatchSchema = {
  body: Joi.object({
    invoiceIds: Joi.array().items(objectId).min(1).required(),
    bankAccountId: objectId.required(),
  }),
};

export const batchIdParamSchema = {
  params: Joi.object({ batchId: objectId.required() }),
};

export const apIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};
