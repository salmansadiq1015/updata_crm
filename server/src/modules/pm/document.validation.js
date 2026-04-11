import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

const DOCUMENT_CATEGORIES = ['PLANS', 'CONTRACTS', 'PHOTOS', 'CORRESPONDENCE', 'REPORTS', 'OTHER'];

export const listDocumentsSchema = {
  params: Joi.object({ id: objectId.required() }),
  query: Joi.object({
    category: Joi.string().valid(...DOCUMENT_CATEGORIES),
  }),
};

export const uploadDocumentSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    category: Joi.string().valid(...DOCUMENT_CATEGORIES).default('OTHER'),
    description: Joi.string().max(2000).allow(null, ''),
  }),
};

export const generateDocumentSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    templateType: Joi.string().required().trim().max(100),
  }),
};

export const documentIdParamSchema = {
  params: Joi.object({ docId: objectId.required() }),
};

export const updateDocumentSchema = {
  params: Joi.object({ docId: objectId.required() }),
  body: Joi.object({
    category: Joi.string().valid(...DOCUMENT_CATEGORIES),
    description: Joi.string().max(2000).allow(null, ''),
  }).min(1),
};
