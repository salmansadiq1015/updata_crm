import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

export const listEmailTemplatesSchema = {};

export const emailTemplateIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
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
