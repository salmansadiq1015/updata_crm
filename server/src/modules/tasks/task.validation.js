import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';
import { TASK_STATUSES, TASK_PRIORITIES } from './task.model.js';

export const createTaskSchema = {
  body: Joi.object({
    title: Joi.string().required().trim().max(500),
    description: Joi.string().allow('', null),
    priority: Joi.string().valid(...TASK_PRIORITIES),
    listId: objectId.allow(null),
    assigneeId: objectId.allow(null),
    dueDate: Joi.date().iso().allow(null),
    projectId: objectId.allow(null),
    orderId: objectId.allow(null),
  }),
};

export const updateTaskSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    title: Joi.string().trim().max(500),
    description: Joi.string().allow('', null),
    priority: Joi.string().valid(...TASK_PRIORITIES),
    assigneeId: objectId.allow(null),
    dueDate: Joi.date().iso().allow(null),
    projectId: objectId.allow(null),
    orderId: objectId.allow(null),
  }).min(1),
};

export const taskIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const listTasksSchema = {
  query: cursorPagination.keys({
    listId: objectId,
    assigneeId: objectId,
    createdById: objectId,
    status: Joi.string().valid(...TASK_STATUSES),
    priority: Joi.string().valid(...TASK_PRIORITIES),
    projectId: objectId,
    orderId: objectId,
    overdue: Joi.boolean(),
    dueToday: Joi.boolean(),
    dueFrom: Joi.date().iso(),
    dueTo: Joi.date().iso(),
    hasParent: Joi.boolean(),
    parentId: objectId,
    q: Joi.string().max(200),
  }),
};

export const changeStatusSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    status: Joi.string().valid(...TASK_STATUSES).required(),
  }),
};

export const completeTaskSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    completeSubtasks: Joi.boolean(),
  }),
};

export const moveTaskSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    listId: objectId.required(),
  }),
};

export const bulkOperationSchema = {
  body: Joi.object({
    action: Joi.string().valid('updateStatus', 'reassign', 'updatePriority', 'moveToList', 'delete').required(),
    taskIds: Joi.array().items(objectId.required()).min(1).max(100).required(),
    data: Joi.object({
      status: Joi.string().valid(...TASK_STATUSES),
      assigneeId: objectId,
      priority: Joi.string().valid(...TASK_PRIORITIES),
      listId: objectId,
    }),
  }),
};

export const createSubtaskSchema = {
  params: Joi.object({ parentId: objectId.required() }),
  body: Joi.object({
    title: Joi.string().required().trim().max(500),
    description: Joi.string().allow('', null),
    priority: Joi.string().valid(...TASK_PRIORITIES),
    assigneeId: objectId.allow(null),
    dueDate: Joi.date().iso().allow(null),
  }),
};

export const parentIdParamSchema = {
  params: Joi.object({ parentId: objectId.required() }),
};

export const reorderSubtasksSchema = {
  params: Joi.object({ parentId: objectId.required() }),
  body: Joi.object({
    orderedIds: Joi.array().items(objectId.required()).min(1).max(100).required(),
  }),
};

export const promoteTaskSchema = {
  params: Joi.object({ id: objectId.required() }),
};
