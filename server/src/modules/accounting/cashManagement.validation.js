import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

export const balancesSchema = {
  query: Joi.object({}),
};

export const forecastSchema = {
  query: Joi.object({
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
