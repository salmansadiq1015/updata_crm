import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

export const uploadSchema = {
  body: Joi.object({
    module: Joi.string().trim().required(),
    entityType: Joi.string().trim().allow(''),
    entityId: objectId.allow(''),
    bucket: Joi.string().valid('images', 'documents', 'photos', 'general').default('general'),
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
  }),
};

export default { uploadSchema, getByIdSchema, listSchema };
