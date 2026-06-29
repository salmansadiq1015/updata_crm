import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';
import {
  RECURRENCE_FREQUENCIES,
  RECURRING_STATUSES,
  RECURRING_TRANSACTION_TYPES,
} from './recurringTransaction.model.js';

const templatePayload = Joi.object().unknown(true).required();

export const listRecurringTransactionsSchema = {
  query: Joi.object({
    status: Joi.string().valid(...RECURRING_STATUSES),
    transactionType: Joi.string().valid(...RECURRING_TRANSACTION_TYPES),
    nextRunFrom: Joi.date().iso(),
    nextRunTo: Joi.date().iso(),
    search: Joi.string().trim().max(120),
    limit: Joi.number().integer().min(1).max(500).default(100),
  }),
};

export const recurringIdSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const createRecurringTransactionSchema = {
  body: Joi.object({
    recurringNumber: Joi.string().trim().uppercase().max(40),
    name: Joi.string().trim().max(180).required(),
    description: Joi.string().trim().max(500).allow('', null),
    transactionType: Joi.string().valid(...RECURRING_TRANSACTION_TYPES).required(),
    frequency: Joi.string().valid(...RECURRENCE_FREQUENCIES).required(),
    interval: Joi.number().integer().min(1).default(1),
    startDate: Joi.date().iso().required(),
    nextRunDate: Joi.date().iso(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')).allow(null),
    maxRuns: Joi.number().integer().min(1).allow(null),
    timezone: Joi.string().trim().max(64).default('UTC'),
    templatePayload,
  }),
};

export const updateRecurringTransactionSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: createRecurringTransactionSchema.body
    .fork(['name', 'transactionType', 'frequency', 'startDate', 'templatePayload'], (schema) => schema.optional())
    .min(1),
};

export const runDueRecurringSchema = {
  body: Joi.object({
    asOfDate: Joi.date().iso(),
    limit: Joi.number().integer().min(1).max(200).default(100),
  }).default({}),
};

export const runOneRecurringSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    runDate: Joi.date().iso(),
  }).default({}),
};

export const recurringRunsSchema = {
  query: Joi.object({
    recurringTransactionId: objectId,
    status: Joi.string().valid('STARTED', 'COMPLETED', 'FAILED', 'SKIPPED'),
    limit: Joi.number().integer().min(1).max(200).default(50),
  }),
};
