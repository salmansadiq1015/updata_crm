import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';
import { TASK_STATUSES, TASK_PRIORITIES, TASK_SOURCE_TYPES } from './task.model.js';

const sourceSchema = Joi.object({
  type: Joi.string().valid(...TASK_SOURCE_TYPES),
  refId: objectId.allow(null),
  label: Joi.string().trim().max(255).allow('', null),
}).allow(null);

export const createTaskSchema = {
  body: Joi.object({
    title: Joi.string().required().trim().max(500),
    description: Joi.string().allow('', null),
    status: Joi.string().valid(...TASK_STATUSES),
    priority: Joi.string().valid(...TASK_PRIORITIES),
    listId: objectId.allow(null),
    assigneeId: objectId.allow(null),
    assigneeIds: Joi.array().items(objectId).max(20),
    startDate: Joi.date().iso().allow(null),
    dueDate: Joi.date().iso().allow(null),
    projectId: objectId.allow(null),
    orderId: objectId.allow(null),
    siteId: objectId.allow(null),
    meetingId: objectId.allow(null),
    departmentId: objectId.allow(null),
    source: sourceSchema,
    sortOrder: Joi.number().integer(),
  }),
};

export const updateTaskSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    title: Joi.string().trim().max(500),
    description: Joi.string().allow('', null),
    priority: Joi.string().valid(...TASK_PRIORITIES),
    assigneeId: objectId.allow(null),
    assigneeIds: Joi.array().items(objectId).max(20),
    startDate: Joi.date().iso().allow(null),
    dueDate: Joi.date().iso().allow(null),
    projectId: objectId.allow(null),
    orderId: objectId.allow(null),
    siteId: objectId.allow(null),
    meetingId: objectId.allow(null),
    departmentId: objectId.allow(null),
    source: sourceSchema,
    sortOrder: Joi.number().integer(),
    expectedVersion: Joi.number().integer().min(0),
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
    siteId: objectId,
    meetingId: objectId,
    departmentId: objectId,
    active: Joi.boolean(),
    completedThisWeek: Joi.boolean(),
    overdue: Joi.boolean(),
    dueToday: Joi.boolean(),
    inPool: Joi.boolean(),
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
    sortOrder: Joi.number().integer(),
    expectedVersion: Joi.number().integer().min(0),
    completeSubtasks: Joi.boolean(),
    completeParentOnly: Joi.boolean(),
  }),
};

export const batchPatchSchema = {
  body: Joi.object({
    updates: Joi.array().items(Joi.object({
      id: objectId.required(),
      patch: Joi.object({
        title: Joi.string().trim().max(500),
        description: Joi.string().allow('', null),
        status: Joi.string().valid(...TASK_STATUSES),
        priority: Joi.string().valid(...TASK_PRIORITIES),
        assigneeId: objectId.allow(null),
        assigneeIds: Joi.array().items(objectId).max(20),
        startDate: Joi.date().iso().allow(null),
        dueDate: Joi.date().iso().allow(null),
        listId: objectId,
        meetingId: objectId.allow(null),
        sortOrder: Joi.number().integer(),
        expectedVersion: Joi.number().integer().min(0),
      }).min(1).required(),
    })).min(1).max(100).required(),
  }),
};

export const setLockSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    locked: Joi.boolean().required(),
    expectedVersion: Joi.number().integer().min(0),
  }),
};

export const claimTaskSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    expectedVersion: Joi.number().integer().min(0),
  }),
};

export const helpTaskSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    expectedVersion: Joi.number().integer().min(0),
  }),
};

export const completeTaskSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    completeSubtasks: Joi.boolean(),
    completeParentOnly: Joi.boolean(),
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
      assigneeIds: Joi.array().items(objectId).max(20),
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
    assigneeIds: Joi.array().items(objectId).max(20),
    startDate: Joi.date().iso().allow(null),
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

export const siteIdParamSchema = {
  params: Joi.object({
    siteId: objectId.required(),
  }),
};
