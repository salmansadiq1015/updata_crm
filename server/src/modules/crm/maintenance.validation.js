import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

export const createMaintenanceSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    maintenanceType: Joi.string().valid('annual_service', 'filter_change', 'chimney_sweep', 'general_inspection', 'other').required(),
    customTypeLabel: Joi.string().trim().max(100).allow('', null),
    frequencyMonths: Joi.number().integer().min(1).max(120).required(),
    lastServiceDate: Joi.date().iso().allow(null),
    notes: Joi.string().max(2000).allow('', null),
  }),
};

export const updateMaintenanceSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    maintenanceType: Joi.string().valid('annual_service', 'filter_change', 'chimney_sweep', 'general_inspection', 'other'),
    customTypeLabel: Joi.string().trim().max(100).allow('', null),
    frequencyMonths: Joi.number().integer().min(1).max(120),
    lastServiceDate: Joi.date().iso().allow(null),
    maintenanceStatus: Joi.string().valid('ok', 'due', 'overdue', 'scheduled'),
    linkedServiceOrderId: objectId.allow(null),
    notes: Joi.string().max(2000).allow('', null),
  }).min(1),
};

export const maintenanceIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const maintenanceDashboardSchema = {
  query: Joi.object({}),
};

export const maintenanceListSchema = {
  query: cursorPagination.keys({
    maintenanceType: Joi.string().valid('annual_service', 'filter_change', 'chimney_sweep', 'general_inspection', 'other'),
  }),
};
