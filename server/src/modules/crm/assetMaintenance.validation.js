import Joi from 'joi';
import { cursorPagination, objectId } from '../../shared/validation/commonSchemas.js';

const maintenanceType = Joi.string().valid(
  'annual_service',
  'filter_change',
  'chimney_sweep',
  'general_inspection',
  'other',
);

const installationStatus = Joi.string().valid(
  'active',
  'maintenance',
  'out_of_service',
  'defective',
  'decommissioned',
);

const maintenanceStatus = Joi.string().valid('ok', 'due', 'overdue', 'scheduled');
const priority = Joi.string().valid('NORMAL', 'HIGH', 'URGENT');

const appointmentSchema = Joi.object({
  customerContactName: Joi.string().trim().max(255).allow('', null),
  customerContactPhone: Joi.string().trim().max(50).allow('', null),
  customerContactEmail: Joi.string().trim().email().allow('', null),
  appointmentWindow: Joi.string().trim().max(100).allow('', null),
  confirmationMethod: Joi.string().valid('EMAIL', 'SMS', 'PHONE').allow('', null),
  customerNotes: Joi.string().max(2000).allow('', null),
}).min(1);

export const assetMaintenanceListSchema = {
  query: cursorPagination.keys({
    customerId: objectId,
    siteId: objectId,
    installationId: objectId,
    installationStatus,
    maintenanceStatus,
    technicianId: objectId,
    maintenanceType,
    dueFrom: Joi.date().iso(),
    dueTo: Joi.date().iso(),
    search: Joi.string().trim().max(120).allow(''),
    customerSearch: Joi.string().trim().max(120).allow(''),
    installationSearch: Joi.string().trim().max(120).allow(''),
    sortBy: Joi.string().valid('nextDueDate', 'createdAt', 'installationNumber', 'maintenanceStatus').default('nextDueDate'),
    sortOrder: Joi.string().valid('asc', 'desc').default('asc'),
  }),
};

export const assetMaintenanceContextSchema = {
  params: Joi.object({
    installationId: objectId.required(),
  }),
};

export const assetMaintenanceBulkCreateSchema = {
  body: Joi.object({
    installationIds: Joi.array().items(objectId.required()).min(1).max(100).unique().required(),
    maintenanceType: maintenanceType.required(),
    customTypeLabel: Joi.string().trim().max(100).allow('', null),
    frequencyMonths: Joi.number().integer().min(1).max(120).required(),
    lastServiceDate: Joi.date().iso().allow(null),
    notes: Joi.string().max(2000).allow('', null),
    skipExisting: Joi.boolean().default(true),
  }),
};

export const assetMaintenanceScheduleSchema = {
  body: Joi.object({
    maintenanceIntervalIds: Joi.array().items(objectId.required()).max(50).unique().default([]),
    installationIds: Joi.array().items(objectId.required()).max(50).unique().default([]),
    employeeIds: Joi.array().items(objectId.required()).min(1).max(20).required(),
    title: Joi.string().trim().max(255).allow('', null),
    startDatetime: Joi.date().iso().required(),
    endDatetime: Joi.date().iso().greater(Joi.ref('startDatetime')),
    isFullDay: Joi.boolean().default(false),
    priority: priority.default('NORMAL'),
    instructions: Joi.string().max(5000).allow('', null),
    isCustomerAppointment: Joi.boolean().default(true),
    appointment: Joi.when('isCustomerAppointment', {
      is: true,
      then: appointmentSchema.required(),
      otherwise: appointmentSchema.allow(null).optional(),
    }),
    overrideConflicts: Joi.boolean().default(false),
    overrideReason: Joi.when('overrideConflicts', {
      is: true,
      then: Joi.string().trim().min(10).max(2000).required(),
      otherwise: Joi.string().max(2000).allow('', null),
    }),
  }).custom((value, helpers) => {
    if (!value.maintenanceIntervalIds.length && !value.installationIds.length) {
      return helpers.error('any.custom', { message: 'Select at least one maintenance interval or installation.' });
    }
    return value;
  }),
};
