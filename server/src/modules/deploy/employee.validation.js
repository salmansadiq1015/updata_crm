import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

const capabilityQuery = Joi.alternatives().try(
  Joi.string().trim().max(1000).allow(''),
  Joi.array().items(Joi.string().trim().max(80)).max(50),
);

export const listDeployEmployeesSchema = {
  query: Joi.object({
    search: Joi.string().trim().max(100).allow(''),
    limit: Joi.number().integer().min(1).max(100).default(80),
    teamId: Joi.string().trim().max(100).allow(''),
    startDatetime: Joi.date().iso(),
    endDatetime: Joi.date().iso().greater(Joi.ref('startDatetime')),
    requiredSkills: capabilityQuery,
    recommendedSkills: capabilityQuery,
    requiredCertifications: capabilityQuery,
    recommendedCertifications: capabilityQuery,
    includeEmployeeIds: Joi.alternatives().try(
      objectId,
      Joi.string().trim().max(2000).allow(''),
      Joi.array().items(objectId).max(100),
    ),
  }).with('startDatetime', 'endDatetime').with('endDatetime', 'startDatetime'),
};
