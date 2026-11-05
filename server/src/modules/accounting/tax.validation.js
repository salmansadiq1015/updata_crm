import { CURRENCY_CODES } from '../../shared/data/currencies.js';
import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';
import { TAX_DIRECTIONS, TAX_SCOPES, TAX_TYPES } from './taxCode.model.js';
import { TAX_TRANSACTION_DIRECTIONS, TAX_TRANSACTION_SOURCE_TYPES } from './taxTransaction.model.js';

const currency = Joi.string().trim().uppercase().valid(...CURRENCY_CODES);

export const listTaxCodesSchema = {
  query: Joi.object({
    type: Joi.string().valid(...TAX_TYPES),
    direction: Joi.string().valid('INPUT', 'OUTPUT', 'WITHHOLDING'),
    country: Joi.string().trim().uppercase().length(2),
    isActive: Joi.boolean(),
  }),
};

export const createTaxCodeSchema = {
  body: Joi.object({
    code: Joi.string().trim().uppercase().max(40).required(),
    name: Joi.string().trim().max(160).required(),
    type: Joi.string().valid(...TAX_TYPES).default('VAT'),
    direction: Joi.string().valid(...TAX_DIRECTIONS).default('BOTH'),
    scope: Joi.string().valid(...TAX_SCOPES).default('STANDARD'),
    country: Joi.string().trim().uppercase().length(2).default('CH'),
    rate: Joi.number().min(0).max(100).precision(4).required(),
    recoverablePercent: Joi.number().min(0).max(100).precision(2).default(100),
    validFrom: Joi.date().iso().required(),
    validTo: Joi.date().iso().allow(null),
    isActive: Joi.boolean().default(true),
    description: Joi.string().trim().max(500).allow('', null),
  }),
};

export const updateTaxCodeSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: createTaxCodeSchema.body.fork(['code', 'name', 'rate', 'validFrom'], (schema) => schema.optional()).min(1),
};

export const listTaxGroupsSchema = {
  query: Joi.object({
    country: Joi.string().trim().uppercase().length(2),
    isActive: Joi.boolean(),
  }),
};

export const createTaxGroupSchema = {
  body: Joi.object({
    code: Joi.string().trim().uppercase().max(40).required(),
    name: Joi.string().trim().max(160).required(),
    country: Joi.string().trim().uppercase().length(2).default('CH'),
    taxCodes: Joi.array().items(Joi.object({
      taxCodeId: objectId.required(),
      allocationPercent: Joi.number().min(0).max(100).precision(2).default(100),
    })).min(1).required(),
    isActive: Joi.boolean().default(true),
  }),
};

export const listTaxExemptionsSchema = {
  query: Joi.object({
    partyId: objectId,
    isActive: Joi.boolean(),
  }),
};

export const createTaxExemptionSchema = {
  body: Joi.object({
    code: Joi.string().trim().uppercase().max(40).required(),
    name: Joi.string().trim().max(160).required(),
    reason: Joi.string().trim().max(500).required(),
    partyId: objectId.allow(null),
    certificateNumber: Joi.string().trim().max(120).allow('', null),
    validFrom: Joi.date().iso().required(),
    validTo: Joi.date().iso().allow(null),
    isActive: Joi.boolean().default(true),
  }),
};

const calculationLineSchema = Joi.object({
  position: Joi.alternatives().try(Joi.string(), Joi.number().integer()),
  description: Joi.string().trim().max(1000).allow('', null),
  quantity: Joi.number().min(0),
  unitPrice: Joi.number().min(0),
  lineTotal: Joi.number().min(0),
  vatRate: Joi.number().min(0).max(100),
  taxRate: Joi.number().min(0).max(100),
  taxCodeId: objectId.allow(null),
  taxCode: Joi.string().trim().uppercase().max(40),
}).or('lineTotal', 'quantity');

export const calculateTaxSchema = {
  body: Joi.object({
    lineItems: Joi.array().items(calculationLineSchema).min(1).required(),
    documentDate: Joi.date().iso().default(() => new Date()),
    currency: currency.default('CHF'),
    direction: Joi.string().valid('INPUT', 'OUTPUT', 'WITHHOLDING').default('INPUT'),
    exemptionCode: Joi.string().trim().uppercase().max(40).allow('', null),
  }),
};

export const listTaxTransactionsSchema = {
  query: Joi.object({
    sourceType: Joi.string().valid(...TAX_TRANSACTION_SOURCE_TYPES),
    sourceId: objectId,
    direction: Joi.string().valid(...TAX_TRANSACTION_DIRECTIONS),
    taxCode: Joi.string().trim().uppercase().max(40),
    currency,
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso(),
    limit: Joi.number().integer().min(1).max(2000).default(500),
  }),
};

export const taxSummarySchema = {
  query: Joi.object({
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso(),
    currency,
  }),
};
