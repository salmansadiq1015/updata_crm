import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';
import { CONTACT_CHANNELS } from './contactLog.model.js';

const linkFields = {
  contactId: objectId.allow(null),
  siteId: objectId.allow(null),
  projectId: objectId.allow(null),
  orderId: objectId.allow(null),
  assignmentId: objectId.allow(null),
};

const listFilters = {
  channel: Joi.string().valid(...CONTACT_CHANNELS),
  employeeId: objectId,
  dateFrom: Joi.date(),
  dateTo: Joi.date(),
  onlyOpenPoints: Joi.boolean(),
  onlyFollowUps: Joi.boolean(),
  limit: Joi.number().integer().min(1).max(200).default(100),
  skip: Joi.number().integer().min(0).default(0),
};

export const listCustomerContactLogSchema = {
  params: Joi.object({ customerId: objectId.required() }),
  query: Joi.object(listFilters),
};

/** Listing scoped to a linked record — exactly one of the link ids is required. */
export const listContactLogSchema = {
  query: Joi.object({
    ...listFilters,
    customerId: objectId,
    siteId: objectId,
    projectId: objectId,
    orderId: objectId,
    assignmentId: objectId,
  }).or('customerId', 'siteId', 'projectId', 'orderId', 'assignmentId'),
};

export const createContactLogSchema = {
  params: Joi.object({ customerId: objectId.required() }),
  body: Joi.object({
    occurredAt: Joi.date().allow(null),
    employeeId: objectId.allow(null),
    channel: Joi.string().valid(...CONTACT_CHANNELS).required(),
    channelLabel: Joi.string().trim().max(60).allow('', null),
    subject: Joi.string().trim().max(200).allow('', null),
    note: Joi.string().max(5000).required(),
    agreements: Joi.string().max(5000).allow('', null),
    openPoints: Joi.string().max(5000).allow('', null),
    followUpAt: Joi.date().allow(null),
    ...linkFields,
    // Follow-up task options
    createFollowUpTask: Joi.boolean().default(false),
    followUpTaskTitle: Joi.string().trim().max(500).allow('', null),
    followUpDepartmentId: objectId.allow(null),
    followUpAssigneeId: objectId.allow(null),
  }),
};

export const updateContactLogSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    occurredAt: Joi.date(),
    employeeId: objectId,
    channel: Joi.string().valid(...CONTACT_CHANNELS),
    channelLabel: Joi.string().trim().max(60).allow('', null),
    subject: Joi.string().trim().max(200).allow('', null),
    note: Joi.string().max(5000),
    agreements: Joi.string().max(5000).allow('', null),
    openPoints: Joi.string().max(5000).allow('', null),
    followUpAt: Joi.date().allow(null),
    ...linkFields,
  }).min(1),
};

export const contactLogIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};
