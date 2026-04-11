import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

const CURRENCIES = ['CHF', 'EUR'];
const CONNECTION_TYPES = ['MANUAL', 'EBICS', 'SFTP'];
const RECONCILIATION_STATUSES = ['UNMATCHED', 'AUTO_MATCHED', 'MANUALLY_MATCHED', 'CATEGORIZED'];

export const createBankAccountSchema = {
  body: Joi.object({
    name: Joi.string().required().trim().max(100),
    iban: Joi.string().required().trim().max(34),
    bic: Joi.string().trim().max(11).allow('', null),
    bankName: Joi.string().trim().max(200).allow('', null),
    currency: Joi.string().valid(...CURRENCIES),
    connectionType: Joi.string().valid(...CONNECTION_TYPES),
    autoRetrieveEnabled: Joi.boolean(),
    autoRetrieveSchedule: Joi.string().trim().max(50).allow('', null),
  }),
};

export const updateBankAccountSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    name: Joi.string().trim().max(100),
    iban: Joi.string().trim().max(34),
    bic: Joi.string().trim().max(11).allow('', null),
    bankName: Joi.string().trim().max(200).allow('', null),
    currency: Joi.string().valid(...CURRENCIES),
    connectionType: Joi.string().valid(...CONNECTION_TYPES),
    autoRetrieveEnabled: Joi.boolean(),
    autoRetrieveSchedule: Joi.string().trim().max(50).allow('', null),
    status: Joi.string().valid('ACTIVE', 'INACTIVE'),
  }).min(1),
};

export const listBankAccountsSchema = {
  query: Joi.object({}),
};

export const importStatementSchema = {
  params: Joi.object({ bankAccountId: objectId.required() }),
};

export const listTransactionsSchema = {
  query: cursorPagination.keys({
    bankAccountId: objectId,
    transactionDateFrom: Joi.date().iso(),
    transactionDateTo: Joi.date().iso(),
    reconciliationStatus: Joi.string().valid(...RECONCILIATION_STATUSES),
  }),
};

export const transactionIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const bankAccountIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};
