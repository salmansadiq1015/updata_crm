import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

export const runReconciliationSchema = {
  body: Joi.object({
    bankAccountId: objectId.required(),
  }),
};

export const unmatchedSchema = {
  query: cursorPagination.keys({
    bankAccountId: objectId,
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
