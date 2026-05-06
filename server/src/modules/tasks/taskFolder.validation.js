import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

export const createTaskFolderSchema = {
  body: Joi.object({
    name: Joi.string().required().trim().max(200),
    color: Joi.string().trim().max(7).allow(null, '').optional(),
    icon: Joi.string().trim().max(50).allow(null, '').optional(),
    sortOrder: Joi.number().integer().min(0).optional(),
  }),
};

export const updateTaskFolderSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    name: Joi.string().trim().max(200),
    color: Joi.string().trim().max(7).allow(null, '').optional(),
    icon: Joi.string().trim().max(50).allow(null, '').optional(),
    sortOrder: Joi.number().integer().min(0),
  }).min(1),
};

export const folderIdParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const reorderFoldersSchema = {
  body: Joi.object({
    orderedIds: Joi.array().items(objectId.required()).min(1).max(50).required(),
  }),
};
