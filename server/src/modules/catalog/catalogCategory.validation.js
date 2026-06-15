import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

export const listCategoriesSchema = {
  query: cursorPagination.keys({
    status: Joi.string().valid('ACTIVE', 'INACTIVE'),
    parentId: objectId.allow(null),
    search: Joi.string().trim().max(100),
    q: Joi.string().trim().max(100),
    includeCounts: Joi.boolean().default(true),
  }),
};

export const categoryTreeSchema = {
  query: Joi.object({
    status: Joi.string().valid('ACTIVE', 'INACTIVE'),
    includeCounts: Joi.boolean().default(true),
  }),
};

export const categorySelectOptionsSchema = {
  query: Joi.object({
    includeInactive: Joi.boolean().default(false),
  }),
};

export const categoryIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const createCategorySchema = {
  body: Joi.object({
    code: Joi.string().required().trim().max(50),
    name: Joi.string().required().trim().max(200),
    description: Joi.string().max(2000).allow('', null),
    parentId: objectId.allow(null),
    sortOrder: Joi.number().integer(),
  }),
};

export const updateCategorySchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    code: Joi.string().trim().max(50),
    name: Joi.string().trim().max(200),
    description: Joi.string().max(2000).allow('', null),
    parentId: objectId.allow(null),
    sortOrder: Joi.number().integer(),
    status: Joi.string().valid('ACTIVE', 'INACTIVE'),
  }).min(1),
};

export const moveCategorySchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    newParentId: objectId.required().allow(null),
  }),
};
