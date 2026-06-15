import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

export const createMaintenanceSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    maintenanceType: Joi.string().valid('annual_service', 'filter_change', 'chimney_sweep', 'general_inspection', 'other').required(),
    // CRM-007 AC-1: free-text label accepted for ANY type (not gated on type==='other').
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
    // CRM-007 AC-1: free-text label accepted for ANY type (not gated on type==='other').
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
    sortBy: Joi.string().valid('nextDueDate', 'createdAt', '_id').default('nextDueDate'),
    sortOrder: Joi.string().valid('asc', 'desc').default('asc'),
  }),
};

export const maintenanceExportSchema = {
  query: Joi.object({
    status: Joi.string().valid('due', 'overdue', 'all').default('all'),
    maintenanceType: Joi.string().valid('annual_service', 'filter_change', 'chimney_sweep', 'general_inspection', 'other'),
    format: Joi.string().valid('csv').default('csv'),
  }),
};

export const maintenanceSettingsReadSchema = {
  query: Joi.object({}),
};

export const maintenanceSettingsUpdateSchema = {
  body: Joi.object({
    escalationDays: Joi.number().integer().min(1).max(365).required(),
  }),
};
