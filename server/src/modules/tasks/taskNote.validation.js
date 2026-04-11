import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

export const listNotesSchema = {
  params: Joi.object({
    taskId: objectId.required(),
  }),
};

export const createNoteSchema = {
  params: Joi.object({
    taskId: objectId.required(),
  }),
  body: Joi.object({
    bodyHtml: Joi.string().required().max(10000),
  }),
};

export const updateNoteSchema = {
  params: Joi.object({
    taskId: objectId.required(),
    noteId: objectId.required(),
  }),
  body: Joi.object({
    bodyHtml: Joi.string().required().max(10000),
  }),
};

export const deleteNoteSchema = {
  params: Joi.object({
    taskId: objectId.required(),
    noteId: objectId.required(),
  }),
};
