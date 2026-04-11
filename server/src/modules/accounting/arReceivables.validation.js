import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

export const listReceivablesSchema = {
  query: cursorPagination.keys({
    customerId: objectId,
    status: Joi.string(),
    dueDateFrom: Joi.date().iso(),
    dueDateTo: Joi.date().iso(),
    amountMin: Joi.number().min(0),
    amountMax: Joi.number().min(0),
    overdue: Joi.boolean(),
  }),
};

export const agingSchema = {
  query: Joi.object({}),
};

export const summarySchema = {
  query: Joi.object({}),
};

export const exportSchema = {
  body: Joi.object({
    format: Joi.string().valid('csv', 'pdf').required(),
  }),
};

export const writeOffSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    reason: Joi.string().required().trim().max(500),
  }),
};

export const recordPaymentSchema = {
  body: Joi.object({
    paymentDate: Joi.date().iso().required(),
    amount: Joi.number().min(0.01).required(),
    customerId: objectId.required(),
    paymentReference: Joi.string().trim().max(50).allow('', null),
    bankAccountId: objectId,
    source: Joi.string().valid('MANUAL', 'BANK_IMPORT').required(),
  }),
};

export const allocatePaymentSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    allocations: Joi.array().items(
      Joi.object({
        invoiceId: objectId.required(),
        amount: Joi.number().min(0.01).required(),
      }),
    ).min(1).required(),
  }),
};

export const listPaymentsSchema = {
  query: cursorPagination.keys({
    customerId: objectId,
    source: Joi.string().valid('MANUAL', 'BANK_IMPORT'),
    paymentDateFrom: Joi.date().iso(),
    paymentDateTo: Joi.date().iso(),
  }),
};

export const paymentIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const dunningOverdueSchema = {
  query: cursorPagination.keys({
    customerId: objectId,
  }),
};

export const generateDunningSchema = {
  body: Joi.object({
    invoiceIds: Joi.array().items(objectId).min(1).required(),
    level: Joi.number().integer().min(1).max(3).required(),
  }),
};

export const dunningTemplateSchema = {
  params: Joi.object({ level: Joi.number().integer().min(1).max(3).required() }),
  body: Joi.object({
    subject: Joi.string().trim().max(500),
    bodyHtml: Joi.string().max(50000),
    feeAmount: Joi.number().min(0),
    graceDays: Joi.number().integer().min(0),
  }).min(1),
};
