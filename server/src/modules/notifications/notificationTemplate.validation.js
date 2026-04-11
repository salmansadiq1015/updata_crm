import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

const NOTIFICATION_CHANNELS = ['PUSH', 'EMAIL', 'WHATSAPP', 'SMS', 'IN_APP'];
const SUPPORTED_LANGUAGES = ['de', 'fr', 'it', 'en'];

export const createTemplateSchema = {
  body: Joi.object({
    type: Joi.string().required().trim(),
    channel: Joi.string().valid(...NOTIFICATION_CHANNELS).required(),
    language: Joi.string().valid(...SUPPORTED_LANGUAGES).default('de'),
    subjectTemplate: Joi.string(),
    bodyTemplate: Joi.string().required(),
    bodyHtmlTemplate: Joi.string(),
    whatsappTemplateId: Joi.string(),
    variables: Joi.object(),
  }),
};

export const updateTemplateSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    type: Joi.string().trim(),
    channel: Joi.string().valid(...NOTIFICATION_CHANNELS),
    language: Joi.string().valid(...SUPPORTED_LANGUAGES),
    subjectTemplate: Joi.string(),
    bodyTemplate: Joi.string(),
    bodyHtmlTemplate: Joi.string(),
    whatsappTemplateId: Joi.string(),
    variables: Joi.object(),
  }).min(1),
};

export const templateIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const listTemplatesSchema = {
  query: Joi.object({
    type: Joi.string(),
    channel: Joi.string().valid(...NOTIFICATION_CHANNELS),
    language: Joi.string().valid(...SUPPORTED_LANGUAGES),
  }),
};

export const previewTemplateSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    sampleData: Joi.object().required(),
  }),
};
