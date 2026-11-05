import { CURRENCY_CODES } from '../../shared/data/currencies.js';
import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

export const runReconciliationSchema = {
  body: Joi.object({
    bankAccountId: objectId.required(),
  }),
};

export const unmatchedSchema = {
  query: cursorPagination.keys({
    currency: Joi.string().valid(...CURRENCY_CODES),
    bankAccountId: objectId,
  }),
};

export const reportSchema = {
  query: Joi.object({
    currency: Joi.string().valid(...CURRENCY_CODES),
    bankAccountId: objectId,
    dateFrom: Joi.date().iso(),
    dateTo: Joi.date().iso(),
  }),
};

export const suggestionsSchema = {
  params: Joi.object({
    txId: objectId.required(),
  }),
};

export const matchSchema = {
  body: Joi.object({
    transactionId: objectId.required(),
    invoiceId: objectId.required(),
  }),
};

export const matchApSchema = {
  body: Joi.object({
    transactionId: objectId.required(),
    apInvoiceId: objectId.required(),
  }),
};

export const categorizeSchema = {
  body: Joi.object({
    transactionId: objectId.required(),
    accountId: objectId.required(),
  }),
};
