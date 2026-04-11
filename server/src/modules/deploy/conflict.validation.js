import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

export const checkConflictSchema = {
  body: Joi.object({
    employeeId: objectId.required(),
    startDatetime: Joi.date().iso().required(),
    endDatetime: Joi.date().iso().required(),
    excludeAssignmentId: objectId.allow(null),
  }),
};

export const conflictIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const resolveConflictSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    overrideReason: Joi.string().max(2000).required(),
  }),
};
