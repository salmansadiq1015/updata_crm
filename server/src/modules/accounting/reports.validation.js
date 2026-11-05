import { CURRENCY_CODES } from '../../shared/data/currencies.js';
import Joi from 'joi';
import { cursorPagination, objectId } from '../../shared/validation/commonSchemas.js';
import { REFERENCE_TYPES } from './journalEntry.validation.js';

const currency = Joi.string().trim().uppercase().valid(...CURRENCY_CODES).default('CHF');
const reportScope = {
  currency,
  companyId: objectId,
  branchId: objectId,
};

export const profitLossSchema = {
  query: Joi.object({
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')),
    ...reportScope,
  }),
};

export const balanceSheetSchema = {
  query: Joi.object({
    endDate: Joi.date().iso(),
    ...reportScope,
  }),
};

export const trialBalanceSchema = balanceSheetSchema;

export const cashFlowSchema = {
  query: Joi.object({
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')),
    ...reportScope,
  }),
};

export const generalLedgerSchema = {
  query: cursorPagination.keys({
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')),
    currency,
    accountId: objectId,
    companyId: objectId,
    branchId: objectId,
    referenceType: Joi.string().valid(...REFERENCE_TYPES),
  }),
};
