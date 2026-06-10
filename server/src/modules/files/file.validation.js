import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

export const uploadSchema = {
  body: Joi.object({
    module: Joi.string().trim().required(),
    entityType: Joi.string().trim().allow(''),
    entityId: objectId.allow(''),
    bucket: Joi.string().valid('images', 'documents', 'photos', 'general').default('general'),
    folderPath: Joi.string().trim().max(500).allow('').default(''),
    category: Joi.string().trim().max(80).allow('').default('general'),
  }),
};

export const getByIdSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
};

export const listSchema = {
  query: cursorPagination.keys({
    module: Joi.string().trim(),
    entityType: Joi.string().trim(),
    entityId: objectId,
    bucket: Joi.string().valid('images', 'documents', 'photos', 'general'),
    mimeType: Joi.string().trim(),
    uploadedBy: objectId,
    folderPath: Joi.string().trim().max(500).allow(''),
    category: Joi.string().trim().max(80),
    search: Joi.string().trim().max(120).allow(''),
  }),
};

export const organizeSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    module: Joi.string().trim(),
    entityType: Joi.string().trim().allow('', null),
    entityId: objectId.allow('', null),
    bucket: Joi.string().valid('images', 'documents', 'photos', 'general'),
    folderPath: Joi.string().trim().max(500).allow(''),
    category: Joi.string().trim().max(80).allow(''),
  }).min(1),
};

export const listFoldersSchema = {
  query: cursorPagination.keys({
    classification: Joi.string().trim().max(80),
    entityType: Joi.string().trim(),
    entityId: objectId,
    parentPath: Joi.string().trim().max(500).allow(''),
    search: Joi.string().trim().max(120).allow(''),
  }),
};

export const createFolderSchema = {
  body: Joi.object({
    name: Joi.string().trim().min(1).max(120).required(),
    parentPath: Joi.string().trim().max(500).allow('').default(''),
    classification: Joi.string().trim().max(80).allow('').default('general'),
    entityType: Joi.string().trim().allow('', null),
    entityId: objectId.allow('', null),
  }),
};

export const folderIdSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
};

export default {
  uploadSchema,
  getByIdSchema,
  listSchema,
  organizeSchema,
  listFoldersSchema,
  createFolderSchema,
  folderIdSchema,
};
