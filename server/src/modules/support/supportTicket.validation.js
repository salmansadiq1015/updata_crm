import Joi from 'joi';
import { objectId, cursorPagination, idParam } from '../../shared/validation/commonSchemas.js';
import {
  SUPPORT_TICKET_TYPES,
  SUPPORT_TICKET_STATUSES,
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_ORIGIN_PLATFORMS,
} from './supportTicket.model.js';

export const listTicketsSchema = {
  query: cursorPagination.keys({
    q: Joi.string().trim().max(120).allow(''),
    status: Joi.string().valid(...SUPPORT_TICKET_STATUSES).allow(''),
    priority: Joi.string().valid(...SUPPORT_TICKET_PRIORITIES).allow(''),
    type: Joi.string().valid(...SUPPORT_TICKET_TYPES).allow(''),
    submittedBy: objectId.allow(''),
    assignedTo: objectId.allow(''),
  }),
};

export const ticketIdParamSchema = { params: idParam };

export const createTicketSchema = {
  body: Joi.object({
    type: Joi.string().valid(...SUPPORT_TICKET_TYPES).default('bug'),
    subject: Joi.string().trim().min(1).max(200).required(),
    description: Joi.string().trim().max(5000).required(),
    priority: Joi.string().valid(...SUPPORT_TICKET_PRIORITIES).default('normal'),
    originPlatform: Joi.string().valid(...SUPPORT_ORIGIN_PLATFORMS).default('unknown'),
    originUrl: Joi.string().trim().max(2000).allow(null, ''),
    originViewport: Joi.string().trim().max(20).allow(null, ''),
  }),
};

export const updateTicketSchema = {
  params: idParam,
  body: Joi.object({
    status: Joi.string().valid(...SUPPORT_TICKET_STATUSES),
    priority: Joi.string().valid(...SUPPORT_TICKET_PRIORITIES),
    assignedTo: objectId.allow(null),
  }).min(1),
};
