import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

const INVOICE_STATUSES = ['DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'];
const INVOICE_TYPES = ['STANDARD', 'ADVANCE', 'FINAL', 'CREDIT_NOTE'];
const PAYMENT_METHODS = ['bank_transfer', 'cash', 'card', 'other'];

const lineItemSchema = Joi.object({
  position: Joi.number().integer().min(1).required(),
  articleNumber: Joi.string().trim().max(50).allow('', null),
  description: Joi.string().required().trim().max(1000),
  unit: Joi.string().trim().max(20).default('pcs'),
  quantity: Joi.number().min(0).required(),
  unitPrice: Joi.number().min(0).required(),
  discountPercent: Joi.number().min(0).max(100).default(0),
  vatRate: Joi.number().min(0).required(),
});

export const createInvoiceSchema = {
  body: Joi.object({
    invoiceType: Joi.string().valid(...INVOICE_TYPES).default('STANDARD'),
    sourceOrderId: objectId.allow(null),
    sourceQuotationId: objectId.allow(null),
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
    dueDate: Joi.date().iso().required(),
    paymentTermsDays: Joi.number().integer().min(0).default(30),
    paymentTermsText: Joi.string().max(1000).allow('', null),
  }),
};

export const createAdvanceSchema = {
  body: Joi.object({
    sourceOrderId: objectId.required(),
    milestonePercent: Joi.number().min(1).max(100).required(),
    milestoneDescription: Joi.string().required().trim().max(500),
    title: Joi.string().trim().max(500).allow('', null),
    dueDate: Joi.date().iso().required(),
    paymentTermsDays: Joi.number().integer().min(0).default(30),
    paymentTermsText: Joi.string().max(1000).allow('', null),
  }),
};

export const createFinalSchema = {
  body: Joi.object({
    sourceOrderId: objectId.required(),
    title: Joi.string().trim().max(500).allow('', null),
    lineItems: Joi.array().items(lineItemSchema),
    globalDiscountPercent: Joi.number().min(0).max(100),
    dueDate: Joi.date().iso().required(),
    paymentTermsDays: Joi.number().integer().min(0).default(30),
    paymentTermsText: Joi.string().max(1000).allow('', null),
  }),
};

export const updateInvoiceSchema = {
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
    dueDate: Joi.date().iso(),
    paymentTermsDays: Joi.number().integer().min(0),
    paymentTermsText: Joi.string().max(1000).allow('', null),
    version: Joi.number().integer().required(),
  }).min(1),
};

export const listInvoicesSchema = {
  query: cursorPagination.keys({
    status: Joi.string().valid(...INVOICE_STATUSES),
    invoiceType: Joi.string().valid(...INVOICE_TYPES),
    customerId: objectId,
    sourceOrderId: objectId,
    projectId: objectId,
    search: Joi.string().trim().max(100),
  }),
};

export const invoiceIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const transitionStatusSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    targetStatus: Joi.string().valid(...INVOICE_STATUSES).required(),
    reason: Joi.string().max(2000).allow(null).default(null),
  }),
};

export const finalizeSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const sendSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const recordPaymentSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    date: Joi.date().iso().required(),
    amount: Joi.number().min(0.01).required(),
    reference: Joi.string().max(100).allow('', null),
    method: Joi.string().valid(...PAYMENT_METHODS).default('bank_transfer'),
    note: Joi.string().max(500).allow('', null),
  }),
};
