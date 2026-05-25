import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

const AP_STATUSES = ['RECORDED', 'APPROVED', 'PAID', 'PARTIALLY_PAID', 'DISPUTED', 'CANCELLED'];
const CURRENCIES = ['CHF', 'EUR'];
const IBAN_PATTERN = /^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/i;
const BIC_PATTERN = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/i;

const lineAllocationSchema = Joi.object({
  accountId: objectId.required(),
  amount: Joi.number().positive().precision(2).required(),
  costCenter: Joi.string().trim().max(50).allow('', null),
  projectReference: Joi.string().trim().max(100).allow('', null),
  orderReference: Joi.string().trim().max(100).allow('', null),
});

const lineItemSchema = Joi.object({
  position: Joi.number().integer(),
  description: Joi.string().required().trim().max(1000),
  quantity: Joi.number().min(0),
  unit: Joi.string().trim().max(20),
  unitPrice: Joi.number().min(0),
  vatRate: Joi.number().min(0),
  accountId: objectId.allow(null),
  costCenter: Joi.string().trim().max(50).allow('', null),
  allocations: Joi.array().items(lineAllocationSchema).max(10),
});

export const createApSchema = {
  body: Joi.object({
    supplierId: objectId.required(),
    supplierName: Joi.string().required().trim().max(255),
    supplierIban: Joi.string().trim().pattern(IBAN_PATTERN).max(34).allow('', null),
    supplierBic: Joi.string().trim().pattern(BIC_PATTERN).max(11).allow('', null),
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
    supplierIban: Joi.string().trim().pattern(IBAN_PATTERN).max(34).allow('', null),
    supplierBic: Joi.string().trim().pattern(BIC_PATTERN).max(11).allow('', null),
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
