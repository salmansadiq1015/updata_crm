import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

const capabilityList = Joi.array().items(Joi.string().trim().max(80)).max(50).default([]);

export const checkConflictSchema = {
  body: Joi.object({
    employeeId: objectId.required(),
    startDatetime: Joi.date().iso().required(),
    endDatetime: Joi.date().iso().greater(Joi.ref('startDatetime')).required(),
    excludeAssignmentId: objectId.allow(null),
    requiredSkills: capabilityList,
    recommendedSkills: capabilityList,
    requiredCertifications: capabilityList,
    recommendedCertifications: capabilityList,
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
