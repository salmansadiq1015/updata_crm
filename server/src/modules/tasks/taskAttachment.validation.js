import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

export const listAttachmentsSchema = {
  params: Joi.object({
    taskId: objectId.required(),
  }),
};

export const uploadAttachmentSchema = {
  params: Joi.object({
    taskId: objectId.required(),
  }),
};

export const downloadAttachmentSchema = {
  params: Joi.object({
    taskId: objectId.required(),
    attachmentId: objectId.required(),
  }),
};

export const deleteAttachmentSchema = {
  params: Joi.object({
    taskId: objectId.required(),
    attachmentId: objectId.required(),
  }),
};
