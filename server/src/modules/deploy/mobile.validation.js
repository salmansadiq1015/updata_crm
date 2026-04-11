import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

export const mobileAssignmentsSchema = {
  query: Joi.object({
    dateFrom: Joi.date().iso(),
    dateTo: Joi.date().iso(),
  }),
};

export const mobileAssignmentIdSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const mobileSyncSchema = {
  query: Joi.object({
    since: Joi.date().iso().required(),
  }),
};
