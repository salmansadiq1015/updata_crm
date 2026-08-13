import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

const ACTIVITY_TYPES = ['TRAVEL', 'ONSITE_WORK', 'ADMINISTRATIVE', 'OTHER'];
const RELEASE_STATUSES = ['PENDING', 'RELEASED', 'LOCKED'];

const timeEntryBody = {
  date: Joi.date().iso().required(),
  startTime: Joi.date().iso().required(),
  endTime: Joi.date().iso().allow(null),
  breakDurationMin: Joi.number().min(0).default(0),
  activityType: Joi.string().valid(...ACTIVITY_TYPES).required(),
  note: Joi.string().max(500).allow('', null),
};

/** Nested under an assignment: the order comes from the URL. */
export const createTimeEntrySchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object(timeEntryBody),
};

/** Standalone: office hours, which belong to no assignment. */
export const createOfficeTimeEntrySchema = {
  body: Joi.object({
    ...timeEntryBody,
    officeCategoryId: objectId.allow(null),
  }),
};

export const updateTimeEntrySchema = {
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

export const deleteTimeEntrySchema = {
  params: Joi.object({ entryId: objectId.required() }),
};

export const listTimeEntriesSchema = {
  query: Joi.object({
    dateFrom: Joi.date().iso(),
    dateTo: Joi.date().iso(),
    all: Joi.boolean(),
    technicianId: objectId,
    orderId: objectId,
    activityType: Joi.string().valid(...ACTIVITY_TYPES),
    releaseStatus: Joi.string().valid(...RELEASE_STATUSES),
    limit: Joi.number().integer().min(1).max(500),
  }),
};

export const releaseTimeEntrySchema = {
  params: Joi.object({ entryId: objectId.required() }),
};

export const overrideTimeEntrySchema = {
  params: Joi.object({ entryId: objectId.required() }),
  body: Joi.object({
    justification: Joi.string().trim().min(20).max(1000).required(),
  }),
};
