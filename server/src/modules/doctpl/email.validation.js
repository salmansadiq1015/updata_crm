import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

const LANGUAGES = ['de', 'fr', 'it', 'en'];

export const sendEmailSchema = {
  body: Joi.object({
    to: Joi.array().items(Joi.string().email()).min(1).required(),
    cc: Joi.array().items(Joi.string().email()).default([]),
    bcc: Joi.array().items(Joi.string().email()).default([]),
    subject: Joi.string().max(500).required(),
    bodyHtml: Joi.string().required(),
    bodyText: Joi.string().allow('', null),
    documentId: objectId,
    documentIds: Joi.array().items(objectId).max(10).default([]),
    // Attach already-stored files directly by their FileMetadata id — used to
    // attach uploaded object/project documents without re-uploading them.
    fileAttachments: Joi.array().items(Joi.object({
      fileId: objectId.required(),
      fileName: Joi.string().max(500).required(),
    })).max(20).default([]),
    sourceModule: Joi.string().trim().required(),
    sourceRecordId: objectId.required(),
    senderAddress: Joi.string().email(),
    senderName: Joi.string().max(255),
  }),
};

export const composeEmailSchema = {
  body: Joi.object({
    templateType: Joi.string().trim().required(),
    language: Joi.string().valid(...LANGUAGES).default('de'),
    data: Joi.object().default({}),
    documentId: objectId,
  }),
};

export const emailIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const listEmailsSchema = {
  query: cursorPagination.keys({
    status: Joi.string().valid('QUEUED', 'SENT', 'DELIVERED', 'BOUNCED', 'FAILED'),
    sourceModule: Joi.string().trim(),
    sourceRecordId: objectId,
  }),
};
