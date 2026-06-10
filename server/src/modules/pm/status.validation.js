import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

const PROJECT_STATUSES = [
  'DRAFT',
  'PLANNING',
  'SCHEDULED',
  'WAITING_FOR_MATERIAL',
  'IN_PROGRESS',
  'AWAITING_CUSTOMER_APPROVAL',
  'AWAITING_QUOTATION_APPROVAL',
  'ON_HOLD',
  'COMPLETED',
  'INVOICED',
  'ARCHIVED',
];

export const transitionStatusSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    targetStatus: Joi.string()
      .valid(...PROJECT_STATUSES)
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
