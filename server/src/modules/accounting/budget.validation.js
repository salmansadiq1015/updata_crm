import { CURRENCY_CODES } from '../../shared/data/currencies.js';
import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';
import { BUDGET_STATUSES } from './budget.model.js';

const currency = Joi.string().trim().uppercase().valid(...CURRENCY_CODES);

const budgetLineSchema = Joi.object({
  accountId: objectId.required(),
  periodStart: Joi.date().iso().required(),
  periodEnd: Joi.date().iso().min(Joi.ref('periodStart')).required(),
  amount: Joi.number().min(0).precision(2).required(),
  notes: Joi.string().trim().max(500).allow('', null),
});

export const listBudgetsSchema = {
  query: Joi.object({
    status: Joi.string().valid(...BUDGET_STATUSES),
    currency,
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso(),
    search: Joi.string().trim().max(120),
    limit: Joi.number().integer().min(1).max(500).default(100),
  }),
};

export const budgetIdSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const createBudgetSchema = {
  body: Joi.object({
    budgetNumber: Joi.string().trim().uppercase().max(40),
    name: Joi.string().trim().max(180).required(),
    description: Joi.string().trim().max(500).allow('', null),
    startDate: Joi.date().iso().required(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')).required(),
    currency: currency.default('CHF'),
    lines: Joi.array().items(budgetLineSchema).default([]),
  }),
};

export const updateBudgetSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: createBudgetSchema.body
    .fork(['name', 'startDate', 'endDate'], (schema) => schema.optional())
    .min(1),
};

export const budgetSummarySchema = {
  query: Joi.object({
    currency,
  }),
};
