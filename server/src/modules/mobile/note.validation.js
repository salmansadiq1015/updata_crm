import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

export const createMobileNoteSchema = {
  params: Joi.object({
    entityType: Joi.string().valid('customer', 'site', 'installation').required(),
    entityId: objectId.required(),
  }),
  body: Joi.object({
    text: Joi.string().trim().min(1).max(2000).required(),
    category: Joi.string().valid('general', 'warning', 'access_info', 'technical').default('general'),
    isPinned: Joi.boolean().default(false),
    isWarning: Joi.boolean().default(false),
    clientMutationId: Joi.string().trim().max(120).allow('', null),
  }),
};
