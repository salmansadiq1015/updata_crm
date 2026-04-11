import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

const VALID_REQUEST_TYPES = ['heizungsstoerung', 'wartung', 'neuinstallation', 'beratung', 'other'];

export const submitWidgetSchema = {
  body: Joi.object({
    widgetId: Joi.string(),
    contact: Joi.object({
      name: Joi.string().max(200).required(),
      email: Joi.string().email().required(),
      phone: Joi.string().max(30),
      address: Joi.object({
        street: Joi.string(),
        zip: Joi.string(),
        city: Joi.string(),
      }),
    }).required(),
    requestType: Joi.string().valid(...VALID_REQUEST_TYPES).required(),
    description: Joi.string().max(5000).required(),
    preferredWindow: Joi.string().max(100),
    captchaToken: Joi.string(),
    language: Joi.string().max(5),
  }),
};

export const submissionIdParamSchema = {
  params: Joi.object({ submissionId: objectId.required() }),
};

export const widgetIdQuerySchema = {
  query: Joi.object({
    widgetId: Joi.string(),
  }),
};
