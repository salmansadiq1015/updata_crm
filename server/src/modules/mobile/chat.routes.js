import { Router } from 'express';
import chatController from './chat.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  listMessagesSchema,
  sendMessageSchema,
  markReadSchema,
} from './chat.validation.js';

// Nested router for routes under /projects/:id/chat
const chatProjectRouter = Router({ mergeParams: true });

chatProjectRouter.get(
  '/',
  authenticate,
  requirePermission('mobile:read'),
  requirePermission('chat:read'),
  validate(listMessagesSchema),
  (req, res, next) => chatController.listMessages(req, res, next),
);

chatProjectRouter.get(
  '/members',
  authenticate,
  requirePermission('mobile:read'),
  requirePermission('chat:read'),
  (req, res, next) => chatController.listMembers(req, res, next),
);

chatProjectRouter.post(
  '/',
  authenticate,
  requirePermission('mobile:write'),
  requirePermission('chat:write'),
  validate(sendMessageSchema),
  (req, res, next) => chatController.sendMessage(req, res, next),
);

// Standalone router for routes under /chat
const chatRouter = Router();

chatRouter.put(
  '/:messageId/read',
  authenticate,
  requirePermission('mobile:write'),
  requirePermission('chat:read'),
  validate(markReadSchema),
  (req, res, next) => chatController.markAsRead(req, res, next),
);

export { chatProjectRouter, chatRouter };
