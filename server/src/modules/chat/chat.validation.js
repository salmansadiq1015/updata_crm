import Joi from 'joi';

export const roomIdParamSchema = {
  params: Joi.object({ roomId: Joi.string().hex().length(24).required() }),
};

export const messageParamSchema = {
  params: Joi.object({
    roomId: Joi.string().hex().length(24).required(),
    msgId: Joi.string().hex().length(24).required(),
  }),
};

export const listMessagesSchema = {
  params: Joi.object({ roomId: Joi.string().hex().length(24).required() }),
  query: Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(50),
    before: Joi.string().isoDate().optional(),
  }),
};

export const searchMessagesSchema = {
  query: Joi.object({
    q: Joi.string().trim().min(1).max(120).required(),
    roomId: Joi.string().hex().length(24).optional(),
    projectId: Joi.string().hex().length(24).optional(),
    orderId: Joi.string().hex().length(24).optional(),
    messageType: Joi.string().valid('TEXT', 'PHOTO', 'DOCUMENT', 'AUDIO', 'VIDEO', 'VIEW_ONCE').optional(),
    limit: Joi.number().integer().min(1).max(50).default(50),
    before: Joi.string().isoDate().optional(),
  }).oxor('roomId', 'projectId', 'orderId'),
};

export const sendMessageSchema = {
  params: Joi.object({ roomId: Joi.string().hex().length(24).required() }),
  body: Joi.object({
    messageType: Joi.string().valid('TEXT', 'PHOTO', 'DOCUMENT', 'AUDIO', 'VIDEO', 'VIEW_ONCE').default('TEXT'),
    content: Joi.string().max(5000).allow('').default(''),
    attachmentUrl: Joi.string().uri().optional().allow(null),
    attachmentFileId: Joi.string().hex().length(24).optional().allow(null),
    replyToId: Joi.string().hex().length(24).optional().allow(null),
    isViewOnce: Joi.boolean().default(false),
    mentions: Joi.array().items(Joi.string().hex().length(24)).default([]),
  }),
};

export const createDmSchema = {
  body: Joi.object({ targetUserId: Joi.string().hex().length(24).required() }),
};

export const reactionSchema = {
  params: Joi.object({
    roomId: Joi.string().hex().length(24).required(),
    msgId: Joi.string().hex().length(24).required(),
  }),
  body: Joi.object({ emoji: Joi.string().max(8).required() }),
};

export const editMessageSchema = {
  params: Joi.object({
    roomId: Joi.string().hex().length(24).required(),
    msgId: Joi.string().hex().length(24).required(),
  }),
  body: Joi.object({ content: Joi.string().max(5000).required() }),
};

export const createGroupRoomSchema = {
  body: Joi.object({
    name: Joi.string().max(100).required(),
    description: Joi.string().max(500).allow('', null).optional(),
    memberIds: Joi.array().items(Joi.string().hex().length(24)).default([]),
    projectId: Joi.string().hex().length(24).optional().allow(null),
    orderId: Joi.string().hex().length(24).optional().allow(null),
  }),
};

export const joinByCodeSchema = {
  body: Joi.object({
    joinCode: Joi.string().length(4).pattern(/^\d{4}$/).required(),
  }),
};
