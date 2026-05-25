import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

const DOCUMENT_TYPES = ['SUPPLIER_INVOICE', 'RECEIPT', 'BANK_STATEMENT', 'AR_INVOICE_PDF', 'OPEN_ITEM_STATEMENT', 'DUNNING_LETTER', 'PAYMENT_CONFIRMATION', 'OTHER'];
const OCR_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'NOT_APPLICABLE'];
const PROCESSING_STATUSES = ['UNPROCESSED', 'IN_REVIEW', 'PROCESSED'];
const LINKED_RECORD_TYPES = ['AR_INVOICE', 'AP_INVOICE', 'AR_PAYMENT', 'PAYMENT_BATCH', 'BANK_STATEMENT', 'BANK_TRANSACTION', 'JOURNAL_ENTRY', 'OTHER'];
const linkedRecordSchema = Joi.object({
  recordType: Joi.string().valid(...LINKED_RECORD_TYPES).required(),
  recordId: objectId.required(),
});

export const uploadDocumentSchema = {
  body: Joi.object({
    documentType: Joi.string().valid(...DOCUMENT_TYPES).required(),
    notes: Joi.string().max(2000).allow('', null),
    projectReference: Joi.string().trim().max(100).allow('', null),
    fullText: Joi.string().max(200000).allow('', null),
    linkedRecords: Joi.array().items(linkedRecordSchema).max(20),
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
    linkedRecordType: Joi.string().valid(...LINKED_RECORD_TYPES),
    linkedRecordId: objectId,
    search: Joi.string().trim().max(200),
  }),
};

export const triggerOcrSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const confirmOcrSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    corrections: Joi.object({
      supplierName: Joi.string().trim().max(200),
      supplierAddress: Joi.string().trim().max(500).allow('', null),
      invoiceNumber: Joi.string().trim().max(50),
      invoiceDate: Joi.date().iso().allow(null),
      dueDate: Joi.date().iso().allow(null),
      total: Joi.number().min(0),
      vat: Joi.number().min(0),
      lineItems: Joi.array().items(Joi.object()).default([]),
      matchedSupplierId: objectId.allow(null),
    }).min(1).required(),
  }),
};

export const rejectOcrSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    reason: Joi.string().trim().max(1000).allow('', null),
  }),
};

export const assignSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    userId: objectId.required(),
    note: Joi.string().trim().max(500).allow('', null),
  }),
};

export const bulkAssignSchema = {
  body: Joi.object({
    documentIds: Joi.array().items(objectId).min(1).max(50).required(),
    userId: objectId.required(),
    note: Joi.string().trim().max(500).allow('', null),
  }),
};

const autoAllocationRuleBody = {
  name: Joi.string().trim().max(120).required(),
  documentType: Joi.string().valid(...DOCUMENT_TYPES).allow(null),
  uploaderId: objectId.allow(null),
  projectReference: Joi.string().trim().max(100).allow('', null),
  assignTo: objectId.required(),
  priority: Joi.number().integer().min(0).max(10000),
  isActive: Joi.boolean(),
};

export const createAutoAllocationRuleSchema = {
  body: Joi.object(autoAllocationRuleBody),
};

export const listAutoAllocationRulesSchema = {
  query: Joi.object({
    includeInactive: Joi.boolean(),
  }),
};

export const updateAutoAllocationRuleSchema = {
  params: Joi.object({ ruleId: objectId.required() }),
  body: Joi.object({
    ...autoAllocationRuleBody,
    name: autoAllocationRuleBody.name.optional(),
    assignTo: autoAllocationRuleBody.assignTo.optional(),
  }).min(1),
};

export const bulkDownloadSchema = {
  body: Joi.object({
    documentIds: Joi.array().items(objectId).min(1).max(500).required(),
  }),
};
