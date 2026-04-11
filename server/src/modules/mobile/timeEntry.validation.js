import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

const ACTIVITY_TYPES = ['TRAVEL', 'ONSITE_WORK', 'ADMINISTRATIVE', 'OTHER'];

export const createTimeEntrySchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    date: Joi.date().iso().required(),
    startTime: Joi.date().iso().required(),
    endTime: Joi.date().iso().allow(null),
    breakDurationMin: Joi.number().min(0).default(0),
    activityType: Joi.string().valid(...ACTIVITY_TYPES).required(),
    note: Joi.string().max(500).allow('', null),
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
  }),
};

export const releaseTimeEntrySchema = {
  params: Joi.object({ entryId: objectId.required() }),
};
