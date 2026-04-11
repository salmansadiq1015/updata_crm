import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

const PRIORITIES = ['NORMAL', 'HIGH', 'URGENT'];

export const createSmallOrderSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    title: Joi.string().max(255).required(),
    description: Joi.string().max(5000).allow('', null),
    assignedTo: objectId.required(),
    priority: Joi.string().valid(...PRIORITIES).default('NORMAL'),
    dueDate: Joi.date().iso(),
  }),
};

export const updateSmallOrderSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    title: Joi.string().max(255),
    description: Joi.string().max(5000).allow('', null),
    priority: Joi.string().valid(...PRIORITIES),
    dueDate: Joi.date().iso(),
  }).min(1),
};

export const cancelSmallOrderSchema = {
  params: Joi.object({ id: objectId.required() }),
};
