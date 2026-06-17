import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

const SCOPES = ['GLOBAL', 'MANUFACTURER', 'SUPPLIER', 'CATEGORY', 'PRODUCT_GROUP', 'ARTICLE'];

const targetFields = {
  manufacturerName: Joi.string().trim().max(255).allow('', null),
  supplierId: objectId.allow(null),
  categoryId: objectId.allow(null),
  productGroup: Joi.string().trim().max(100).allow('', null),
  articleId: objectId.allow(null),
};

const markupBody = Joi.object({
  name: Joi.string().trim().max(160).required(),
  scope: Joi.string().valid(...SCOPES).required(),
  priority: Joi.number().integer().min(0).max(100000),
  ...targetFields,
  markupPercent: Joi.number().min(-100).max(1000).allow(null),
  marginPercent: Joi.number().min(-100).max(99.99).allow(null),
  isActive: Joi.boolean(),
  validFrom: Joi.date().iso().allow(null),
  validUntil: Joi.date().iso().allow(null),
}).or('markupPercent', 'marginPercent');

export const createMarkupRuleSchema = { body: markupBody };

export const updateMarkupRuleSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: markupBody.fork(['name', 'scope'], (schema) => schema.optional()).min(1),
};

export const listMarkupRulesSchema = {
  query: cursorPagination.keys({
    q: Joi.string().trim().max(200),
    search: Joi.string().trim().max(200),
    scope: Joi.string().valid(...SCOPES),
    isActive: Joi.boolean(),
    ...targetFields,
  }),
};

export const markupRuleIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const resolveMarkupRuleSchema = {
  body: Joi.object({
    articleId: objectId.allow(null),
    article: Joi.object({
      _id: objectId.allow(null),
      categoryId: objectId.allow(null),
      supplierId: objectId.allow(null),
      manufacturerName: Joi.string().trim().max(255).allow('', null),
      productGroup: Joi.string().trim().max(100).allow('', null),
      purchasePrice: Joi.number().min(0).allow(null),
      salesPrice: Joi.number().min(0).allow(null),
      basePrice: Joi.number().min(0).allow(null),
      markupPercent: Joi.number().min(-100).max(1000).allow(null),
      marginPercent: Joi.number().min(-100).max(99.99).allow(null),
    }).allow(null),
  }).or('articleId', 'article'),
};
