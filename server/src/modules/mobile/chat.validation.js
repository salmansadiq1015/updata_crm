import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

const MESSAGE_TYPES = ['TEXT', 'PHOTO', 'DOCUMENT'];

export const listMessagesSchema = {
  params: Joi.object({ id: objectId.required() }),
  query: Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(50),
    before: Joi.date().iso(),
  }),
};

export const sendMessageSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    messageType: Joi.string().valid(...MESSAGE_TYPES).default('TEXT'),
    content: Joi.string().max(5000).required(),
    attachmentUrl: Joi.string().allow('', null),
    mentions: Joi.array().items(objectId),
  }),
};

export const markReadSchema = {
  params: Joi.object({ messageId: objectId.required() }),
};
