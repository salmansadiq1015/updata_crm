// server/src/modules/crm/attachment.validation.js
import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

const customerIdParam = Joi.object({ id: objectId.required() });

const attachmentIdParams = Joi.object({
  id: objectId.required(),
  fileId: objectId.required(),
});

export const listAttachmentsSchema = {
  params: customerIdParam,
};

export const uploadAttachmentSchema = {
  params: customerIdParam,
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
  params: customerIdParam,
  body: Joi.object({
    fileIds: Joi.array().items(objectId.required()).min(1).max(50).required(),
  }),
};
