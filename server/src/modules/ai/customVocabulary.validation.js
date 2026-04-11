import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

const VOCABULARY_CATEGORIES = ['EQUIPMENT', 'PART', 'BRAND', 'LOCATION', 'GENERAL'];
const VOCABULARY_SOURCES = ['MANUAL', 'AUTO_SUGGESTED'];
const VOCABULARY_STATUSES = ['ACTIVE', 'PENDING_REVIEW', 'DISABLED'];

export const createVocabularySchema = {
  body: Joi.object({
    term: Joi.string().required().trim().max(255),
    phonetic: Joi.string().trim().max(255),
    category: Joi.string().valid(...VOCABULARY_CATEGORIES).required(),
    language: Joi.string().required().trim().max(5),
    aliases: Joi.array().items(Joi.string()),
    source: Joi.string().valid(...VOCABULARY_SOURCES),
  }),
};

export const updateVocabularySchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    term: Joi.string().trim().max(255),
    phonetic: Joi.string().trim().max(255),
    category: Joi.string().valid(...VOCABULARY_CATEGORIES),
    language: Joi.string().trim().max(5),
    aliases: Joi.array().items(Joi.string()),
    source: Joi.string().valid(...VOCABULARY_SOURCES),
    status: Joi.string().valid(...VOCABULARY_STATUSES),
  }).min(1),
};

export const vocabularyIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const listVocabularySchema = {
  query: cursorPagination.keys({
    language: Joi.string(),
    category: Joi.string().valid(...VOCABULARY_CATEGORIES),
    status: Joi.string().valid(...VOCABULARY_STATUSES),
    source: Joi.string().valid(...VOCABULARY_SOURCES),
  }),
};
