import Joi from 'joi';
import { cursorPagination, objectId } from '../../shared/validation/commonSchemas.js';
import { DOCUMENT_ORIGINS, DOCUMENT_SOURCES } from './documentIndex.model.js';

const CENTRAL_RECORD_ID = /^(repository|generated|project|customer|accounting|mobile):[0-9a-fA-F]{24}$/;
const LINK_TYPES = ['', 'customer', 'project', 'job', 'employee'];

export const listDocumentsSchema = {
  query: cursorPagination.keys({
    source: Joi.string().valid(...DOCUMENT_SOURCES, 'all').default('all'),
    origin: Joi.string().valid(...DOCUMENT_ORIGINS, 'all').default('all'),
    // Document section: Dokumente / Dokumente mit Visum / Archiv.
    section: Joi.string().valid('all', 'documents', 'visum', 'archiv').default('all'),
    documentType: Joi.string().trim().max(100),
    category: Joi.string().trim().max(100),
    status: Joi.string().trim().max(80),
    sourceRecordType: Joi.string().trim().max(80),
    sourceRecordId: objectId,
    customerId: objectId,
    projectId: objectId,
    siteId: objectId,
    jobId: objectId,
    employeeId: objectId,
    dateFrom: Joi.date().iso(),
    dateTo: Joi.date().iso(),
    search: Joi.string().trim().max(200).allow(''),
  }),
};

export const uploadDocumentSchema = {
  body: Joi.object({
    title: Joi.string().trim().max(300).allow('', null),
    documentType: Joi.string().trim().max(100).default('OTHER'),
    category: Joi.string().trim().max(100).default('OTHER'),
    description: Joi.string().max(2000).allow('', null),
    folderPath: Joi.string().trim().max(500).allow('', null),
    sourceRecordType: Joi.string().valid(...LINK_TYPES).allow(null).default(''),
    sourceRecordId: objectId.allow(null),
    customerId: objectId.allow(null),
    projectId: objectId.allow(null),
    jobId: objectId.allow(null),
    employeeId: objectId.allow(null),
  }),
};

export const documentRecordParamSchema = {
  params: Joi.object({
    id: Joi.string().pattern(CENTRAL_RECORD_ID).required(),
  }),
};
