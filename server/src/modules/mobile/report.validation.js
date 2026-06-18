import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';
import { catalogSnapshotJoi } from '../../shared/validation/catalogSnapshot.schema.js';

const CATALOG_SOURCES = ['IGH', 'INTERNAL', 'CUSTOM'];
const REPORT_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'INVOICED'];
const GENERATION_SOURCES = ['MANUAL', 'VOICE', 'TIME_TRACKING', 'TASKS', 'SYNC'];

export const createReportSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    reportDate: Joi.date().iso().required(),
    projectId: objectId.allow(null),
    arrivalTime: Joi.date().iso().allow(null),
    departureTime: Joi.date().iso().allow(null),
    workPerformed: Joi.string().max(5000).required(),
    findings: Joi.string().max(5000).allow('', null),
    nextSteps: Joi.string().max(5000).allow('', null),
    followUpNeeded: Joi.boolean(),
    technicianNotes: Joi.string().max(5000).allow('', null),
    customerSignature: Joi.string().allow('', null),
    customerSignerName: Joi.string().max(255).allow('', null),
    billableMinutes: Joi.number().integer().min(0),
    nonBillableMinutes: Joi.number().integer().min(0),
    billableNotes: Joi.string().max(1000).allow('', null),
    generationSource: Joi.string().valid(...GENERATION_SOURCES),
    sourceSessionId: objectId.allow(null),
    sourceTimeEntryIds: Joi.array().items(objectId).max(100),
    sourceTaskIds: Joi.array().items(objectId).max(100),
    documentIds: Joi.array().items(objectId).max(100),
    materialItems: Joi.array().items(
      Joi.object({
        catalogSource: Joi.string().valid(...CATALOG_SOURCES).required(),
        catalogItemId: Joi.string().max(50).allow('', null),
        catalogSnapshot: catalogSnapshotJoi,
        description: Joi.string().max(300).required(),
        quantity: Joi.number().min(0).required(),
        unit: Joi.string().max(20).required(),
      }),
    ),
  }),
};

export const generateReportSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    generationSource: Joi.string().valid('TIME_TRACKING', 'TASKS').required(),
    reportDate: Joi.date().iso(),
    timeEntryIds: Joi.array().items(objectId).max(100).default([]),
    sourceTaskIds: Joi.array().items(objectId).max(100).default([]),
    taskSummaries: Joi.array().items(Joi.string().trim().max(500)).max(100).default([]),
    workPerformed: Joi.string().max(5000).allow('', null),
    technicianNotes: Joi.string().max(5000).allow('', null),
  }),
};

export const updateReportSchema = {
  params: Joi.object({ reportId: objectId.required() }),
  body: Joi.object({
    version: Joi.number(),
    status: Joi.string().valid(...REPORT_STATUSES),
    rejectionNote: Joi.string().max(2000).allow('', null),
    reportDate: Joi.date().iso(),
    projectId: objectId.allow(null),
    arrivalTime: Joi.date().iso().allow(null),
    departureTime: Joi.date().iso().allow(null),
    workPerformed: Joi.string().max(5000),
    findings: Joi.string().max(5000).allow('', null),
    nextSteps: Joi.string().max(5000).allow('', null),
    followUpNeeded: Joi.boolean(),
    technicianNotes: Joi.string().max(5000).allow('', null),
    customerSignature: Joi.string().allow('', null),
    customerSignerName: Joi.string().max(255).allow('', null),
    billableMinutes: Joi.number().integer().min(0),
    nonBillableMinutes: Joi.number().integer().min(0),
    billableNotes: Joi.string().max(1000).allow('', null),
    generationSource: Joi.string().valid(...GENERATION_SOURCES),
    sourceSessionId: objectId.allow(null),
    sourceTimeEntryIds: Joi.array().items(objectId).max(100),
    sourceTaskIds: Joi.array().items(objectId).max(100),
    documentIds: Joi.array().items(objectId).max(100),
    materialItems: Joi.array().items(
      Joi.object({
        catalogSource: Joi.string().valid(...CATALOG_SOURCES).required(),
        catalogItemId: Joi.string().max(50).allow('', null),
        catalogSnapshot: catalogSnapshotJoi,
        description: Joi.string().max(300).required(),
        quantity: Joi.number().min(0).required(),
        unit: Joi.string().max(20).required(),
      }),
    ),
  }).min(1),
};

export const reportIdParamSchema = {
  params: Joi.object({ reportId: objectId.required() }),
};

export const submitReportSchema = {
  params: Joi.object({ reportId: objectId.required() }),
};

export const rejectReportSchema = {
  params: Joi.object({ reportId: objectId.required() }),
  body: Joi.object({
    rejectionNote: Joi.string().max(2000).allow('', null),
  }),
};

export const markInvoicedSchema = {
  params: Joi.object({ reportId: objectId.required() }),
  body: Joi.object({
    invoiceId: objectId.allow(null),
    invoiceReference: Joi.string().trim().max(100).allow('', null),
  }).or('invoiceId', 'invoiceReference'),
};

export const createInvoiceFromReportSchema = {
  params: Joi.object({ reportId: objectId.required() }),
  body: Joi.object({
    title: Joi.string().trim().max(500).allow('', null),
    dueDate: Joi.date().iso(),
    paymentTermsDays: Joi.number().integer().min(0).max(365),
    paymentTermsText: Joi.string().max(1000).allow('', null),
    globalDiscountPercent: Joi.number().min(0).max(100),
  }),
};

export const reportHistorySchema = {
  params: Joi.object({ reportId: objectId.required() }),
  query: Joi.object({
    limit: Joi.number().integer().min(1).max(200).default(100),
  }),
};

export const listReportsQuerySchema = {
  query: Joi.object({
    status: Joi.string().valid(...REPORT_STATUSES),
    orderId: objectId,
    projectId: objectId,
    customerId: objectId,
    technicianId: objectId,
    dateFrom: Joi.date().iso(),
    dateTo: Joi.date().iso(),
    search: Joi.string().trim().max(200).allow(''),
    includeArchived: Joi.boolean(),
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(100).default(25),
    sortBy: Joi.string().valid('createdAt', 'reportDate', 'status', 'reportNumber').default('createdAt'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
  }),
};

export const reportExportQuerySchema = {
  query: listReportsQuerySchema.query.keys({
    type: Joi.string().valid('reports', 'payroll', 'controlling', 'invoicing').default('reports'),
    page: Joi.number().integer().min(1),
    pageSize: Joi.number().integer().min(1).max(5000).default(5000),
  }),
};

export const bulkReportIdsSchema = {
  body: Joi.object({
    ids: Joi.array().items(objectId).min(1).max(100).required(),
  }),
};
