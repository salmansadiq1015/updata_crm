import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

export const createTextBlockSchema = {
  body: Joi.object({
    title: Joi.string().required().trim().max(300),
    categoryId: objectId.allow(null),
    bodyHtml: Joi.string().required().max(50000),
    price: Joi.number().min(0).allow(null),
    unit: Joi.string().trim().max(10).allow(null),
  }),
};

export const updateTextBlockSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    title: Joi.string().trim().max(300),
    categoryId: objectId.allow(null),
    bodyHtml: Joi.string().max(50000),
    price: Joi.number().min(0).allow(null),
    unit: Joi.string().trim().max(10).allow(null),
    status: Joi.string().valid('ACTIVE', 'INACTIVE'),
  }).min(1),
};

export const listTextBlocksSchema = {
  query: cursorPagination.keys({
    status: Joi.string().valid('ACTIVE', 'INACTIVE'),
    categoryId: objectId,
    q: Joi.string().trim().max(200),
    search: Joi.string().trim().max(200),
  }),
};

export const textBlockIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};
