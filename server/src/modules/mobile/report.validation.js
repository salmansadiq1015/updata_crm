import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';
import { catalogSnapshotJoi } from '../../shared/validation/catalogSnapshot.schema.js';

const CATALOG_SOURCES = ['IGH', 'INTERNAL', 'CUSTOM'];

export const createReportSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    reportDate: Joi.date().iso().required(),
    arrivalTime: Joi.date().iso().allow(null),
    departureTime: Joi.date().iso().allow(null),
    workPerformed: Joi.string().max(5000).required(),
    findings: Joi.string().max(5000).allow('', null),
    nextSteps: Joi.string().max(5000).allow('', null),
    followUpNeeded: Joi.boolean(),
    technicianNotes: Joi.string().max(5000).allow('', null),
    customerSignature: Joi.string().allow('', null),
    customerSignerName: Joi.string().max(255).allow('', null),
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

export const updateReportSchema = {
  params: Joi.object({ reportId: objectId.required() }),
  body: Joi.object({
    version: Joi.number(),
    status: Joi.string().valid('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'),
    rejectionNote: Joi.string().max(2000).allow('', null),
    reportDate: Joi.date().iso(),
    arrivalTime: Joi.date().iso().allow(null),
    departureTime: Joi.date().iso().allow(null),
    workPerformed: Joi.string().max(5000),
    findings: Joi.string().max(5000).allow('', null),
    nextSteps: Joi.string().max(5000).allow('', null),
    followUpNeeded: Joi.boolean(),
    technicianNotes: Joi.string().max(5000).allow('', null),
    customerSignature: Joi.string().allow('', null),
    customerSignerName: Joi.string().max(255).allow('', null),
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

export const bulkReportIdsSchema = {
  body: Joi.object({
    ids: Joi.array().items(objectId).min(1).max(100).required(),
  }),
};
