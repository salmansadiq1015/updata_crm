import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

export const listEmailTemplatesSchema = {};

export const emailTemplateIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const createEmailTemplateSchema = {
  body: Joi.object({
    templateType: Joi.string().trim().max(100).required(),
    language: Joi.string().valid('de', 'fr', 'it', 'en').required(),
    subjectTemplate: Joi.string().max(500).required(),
    bodyHtml: Joi.string().max(50000).required(),
    bodyText: Joi.string().max(20000).allow('', null),
    isActive: Joi.boolean(),
  }),
};

export const updateEmailTemplateSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    subjectTemplate: Joi.string().max(500),
    bodyHtml: Joi.string().max(50000),
    bodyText: Joi.string().max(20000).allow('', null),
    isActive: Joi.boolean(),
  }).min(1),
};

export const renderEmailTemplateSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    customerId: objectId,
    siteId: objectId,
    projectId: objectId,
    leadId: objectId,
  }),
};
