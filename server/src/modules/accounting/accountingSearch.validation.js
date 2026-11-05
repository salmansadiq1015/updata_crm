import { CURRENCY_CODES } from '../../shared/data/currencies.js';
import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

export const ACCOUNTING_SEARCH_TYPES = [
  'ALL',
  'ACCOUNT',
  'JOURNAL_ENTRY',
  'AR_INVOICE',
  'AP_INVOICE',
  'BANK_TRANSACTION',
  'DOCUMENT',
];

export const accountingSearchSchema = {
  query: Joi.object({
    q: Joi.string().trim().max(200).allow(''),
    type: Joi.string().valid(...ACCOUNTING_SEARCH_TYPES).default('ALL'),
    status: Joi.string().trim().max(60).allow(''),
    accountId: objectId,
    currency: Joi.string().trim().uppercase().valid(...CURRENCY_CODES),
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')),
    minAmount: Joi.number().min(0),
    maxAmount: Joi.number().min(0),
    limit: Joi.number().integer().min(1).max(100).default(25),
  }),
};
