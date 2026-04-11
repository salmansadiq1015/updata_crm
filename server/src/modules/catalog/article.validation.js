import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

const ARTICLE_TYPES = ['MATERIAL', 'SERVICE'];
const ARTICLE_SOURCES = ['INTERNAL', 'IGH'];

export const createArticleSchema = {
  body: Joi.object({
    articleNumber: Joi.string().required().trim().max(20),
    name: Joi.string().required().trim().max(300),
    description: Joi.string().max(5000).allow('', null),
    categoryId: objectId.required(),
    type: Joi.string().valid(...ARTICLE_TYPES).required(),
    unitOfMeasure: Joi.string().required().trim().max(10),
    basePrice: Joi.number().min(0).required(),
    currency: Joi.string().trim().max(3),
    supplierReference: Joi.string().trim().max(100).allow('', null),
    ighArticleNumber: Joi.string().trim().max(50).allow('', null),
    source: Joi.string().valid(...ARTICLE_SOURCES),
  }),
};

export const updateArticleSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    version: Joi.number().integer().required(),
    name: Joi.string().trim().max(300),
    description: Joi.string().max(5000).allow('', null),
    categoryId: objectId,
    type: Joi.string().valid(...ARTICLE_TYPES),
    unitOfMeasure: Joi.string().trim().max(10),
    basePrice: Joi.number().min(0),
    currency: Joi.string().trim().max(3),
    supplierReference: Joi.string().trim().max(100).allow('', null),
    ighArticleNumber: Joi.string().trim().max(50).allow('', null),
    source: Joi.string().valid(...ARTICLE_SOURCES),
    status: Joi.string().valid('ACTIVE', 'INACTIVE'),
  }).min(1),
};

export const listArticlesSchema = {
  query: cursorPagination.keys({
    q: Joi.string().trim().max(200),
    categoryId: objectId,
    type: Joi.string().valid(...ARTICLE_TYPES),
    status: Joi.string().valid('ACTIVE', 'INACTIVE'),
    source: Joi.string().valid(...ARTICLE_SOURCES),
    priceMin: Joi.number().min(0),
    priceMax: Joi.number().min(0),
  }),
};

export const articleIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const articleVersionParamSchema = {
  params: Joi.object({
    id: objectId.required(),
    ver: Joi.number().integer().required(),
  }),
};

export const bulkImportSchema = {
  body: Joi.object({
    format: Joi.string().valid('csv', 'json').required(),
  }),
};
