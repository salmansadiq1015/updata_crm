import Joi from 'joi';
import { EXCHANGE_RATE_SOURCES } from './exchangeRate.model.js';

const currency = Joi.string().trim().uppercase().pattern(/^[A-Z]{3}$/).length(3);

export const listExchangeRatesSchema = {
  query: Joi.object({
    baseCurrency: currency,
    quoteCurrency: currency,
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso(),
    limit: Joi.number().integer().min(1).max(500).default(100),
  }),
};

export const upsertExchangeRateSchema = {
  body: Joi.object({
    baseCurrency: currency.required(),
    quoteCurrency: currency.required(),
    rate: Joi.number().positive().precision(10).required(),
    rateDate: Joi.date().iso().required(),
    source: Joi.string().trim().uppercase().valid(...EXCHANGE_RATE_SOURCES).default('MANUAL'),
    note: Joi.string().trim().max(500).allow('', null).default(''),
  }),
};

export const resolveExchangeRateSchema = {
  query: Joi.object({
    baseCurrency: currency.required(),
    quoteCurrency: currency.required(),
    asOfDate: Joi.date().iso(),
  }),
};

export const convertExchangeRateSchema = {
  body: Joi.object({
    amount: Joi.number().min(0).required(),
    fromCurrency: currency.required(),
    toCurrency: currency.required(),
    asOfDate: Joi.date().iso(),
  }),
};

export const fxRevaluationPreviewSchema = {
  query: Joi.object({
    baseCurrency: currency.default('CHF'),
    revaluationDate: Joi.date().iso(),
    sourceTypes: Joi.alternatives().try(
      Joi.array().items(Joi.string().valid('AR_INVOICE', 'AP_BILL')).min(1),
      Joi.string().valid('AR_INVOICE', 'AP_BILL'),
    ),
    limit: Joi.number().integer().min(1).max(1000).default(500),
  }),
};

export const fxRevaluationPostSchema = {
  body: Joi.object({
    baseCurrency: currency.default('CHF'),
    revaluationDate: Joi.date().iso(),
    sourceTypes: Joi.array().items(Joi.string().valid('AR_INVOICE', 'AP_BILL')).min(1).default(['AR_INVOICE', 'AP_BILL']),
    limit: Joi.number().integer().min(1).max(1000).default(500),
  }).default({}),
};

export const fxRevaluationRunsSchema = {
  query: Joi.object({
    baseCurrency: currency,
    status: Joi.string().valid('POSTING', 'POSTED', 'FAILED'),
    limit: Joi.number().integer().min(1).max(200).default(50),
  }),
};
