import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

export const getFeedSchema = {
  query: Joi.object({
    cursor: Joi.string().allow(''),
    limit: Joi.number().integer().min(1).max(100).default(50),
    category: Joi.string(),
  }),
};

export const feedIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};
