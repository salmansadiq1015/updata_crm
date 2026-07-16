import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

export const searchDocumentsSchema = {
  query: Joi.object({
    q: Joi.string().min(1).max(200),
    type: Joi.string().valid('quotation', 'order', 'invoice', 'all').default('all'),
    status: Joi.string(),
    customerId: objectId,
    projectId: objectId,
    siteId: objectId,
    departmentId: objectId,
    dateFrom: Joi.date().iso(),
    dateTo: Joi.date().iso(),
    amountMin: Joi.number(),
    amountMax: Joi.number(),
    assignedUserId: objectId,
    limit: Joi.number().integer().min(1).max(100).default(25),
    cursor: Joi.string().allow(''),
    sortBy: Joi.string().valid(
      'createdAt', 'documentNumber', 'customerName', 'status', 'grandTotalRounded', 'validUntil', 'dueDate',
    ).default('createdAt'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
  }),
};

export const customerDocumentsSchema = {
  params: Joi.object({
    customerId: objectId.required(),
  }),
};

export const projectDocumentsSchema = {
  params: Joi.object({
    projectId: objectId.required(),
  }),
};

export const invoiceAgingSchema = {
  query: Joi.object({
    departmentId: objectId,
    customerId: objectId,
  }),
};

export const quotationPipelineSchema = {
  query: Joi.object({
    departmentId: objectId,
    assignedUserId: objectId,
  }),
};
