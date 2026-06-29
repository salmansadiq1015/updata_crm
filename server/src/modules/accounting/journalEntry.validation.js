import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

export const REFERENCE_TYPES = [
  'AR_INVOICE', 'AR_PAYMENT', 'AP_INVOICE', 'AP_PAYMENT',
  'BANK_FEE', 'MANUAL', 'REVERSAL', 'WRITE_OFF',
  'INVOICE_FINALIZED', 'INVOICE_PAYMENT',
  'AUTO_RECONCILIATION', 'MANUAL_RECONCILIATION', 'CATEGORIZATION',
  'NETTING',
  'FIXED_ASSET_ACQUISITION', 'FIXED_ASSET_DEPRECIATION', 'FIXED_ASSET_DISPOSAL',
  'RECURRING_TRANSACTION',
  'FX_REVALUATION',
];

export const createJournalSchema = {
  body: Joi.object({
    entryDate: Joi.date().iso().required(),
    description: Joi.string().required().trim().max(500),
    debitAccountId: objectId.required(),
    creditAccountId: objectId.required(),
    amount: Joi.number().min(0.01).required(),
    currency: Joi.string().valid('CHF', 'EUR'),
    referenceType: Joi.string().valid(...REFERENCE_TYPES).default('MANUAL'),
  }),
};

export const journalIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const listJournalSchema = {
  query: cursorPagination.keys({
    entryDateFrom: Joi.date().iso(),
    entryDateTo: Joi.date().iso(),
    referenceType: Joi.string().valid(...REFERENCE_TYPES),
    accountId: objectId,
  }),
};

export const reverseJournalSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    reason: Joi.string().required().trim().max(500),
  }),
};

export const exportJournalSchema = {
  query: Joi.object({
    startDate: Joi.date().iso().required(),
    endDate: Joi.date().iso().required(),
  }),
};
