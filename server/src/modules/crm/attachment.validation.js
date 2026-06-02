// server/src/modules/crm/attachment.validation.js
import Joi from 'joi';
import { objectId, idParam, cursorPagination } from '../../shared/validation/commonSchemas.js';

const attachmentIdParams = Joi.object({
  id: objectId.required(),
  fileId: objectId.required(),
});

export const listAttachmentsSchema = {
  params: idParam,
  query: cursorPagination,
};

// No body schema — file arrives as multipart/form-data binary (validated by multer, not Joi)
export const uploadAttachmentSchema = {
  params: idParam,
};

export const renameAttachmentSchema = {
  params: attachmentIdParams,
  body: Joi.object({
    originalName: Joi.string().trim().min(1).max(255).required(),
  }),
};

export const deleteAttachmentSchema = {
  params: attachmentIdParams,
};

export const bulkDeleteAttachmentSchema = {
  params: idParam,
  body: Joi.object({
    fileIds: Joi.array().items(objectId.required()).min(1).max(50).required(),
  }),
};
