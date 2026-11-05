import { CURRENCY_CODES } from '../../shared/data/currencies.js';
import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

const LINE_ITEM_TYPES = ['service', 'material', 'text', 'subtotal', 'optional'];

const templateLineItemSchema = Joi.object({
  position: Joi.number().integer().required(),
  type: Joi.string().valid(...LINE_ITEM_TYPES).required(),
  description: Joi.string().max(2000).required(),
  unit: Joi.string().max(20).allow('', null),
  quantity: Joi.number().min(0),
  unitPrice: Joi.number().min(0),
  discountPercent: Joi.number().min(0).max(100),
  vatRate: Joi.number().valid(0, 2.6, 8.1),
});

export const createTemplateSchema = {
  body: Joi.object({
    name: Joi.string().required().trim().max(200),
    description: Joi.string().max(1000).allow(''),
    category: Joi.string().max(100).allow(''),
    language: Joi.string().valid('de', 'fr', 'it', 'en'),
    currency: Joi.string().trim().uppercase().valid(...CURRENCY_CODES),
    introduction: Joi.string().max(5000).allow(''),
    notes: Joi.string().max(5000).allow(''),
    paymentTerms: Joi.string().max(1000).allow(''),
    termsAndConditions: Joi.string().max(10000).allow(''),
    globalDiscountPercent: Joi.number().min(0).max(100),
    lineItems: Joi.array().items(templateLineItemSchema).max(50),
    isActive: Joi.boolean(),
  }),
};

export const updateTemplateSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    name: Joi.string().trim().max(200),
    description: Joi.string().max(1000).allow(''),
    category: Joi.string().max(100).allow(''),
    language: Joi.string().valid('de', 'fr', 'it', 'en'),
    currency: Joi.string().trim().uppercase().valid(...CURRENCY_CODES),
    introduction: Joi.string().max(5000).allow(''),
    notes: Joi.string().max(5000).allow(''),
    paymentTerms: Joi.string().max(1000).allow(''),
    termsAndConditions: Joi.string().max(10000).allow(''),
    globalDiscountPercent: Joi.number().min(0).max(100),
    lineItems: Joi.array().items(templateLineItemSchema).max(50),
    isActive: Joi.boolean(),
  }).min(1),
};

export const templateIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const listTemplatesSchema = {
  query: Joi.object({
    search: Joi.string().trim().max(100).allow(''),
    category: Joi.string().trim().max(100).allow(''),
    isActive: Joi.boolean().truthy('true').falsy('false'),
    limit: Joi.number().integer().min(1).max(200),
  }),
};
