import { CURRENCY_CODES } from '../../shared/data/currencies.js';
import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

export const balancesSchema = {
  query: Joi.object({}),
};

export const forecastSchema = {
  query: Joi.object({
    currency: Joi.string().trim().uppercase().valid(...CURRENCY_CODES).default('CHF'),
    days: Joi.number().integer().min(7).max(365).default(90),
  }),
};

export const manualBalanceSchema = {
  body: Joi.object({
    bankAccountId: objectId.required(),
    balance: Joi.number().required(),
    date: Joi.date().iso().required(),
  }),
};
