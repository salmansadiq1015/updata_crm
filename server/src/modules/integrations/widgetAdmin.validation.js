import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

export const listSubmissionsSchema = {
  query: cursorPagination.keys({
    processingStatus: Joi.string(),
    contactEmail: Joi.string(),
    requestType: Joi.string(),
    dateFrom: Joi.date().iso(),
    dateTo: Joi.date().iso(),
  }),
};

export const submissionIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const markProcessedSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    crmContactId: objectId,
    orderId: objectId,
  }),
};

export const updateWidgetConfigSchema = {
  body: Joi.object({
    branding: Joi.object(),
    fields: Joi.object(),
    requestTypes: Joi.array(),
    captcha: Joi.object(),
    confirmationMessageDe: Joi.string(),
    languages: Joi.array(),
    maxFilesPerSubmission: Joi.number().integer(),
    maxFileSizeMb: Joi.number(),
    rateLimitPerHour: Joi.number().integer(),
  }).min(1),
};
