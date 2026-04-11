import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

const DOCUMENT_TYPES = ['SUPPLIER_INVOICE', 'RECEIPT', 'BANK_STATEMENT', 'AR_INVOICE_PDF', 'PAYMENT_CONFIRMATION', 'OTHER'];
const OCR_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'NOT_APPLICABLE'];
const PROCESSING_STATUSES = ['UNPROCESSED', 'IN_REVIEW', 'PROCESSED'];

export const uploadDocumentSchema = {
  body: Joi.object({
    documentType: Joi.string().valid(...DOCUMENT_TYPES).required(),
    notes: Joi.string().max(2000).allow('', null),
    projectReference: Joi.string().trim().max(100).allow('', null),
  }),
};

export const documentIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const listDocumentsSchema = {
  query: cursorPagination.keys({
    documentType: Joi.string().valid(...DOCUMENT_TYPES),
    ocrStatus: Joi.string().valid(...OCR_STATUSES),
    assignedTo: objectId,
    processingStatus: Joi.string().valid(...PROCESSING_STATUSES),
  }),
};

export const triggerOcrSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const confirmOcrSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    corrections: Joi.object().required(),
  }),
};

export const assignSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    userId: objectId.required(),
  }),
};

export const bulkAssignSchema = {
  body: Joi.object({
    documentIds: Joi.array().items(objectId).min(1).max(50).required(),
    userId: objectId.required(),
  }),
};
