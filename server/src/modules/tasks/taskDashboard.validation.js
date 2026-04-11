import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

export const dashboardSchema = {};

export const statsSchema = {};

export const projectTasksSchema = {
  params: Joi.object({ projectId: objectId.required() }),
  query: cursorPagination,
};

export const projectSummarySchema = {
  params: Joi.object({ projectId: objectId.required() }),
};

export const orderTasksSchema = {
  params: Joi.object({ orderId: objectId.required() }),
  query: cursorPagination,
};

export const crossProjectReportSchema = {
  query: Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(50),
  }),
};

export const syncGetSchema = {
  query: Joi.object({
    since: Joi.string().isoDate().required(),
  }),
};

export const syncPushSchema = {
  body: Joi.object({
    changes: Joi.array().items(
      Joi.object({
        type: Joi.string().valid('create', 'update', 'delete').required(),
        entity: Joi.string().valid('task', 'taskNote').required(),
        data: Joi.object().required(),
        clientTimestamp: Joi.string().isoDate().required(),
      }),
    ).required(),
  }),
};

export const userDefaultsSchema = {
  body: Joi.object({
    enabled: Joi.boolean(),
    defaultOffsetMinutes: Joi.number().integer().min(0),
    defaultChannels: Joi.array().items(Joi.string()),
  }),
};
