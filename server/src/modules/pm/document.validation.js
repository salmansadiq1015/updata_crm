import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

const DOCUMENT_CATEGORIES = ['PLANS', 'CONTRACTS', 'PHOTOS', 'CORRESPONDENCE', 'REPORTS', 'OTHER'];

export const listDocumentsSchema = {
  params: Joi.object({ id: objectId.required() }),
  query: Joi.object({
    category: Joi.string().valid(...DOCUMENT_CATEGORIES),
    search: Joi.string().trim().max(100),
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso(),
  }),
};

export const uploadDocumentSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    category: Joi.string().valid(...DOCUMENT_CATEGORIES).default('OTHER'),
    description: Joi.string().max(2000).allow(null, ''),
  }),
};

// Overridable subset the client edit-step may send (shallow-merged over computed
// templateData). Kept permissive but bounded; unknown keys are stripped.
const overridesSchema = Joi.object({
  documentDate: Joi.string().trim().max(40),
  projectName: Joi.string().trim().max(300),
  projectManager: Joi.string().trim().max(200),
  pmEmail: Joi.string().trim().max(200).allow('', null),
  pmPhone: Joi.string().trim().max(60).allow('', null),
  description: Joi.string().max(5000).allow('', null),
  recipientName: Joi.string().trim().max(200).allow('', null),
  intro: Joi.string().max(5000).allow('', null),
  body: Joi.string().max(20000).allow('', null),
  notes: Joi.string().max(5000).allow('', null),
}).default({});

export const generateDocumentSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    templateType: Joi.string().required().trim().max(100),
    overrides: overridesSchema,
    draftId: objectId.allow(null),
  }),
};

export const saveDraftSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    templateType: Joi.string().required().trim().max(100),
    overrides: overridesSchema,
    draftId: objectId.allow(null),
  }),
};

export const emailDocumentSchema = {
  params: Joi.object({ id: objectId.required(), docId: objectId.required() }),
  body: Joi.object({
    to: Joi.string().email().required(),
    message: Joi.string().max(2000).allow('', null),
  }),
};

export const documentIdParamSchema = {
  params: Joi.object({ docId: objectId.required() }),
};

export const updateDocumentSchema = {
  params: Joi.object({ docId: objectId.required() }),
  body: Joi.object({
    category: Joi.string().valid(...DOCUMENT_CATEGORIES),
    description: Joi.string().max(2000).allow(null, ''),
  }).min(1),
};

export const restoreDocumentSchema = {
  params: Joi.object({ docId: objectId.required() }),
};
