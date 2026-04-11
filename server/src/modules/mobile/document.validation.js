import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

export const listDocumentsSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const downloadDocumentSchema = {
  params: Joi.object({ docId: objectId.required() }),
};

export const uploadDocumentSchema = {
  params: Joi.object({ id: objectId.required() }),
};
