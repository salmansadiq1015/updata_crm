import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];

export const createAccountSchema = {
  body: Joi.object({
    accountNumber: Joi.string().required().trim().max(10),
    name: Joi.string().required().trim().max(200),
    type: Joi.string().valid(...ACCOUNT_TYPES).required(),
    parentId: objectId.allow(null),
    isGroup: Joi.boolean(),
    defaultVatRate: Joi.number().allow(null),
    description: Joi.string().max(500).allow('', null),
  }),
};

export const updateAccountSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    accountNumber: Joi.string().trim().max(10),
    name: Joi.string().trim().max(200),
    type: Joi.string().valid(...ACCOUNT_TYPES),
    parentId: objectId.allow(null),
    isGroup: Joi.boolean(),
    isActive: Joi.boolean(),
    defaultVatRate: Joi.number().allow(null),
    description: Joi.string().max(500).allow('', null),
  }).min(1),
};

export const listAccountsSchema = {
  query: cursorPagination.keys({
    type: Joi.string().valid(...ACCOUNT_TYPES),
    isActive: Joi.boolean(),
    parentId: objectId,
  }),
};

export const accountIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const balanceQuerySchema = {
  params: Joi.object({ id: objectId.required() }),
  query: Joi.object({
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso(),
  }),
};

export const overviewQuerySchema = {
  params: Joi.object({ id: objectId.required() }),
  query: Joi.object({
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso(),
    limit: Joi.number().integer().min(1).max(10000).default(10000),
  }),
};
