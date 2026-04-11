import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

export const transitionStatusSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    targetStatus: Joi.string()
      .valid('DRAFT', 'PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'ARCHIVED')
      .required(),
    comment: Joi.string().max(2000).allow(null).default(null),
    override: Joi.boolean().default(false),
    overrideReason: Joi.string()
      .max(2000)
      .allow(null)
      .default(null)
      .when('override', {
        is: true,
        then: Joi.string().max(2000).required(),
      }),
  }),
};

export const statusHistorySchema = {
  params: Joi.object({ id: objectId.required() }),
};
