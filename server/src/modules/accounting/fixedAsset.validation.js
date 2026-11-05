import { CURRENCY_CODES } from '../../shared/data/currencies.js';
import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';
import { FIXED_ASSET_METHODS, FIXED_ASSET_STATUSES } from './fixedAsset.model.js';

const currency = Joi.string().trim().uppercase().valid(...CURRENCY_CODES);

const accountFields = {
  assetAccountId: objectId.allow(null),
  accumulatedDepreciationAccountId: objectId.allow(null),
  depreciationExpenseAccountId: objectId.allow(null),
  disposalGainAccountId: objectId.allow(null),
  disposalLossAccountId: objectId.allow(null),
};

export const listFixedAssetsSchema = {
  query: Joi.object({
    status: Joi.string().valid(...FIXED_ASSET_STATUSES),
    category: Joi.string().trim().max(120),
    currency,
    search: Joi.string().trim().max(120),
    limit: Joi.number().integer().min(1).max(500).default(100),
  }),
};

export const fixedAssetIdSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const createFixedAssetSchema = {
  body: Joi.object({
    assetNumber: Joi.string().trim().uppercase().max(40),
    name: Joi.string().trim().max(180).required(),
    category: Joi.string().trim().max(120).default('Equipment'),
    description: Joi.string().trim().max(500).allow('', null),
    acquisitionDate: Joi.date().iso().required(),
    placedInServiceDate: Joi.date().iso().allow(null),
    currency: currency.default('CHF'),
    acquisitionCost: Joi.number().positive().precision(2).required(),
    salvageValue: Joi.number().min(0).precision(2).default(0),
    usefulLifeMonths: Joi.number().integer().min(1).required(),
    depreciationMethod: Joi.string().valid(...FIXED_ASSET_METHODS).default('STRAIGHT_LINE'),
    ...accountFields,
  }),
};

export const updateFixedAssetSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: createFixedAssetSchema.body
    .fork(['name', 'acquisitionDate', 'acquisitionCost', 'usefulLifeMonths'], (schema) => schema.optional())
    .min(1),
};

export const activateFixedAssetSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    placedInServiceDate: Joi.date().iso(),
  }).default({}),
};

export const depreciateFixedAssetSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    periodDate: Joi.date().iso().default(() => new Date()),
  }).default({}),
};

export const disposeFixedAssetSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    disposalDate: Joi.date().iso().default(() => new Date()),
    proceeds: Joi.number().min(0).precision(2).default(0),
  }),
};

export const fixedAssetSummarySchema = {
  query: Joi.object({
    currency,
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso(),
  }),
};
