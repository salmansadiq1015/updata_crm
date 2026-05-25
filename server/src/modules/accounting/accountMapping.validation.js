import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';
import {
  ACCOUNT_MAPPING_SCOPE_TYPES,
  ACCOUNT_MAPPING_TYPES,
} from './accountMapping.model.js';

export const upsertAccountMappingSchema = {
  body: Joi.object({
    mappingType: Joi.string().valid(...ACCOUNT_MAPPING_TYPES).required(),
    scopeType: Joi.string().valid(...ACCOUNT_MAPPING_SCOPE_TYPES).default('GLOBAL'),
    scopeValue: Joi.when('scopeType', {
      is: 'GLOBAL',
      then: Joi.string().allow('', null).default(''),
      otherwise: Joi.string().trim().max(100).required(),
    }),
    accountId: objectId.required(),
    description: Joi.string().trim().max(500).allow('', null),
    isActive: Joi.boolean().default(true),
  }),
};

export const listAccountMappingsSchema = {
  query: Joi.object({
    mappingType: Joi.string().valid(...ACCOUNT_MAPPING_TYPES),
    scopeType: Joi.string().valid(...ACCOUNT_MAPPING_SCOPE_TYPES),
    isActive: Joi.boolean(),
  }),
};

export const resolveAccountMappingSchema = {
  params: Joi.object({
    mappingType: Joi.string().valid(...ACCOUNT_MAPPING_TYPES).required(),
  }),
  query: Joi.object({
    scopeType: Joi.string().valid(...ACCOUNT_MAPPING_SCOPE_TYPES).default('GLOBAL'),
    scopeValue: Joi.string().trim().max(100).allow('', null),
  }),
};
