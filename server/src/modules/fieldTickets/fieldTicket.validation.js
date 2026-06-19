import Joi from 'joi';
import { objectId, cursorPagination, idParam } from '../../shared/validation/commonSchemas.js';
import {
  FIELD_TICKET_ATTACHMENT_KINDS,
  FIELD_TICKET_COMMENT_VISIBILITY,
  FIELD_TICKET_PRIORITIES,
  FIELD_TICKET_STATUSES,
  FIELD_TICKET_TYPES,
} from './fieldTicket.model.js';

const nullableObjectId = objectId.allow(null);

const baseTicketFields = {
  title: Joi.string().trim().min(2).max(200),
  description: Joi.string().trim().max(5000).allow(''),
  type: Joi.string().valid(...FIELD_TICKET_TYPES),
  priority: Joi.string().valid(...FIELD_TICKET_PRIORITIES),
  status: Joi.string().valid(...FIELD_TICKET_STATUSES),
  dueAt: Joi.date().iso().allow(null),
  assignedTo: nullableObjectId,
  teamId: nullableObjectId,
  teamName: Joi.string().trim().max(120).allow(null, ''),
  customerId: nullableObjectId,
  customerName: Joi.string().trim().max(200).allow(null, ''),
  projectId: nullableObjectId,
  projectName: Joi.string().trim().max(200).allow(null, ''),
  assetId: nullableObjectId,
  assetName: Joi.string().trim().max(200).allow(null, ''),
  jobId: nullableObjectId,
  jobNumber: Joi.string().trim().max(80).allow(null, ''),
  orderId: nullableObjectId,
  siteId: nullableObjectId,
  installationId: nullableObjectId,
  maintenanceId: nullableObjectId,
  sourceNotificationId: nullableObjectId,
  sourceWidgetSubmissionId: nullableObjectId,
};

export const listTicketsSchema = {
  query: cursorPagination.keys({
    q: Joi.string().trim().max(120).allow(''),
    status: Joi.string().valid(...FIELD_TICKET_STATUSES).allow(''),
    priority: Joi.string().valid(...FIELD_TICKET_PRIORITIES).allow(''),
    type: Joi.string().valid(...FIELD_TICKET_TYPES).allow(''),
    assignedTo: objectId.allow(''),
    teamId: objectId.allow(''),
    customerId: objectId.allow(''),
    projectId: objectId.allow(''),
    assetId: objectId.allow(''),
    jobId: objectId.allow(''),
    orderId: objectId.allow(''),
    siteId: objectId.allow(''),
    installationId: objectId.allow(''),
    maintenanceId: objectId.allow(''),
    overdue: Joi.boolean(),
    escalated: Joi.boolean(),
    dueFrom: Joi.date().iso(),
    dueTo: Joi.date().iso(),
  }),
};

export const ticketIdParamSchema = { params: idParam };

export const createTicketSchema = {
  body: Joi.object({
    ...baseTicketFields,
    title: baseTicketFields.title.required(),
  }),
};

export const updateTicketSchema = {
  params: idParam,
  body: Joi.object(baseTicketFields).min(1),
};

export const assignTicketSchema = {
  params: idParam,
  body: Joi.object({
    assignedTo: nullableObjectId,
    teamId: nullableObjectId,
    teamName: Joi.string().trim().max(120).allow(null, ''),
  }).or('assignedTo', 'teamId', 'teamName'),
};

export const changeTicketStatusSchema = {
  params: idParam,
  body: Joi.object({
    status: Joi.string().valid(...FIELD_TICKET_STATUSES).required(),
  }),
};

export const addTicketCommentSchema = {
  params: idParam,
  body: Joi.object({
    body: Joi.string().trim().min(1).max(5000).required(),
    visibility: Joi.string().valid(...FIELD_TICKET_COMMENT_VISIBILITY).default('INTERNAL'),
  }),
};

export const addTicketAttachmentSchema = {
  params: idParam,
  body: Joi.object({
    fileId: nullableObjectId,
    url: Joi.string().uri().max(1000).allow(null, ''),
    originalName: Joi.string().trim().max(255).allow(null, ''),
    mimeType: Joi.string().trim().max(120).allow(null, ''),
    sizeBytes: Joi.number().integer().min(0).default(0),
    kind: Joi.string().valid(...FIELD_TICKET_ATTACHMENT_KINDS).default('OTHER'),
  }).or('fileId', 'url'),
};
