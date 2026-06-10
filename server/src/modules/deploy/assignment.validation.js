import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

const ASSIGNMENT_TYPES = ['SERVICE_CALL', 'PROJECT_WORK', 'MAINTENANCE', 'INSTALLATION', 'INSPECTION', 'OTHER'];
const ASSIGNMENT_STATUSES = ['PLANNED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const PRIORITIES = ['NORMAL', 'HIGH', 'URGENT'];
const RECURRENCE_FREQUENCIES = ['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'CUSTOM'];
const RECURRENCE_END_TYPES = ['NEVER', 'AFTER_COUNT', 'UNTIL_DATE'];
const CONFIRMATION_METHODS = ['EMAIL', 'SMS', 'PHONE'];

const appointmentSchema = Joi.object({
  customerContactName: Joi.string().trim().max(255),
  customerContactPhone: Joi.string().trim().max(50),
  customerContactEmail: Joi.string().trim().email(),
  appointmentWindow: Joi.string().trim().max(100),
  confirmationMethod: Joi.string().valid(...CONFIRMATION_METHODS),
  customerNotes: Joi.string().max(2000),
}).min(1);

export const createAssignmentSchema = {
  body: Joi.object({
    employeeIds: Joi.array().items(objectId).min(1).max(20).required(),
    orderId: objectId.allow(null),
    projectId: objectId.allow(null),
    assignmentType: Joi.string().valid(...ASSIGNMENT_TYPES).required(),
    title: Joi.string().trim().max(255),
    startDatetime: Joi.date().iso().required(),
    endDatetime: Joi.date().iso().greater(Joi.ref('startDatetime')).required(),
    isFullDay: Joi.boolean(),
    priority: Joi.string().valid(...PRIORITIES),
    instructions: Joi.string().max(5000),
    customerId: objectId.allow(null),
    siteId: objectId.allow(null),
    colorCode: Joi.string().max(7),
    isCustomerAppointment: Joi.boolean(),
    appointment: Joi.when('isCustomerAppointment', {
      is: true,
      then: appointmentSchema.required(),
      otherwise: appointmentSchema.optional(),
    }),
    recurrence: Joi.object({
      frequency: Joi.string().valid(...RECURRENCE_FREQUENCIES).required(),
      interval: Joi.number().integer().min(1),
      daysOfWeek: Joi.string().max(30),
      endType: Joi.string().valid(...RECURRENCE_END_TYPES),
      endCount: Joi.number().integer(),
      endDate: Joi.date().iso(),
    }),
    overrideConflicts: Joi.boolean().default(false),
    overrideReason: Joi.when('overrideConflicts', {
      is: true,
      then: Joi.string().trim().min(10).max(2000).required(),
      otherwise: Joi.string().max(2000).allow('', null),
    }),
  }),
};

export const updateAssignmentSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    version: Joi.number().integer().required(),
    employeeIds: Joi.array().items(objectId).min(1).max(1),
    orderId: objectId.allow(null),
    projectId: objectId.allow(null),
    assignmentType: Joi.string().valid(...ASSIGNMENT_TYPES),
    title: Joi.string().trim().max(255).allow('', null),
    startDatetime: Joi.date().iso(),
    endDatetime: Joi.date().iso(),
    isFullDay: Joi.boolean(),
    status: Joi.string().valid(...ASSIGNMENT_STATUSES),
    priority: Joi.string().valid(...PRIORITIES),
    instructions: Joi.string().max(5000).allow('', null),
    customerId: objectId.allow(null),
    siteId: objectId.allow(null),
    colorCode: Joi.string().max(7).allow('', null),
    isCustomerAppointment: Joi.boolean(),
    appointment: appointmentSchema.optional(),
    overrideConflicts: Joi.boolean().default(false),
    overrideReason: Joi.when('overrideConflicts', {
      is: true,
      then: Joi.string().trim().min(10).max(2000).required(),
      otherwise: Joi.string().max(2000).allow('', null),
    }),
  }).min(1),
};

export const assignmentIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const moveAssignmentSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    newEmployeeId: objectId,
    newStartDatetime: Joi.date().iso().required(),
    newEndDatetime: Joi.date().iso().greater(Joi.ref('newStartDatetime')).required(),
    overrideConflicts: Joi.boolean().default(false),
    overrideReason: Joi.when('overrideConflicts', {
      is: true,
      then: Joi.string().trim().min(10).max(2000).required(),
      otherwise: Joi.string().max(2000).allow('', null),
    }),
  }),
};

export const resizeAssignmentSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    newEndDatetime: Joi.date().iso().required(),
    overrideConflicts: Joi.boolean().default(false),
    overrideReason: Joi.when('overrideConflicts', {
      is: true,
      then: Joi.string().trim().min(10).max(2000).required(),
      otherwise: Joi.string().max(2000).allow('', null),
    }),
  }),
};
