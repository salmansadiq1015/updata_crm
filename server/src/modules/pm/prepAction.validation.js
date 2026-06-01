import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

export const createPrepActionSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    actionType: Joi.string()
      .valid('FUNDING_APPLICATION', 'MATERIAL_ORDER', 'SCHEDULING', 'OTHER')
      .required(),
    title: Joi.string().required().trim().max(255),
    description: Joi.string().max(5000).allow(null, ''),
    isMandatory: Joi.boolean().default(false),
    dueDate: Joi.date().iso().allow(null),
    assignedToId: objectId.allow(null),
    externalReference: Joi.string().trim().max(255).allow(null, ''),
    fundingDetails: Joi.object({
      fundingBody: Joi.string().trim().max(255).allow(null, ''),
      applicationAmount: Joi.number().min(0).allow(null),
      approvedAmount: Joi.number().min(0).allow(null),
      submissionDate: Joi.date().iso().allow(null),
      expectedDecisionDate: Joi.date().iso().allow(null),
      fundingStatus: Joi.string()
        .valid('DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED')
        .default('DRAFT'),
    }).when('actionType', {
      is: 'FUNDING_APPLICATION',
      then: Joi.object(),
      otherwise: Joi.forbidden(),
    }),
    materialOrderDetails: Joi.object({
      supplier: Joi.string().trim().max(255).allow(null, ''),
      orderReference: Joi.string().trim().max(100).allow(null, ''),
      orderDate: Joi.date().iso().allow(null),
      expectedDeliveryDate: Joi.date().iso().allow(null),
      deliveryStatus: Joi.string()
        .valid('PENDING', 'ORDERED', 'PARTIALLY_DELIVERED', 'DELIVERED')
        .default('PENDING'),
      items: Joi.array().items(
        Joi.object({
          description: Joi.string().required().trim().max(500),
          quantity: Joi.number().required().min(0),
          unit: Joi.string().trim().max(20).default('Stk.'),
          catalogItemId: objectId.allow(null),
        }),
      ),
    }).when('actionType', {
      is: 'MATERIAL_ORDER',
      then: Joi.object(),
      otherwise: Joi.forbidden(),
    }),
  }),
};

export const updatePrepActionSchema = {
  params: Joi.object({ actionId: objectId.required() }),
  body: Joi.object({
    title: Joi.string().trim().max(255),
    description: Joi.string().max(5000).allow(null, ''),
    isMandatory: Joi.boolean(),
    status: Joi.string().valid('CREATED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED'),
    dueDate: Joi.date().iso().allow(null),
    assignedToId: objectId.allow(null),
    externalReference: Joi.string().trim().max(255).allow(null, ''),
    fundingDetails: Joi.object({
      fundingBody: Joi.string().trim().max(255).allow(null, ''),
      applicationAmount: Joi.number().min(0).allow(null),
      approvedAmount: Joi.number().min(0).allow(null),
      submissionDate: Joi.date().iso().allow(null),
      expectedDecisionDate: Joi.date().iso().allow(null),
      fundingStatus: Joi.string()
        .valid('DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED'),
    }),
    materialOrderDetails: Joi.object({
      supplier: Joi.string().trim().max(255).allow(null, ''),
      orderReference: Joi.string().trim().max(100).allow(null, ''),
      orderDate: Joi.date().iso().allow(null),
      expectedDeliveryDate: Joi.date().iso().allow(null),
      deliveryStatus: Joi.string()
        .valid('PENDING', 'ORDERED', 'PARTIALLY_DELIVERED', 'DELIVERED'),
      items: Joi.array().items(
        Joi.object({
          description: Joi.string().required().trim().max(500),
          quantity: Joi.number().required().min(0),
          unit: Joi.string().trim().max(20).default('Stk.'),
          catalogItemId: objectId.allow(null),
        }),
      ),
    }),
  }).min(1),
};

export const prepActionIdParamSchema = {
  params: Joi.object({ actionId: objectId.required() }),
};

export const prepActionAttachmentDownloadSchema = {
  params: Joi.object({
    id: objectId.required(),
    actionId: objectId.required(),
    fileId: objectId.required(),
  }),
};
