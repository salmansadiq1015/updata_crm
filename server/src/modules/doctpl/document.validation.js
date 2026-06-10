import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

const LANGUAGES = ['de', 'fr', 'it', 'en'];

export const generateSchema = {
  body: Joi.object({
    templateType: Joi.string().trim().required(),
    sourceModule: Joi.string().trim().required(),
    sourceRecordId: objectId.required(),
    data: Joi.object().required(),
    language: Joi.string().valid(...LANGUAGES).default('de'),
  }),
};

export const generateBatchSchema = {
  body: Joi.object({
    items: Joi.array().items(
      Joi.object({
        templateType: Joi.string().trim().required(),
        sourceModule: Joi.string().trim().required(),
        sourceRecordId: objectId.required(),
        data: Joi.object().required(),
        language: Joi.string().valid(...LANGUAGES).default('de'),
      }),
    ).min(1).max(100).required(),
  }),
};

export const documentIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const listDocumentsSchema = {
  query: cursorPagination.keys({
    sourceModule: Joi.string().trim(),
    sourceRecordId: objectId,
    documentType: Joi.string().trim(),
    search: Joi.string().trim().max(120).allow(''),
  }),
};

export const sourceParamSchema = {
  params: Joi.object({
    sourceModule: Joi.string().trim().required(),
    sourceRecordId: objectId.required(),
  }),
};
