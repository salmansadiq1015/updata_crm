import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';
import { ACCOUNTING_ENTITY_STATUSES, ACCOUNTING_ENTITY_TYPES } from './accountingEntity.model.js';

const entityCode = Joi.string().trim().uppercase().pattern(/^[A-Z0-9_-]{2,30}$/);

export const listAccountingEntitiesSchema = {
  query: Joi.object({
    type: Joi.string().valid(...ACCOUNTING_ENTITY_TYPES),
    status: Joi.string().valid(...ACCOUNTING_ENTITY_STATUSES),
    parentId: objectId,
    q: Joi.string().trim().max(80),
  }),
};

export const accountingEntityIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const createAccountingEntitySchema = {
  body: Joi.object({
    entityCode: entityCode.required(),
    name: Joi.string().trim().max(160).required(),
    legalName: Joi.string().trim().max(220).allow('', null),
    type: Joi.string().valid(...ACCOUNTING_ENTITY_TYPES).required(),
    parentId: objectId.allow(null),
    baseCurrency: Joi.string().valid('CHF', 'EUR').default('CHF'),
    taxIdentifier: Joi.string().trim().max(80).allow('', null),
    fiscalYearStartMonth: Joi.number().integer().min(1).max(12).default(1),
    status: Joi.string().valid(...ACCOUNTING_ENTITY_STATUSES).default('ACTIVE'),
  }),
};

export const updateAccountingEntitySchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    entityCode,
    name: Joi.string().trim().max(160),
    legalName: Joi.string().trim().max(220).allow('', null),
    parentId: objectId.allow(null),
    baseCurrency: Joi.string().valid('CHF', 'EUR'),
    taxIdentifier: Joi.string().trim().max(80).allow('', null),
    fiscalYearStartMonth: Joi.number().integer().min(1).max(12),
    status: Joi.string().valid(...ACCOUNTING_ENTITY_STATUSES),
  }).min(1),
};

export const accountingEntityStatusSchema = {
  params: Joi.object({ id: objectId.required() }),
};
