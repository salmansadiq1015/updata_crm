import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

export const getCoarseMatrixSchema = {
  query: Joi.object({
    year: Joi.number().integer().required(),
    weekFrom: Joi.number().integer().min(1).max(53).required(),
    weekTo: Joi.number().integer().min(1).max(53).required(),
    employeeIds: Joi.string().allow(''),
    projectId: objectId.allow(null),
    view: Joi.string().valid('EMPLOYEE_CENTRIC', 'PROJECT_CENTRIC').default('EMPLOYEE_CENTRIC'),
  }),
};

export const createCoarseSchema = {
  body: Joi.object({
    employeeId: objectId.required(),
    projectId: objectId.required(),
    calendarYear: Joi.number().integer().required(),
    calendarWeek: Joi.number().integer().min(1).max(53).required(),
    allocationPercent: Joi.number().valid(25, 50, 75, 100).required(),
    notes: Joi.string().max(2000).allow(null),
  }),
};

export const updateCoarseSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    allocationPercent: Joi.number().valid(25, 50, 75, 100),
    notes: Joi.string().max(2000),
  }).min(1),
};

export const coarseIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const moveCoarseSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    calendarYear: Joi.number().integer().required(),
    calendarWeek: Joi.number().integer().min(1).max(53).required(),
  }),
};

export const bulkCoarseSchema = {
  body: Joi.object({
    allocations: Joi.array().items(
      Joi.object({
        employeeId: objectId.required(),
        projectId: objectId.required(),
        calendarYear: Joi.number().integer().required(),
        calendarWeek: Joi.number().integer().min(1).max(53).required(),
        allocationPercent: Joi.number().valid(25, 50, 75, 100).required(),
      }),
    ).min(1).max(100).required(),
  }),
};
