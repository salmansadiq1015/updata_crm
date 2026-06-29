import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

const ACTIVITY_TYPES = ['TRAVEL', 'ONSITE_WORK', 'ADMINISTRATIVE', 'OTHER'];
const RELEASE_STATUSES = ['PENDING', 'RELEASED', 'LOCKED'];
const LEAVE_TYPES = ['VACATION', 'SICK', 'OTHER_ABSENCE', 'PUBLIC_HOLIDAY', 'COMPANY_CLOSURE'];
const LEAVE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];

const rangeQuery = {
  dateFrom: Joi.date().iso(),
  dateTo: Joi.date().iso(),
  employeeId: objectId,
  technicianId: objectId,
  orderId: objectId,
  projectId: objectId,
  customerId: objectId,
};

export const timeTrackingQuerySchema = {
  query: Joi.object({
    ...rangeQuery,
    activityType: Joi.string().valid(...ACTIVITY_TYPES),
    releaseStatus: Joi.string().valid(...RELEASE_STATUSES),
    limit: Joi.number().integer().min(1).max(1000),
  }),
};

export const analyticsQuerySchema = {
  query: Joi.object({
    ...rangeQuery,
    year: Joi.number().integer().min(2000).max(2100),
    groupBy: Joi.string().valid('employee', 'day', 'week', 'month', 'project', 'job', 'customer').default('employee'),
  }),
};

export const timeEntryCreateSchema = {
  params: Joi.object({ orderId: objectId.required() }),
  body: Joi.object({
    date: Joi.date().iso().required(),
    startTime: Joi.date().iso().required(),
    endTime: Joi.date().iso().allow(null),
    breakDurationMin: Joi.number().min(0).default(0),
    activityType: Joi.string().valid(...ACTIVITY_TYPES).required(),
    note: Joi.string().max(500).allow('', null),
  }),
};

export const orderTimeEntryListSchema = {
  params: Joi.object({ orderId: objectId.required() }),
  query: Joi.object({
    dateFrom: Joi.date().iso(),
    dateTo: Joi.date().iso(),
    activityType: Joi.string().valid(...ACTIVITY_TYPES),
    releaseStatus: Joi.string().valid(...RELEASE_STATUSES),
    limit: Joi.number().integer().min(1).max(1000),
  }),
};

export const timeEntryUpdateSchema = {
  params: Joi.object({ entryId: objectId.required() }),
  body: Joi.object({
    date: Joi.date().iso(),
    startTime: Joi.date().iso(),
    endTime: Joi.date().iso().allow(null),
    breakDurationMin: Joi.number().min(0),
    activityType: Joi.string().valid(...ACTIVITY_TYPES),
    note: Joi.string().max(500).allow('', null),
  }).min(1),
};

export const timeEntryIdSchema = {
  params: Joi.object({ entryId: objectId.required() }),
};

export const timeEntryImportSchema = {
  body: Joi.object({
    dryRun: Joi.boolean().default(false),
  }),
};

export const overrideTimeEntrySchema = {
  params: Joi.object({ entryId: objectId.required() }),
  body: Joi.object({
    justification: Joi.string().trim().min(20).max(1000).required(),
  }),
};

export const leaveRequestListSchema = {
  query: Joi.object({
    ...rangeQuery,
    leaveType: Joi.string().valid(...LEAVE_TYPES),
    status: Joi.string().valid(...LEAVE_STATUSES),
    limit: Joi.number().integer().min(1).max(1000),
  }),
};

export const leaveRequestCreateSchema = {
  body: Joi.object({
    employeeId: objectId,
    leaveType: Joi.string().valid(...LEAVE_TYPES).required(),
    startDate: Joi.date().iso().required(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')).required(),
    unit: Joi.string().valid('DAYS', 'HOURS').default('DAYS'),
    hours: Joi.when('unit', {
      is: 'HOURS',
      then: Joi.number().positive().required(),
      otherwise: Joi.number().min(0).optional(),
    }),
    reason: Joi.string().trim().max(2000).allow('', null),
  }),
};

export const leaveRequestIdSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const leaveDecisionSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    decisionNote: Joi.string().trim().max(2000).allow('', null),
  }),
};

export const leaveRejectSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    decisionNote: Joi.string().trim().min(3).max(2000).required(),
  }),
};

export const balanceQuerySchema = {
  query: Joi.object({
    employeeId: objectId,
    year: Joi.number().integer().min(2000).max(2100),
  }),
};

export const balanceUpsertSchema = {
  params: Joi.object({
    employeeId: objectId.required(),
    year: Joi.number().integer().min(2000).max(2100).required(),
  }),
  body: Joi.object({
    annualEntitlementDays: Joi.number().min(0).max(365).required(),
    carryoverDays: Joi.number().min(-365).max(365).default(0),
    manualAdjustmentDays: Joi.number().min(-365).max(365).default(0),
    notes: Joi.string().trim().max(1000).allow('', null),
  }),
};
