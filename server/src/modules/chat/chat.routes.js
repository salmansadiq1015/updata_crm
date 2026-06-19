import { Router } from 'express';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { validate } from '../../shared/validation/validate.js';
import chatController from './chat.controller.js';
import {
  createDmSchema, roomIdParamSchema, listMessagesSchema,
  sendMessageSchema, messageParamSchema, reactionSchema, editMessageSchema,
  createGroupRoomSchema, joinByCodeSchema, searchMessagesSchema,
} from './chat.validation.js';

const router = Router();
router.use(authenticate);

router.get('/rooms', requirePermission('chat:read'), chatController.listRooms.bind(chatController));
router.get('/messages/search', requirePermission('chat:read'), validate(searchMessagesSchema), chatController.searchMessages.bind(chatController));
router.post('/rooms/dm', requirePermission('chat:write'), validate(createDmSchema), chatController.createOrGetDmRoom.bind(chatController));
router.post('/rooms/group', requirePermission('chat:write'), validate(createGroupRoomSchema), chatController.createGroupRoom.bind(chatController));
router.post('/rooms/join', requirePermission('chat:write'), validate(joinByCodeSchema), chatController.joinByCode.bind(chatController));
router.post('/rooms/:roomId/leave', requirePermission('chat:write'), validate(roomIdParamSchema), chatController.leaveRoom.bind(chatController));
router.delete('/rooms/:roomId', requirePermission('chat:write'), validate(roomIdParamSchema), chatController.deleteRoom.bind(chatController));
router.post('/rooms/:roomId/refresh-code', requirePermission('chat:write'), validate(roomIdParamSchema), chatController.refreshJoinCode.bind(chatController));
router.get('/rooms/:roomId', requirePermission('chat:read'), validate(roomIdParamSchema), chatController.getRoom.bind(chatController));
router.get('/rooms/:roomId/messages', requirePermission('chat:read'), validate(listMessagesSchema), chatController.listMessages.bind(chatController));
router.post('/rooms/:roomId/messages', requirePermission('chat:write'), validate(sendMessageSchema), chatController.sendMessage.bind(chatController));
router.put('/rooms/:roomId/read', requirePermission('chat:read'), validate(roomIdParamSchema), chatController.markRead.bind(chatController));
router.post('/rooms/:roomId/messages/:msgId/reactions', requirePermission('chat:write'), validate(reactionSchema), chatController.addReaction.bind(chatController));
router.delete('/rooms/:roomId/messages/:msgId/reactions', requirePermission('chat:write'), validate(reactionSchema), chatController.removeReaction.bind(chatController));
router.delete('/rooms/:roomId/messages/:msgId', requirePermission('chat:write'), validate(messageParamSchema), chatController.deleteMessage.bind(chatController));
router.patch('/rooms/:roomId/messages/:msgId', requirePermission('chat:write'), validate(editMessageSchema), chatController.editMessage.bind(chatController));
router.post('/rooms/:roomId/block', requirePermission('chat:write'), validate(roomIdParamSchema), chatController.blockUser.bind(chatController));
router.delete('/rooms/:roomId/block', requirePermission('chat:write'), validate(roomIdParamSchema), chatController.unblockUser.bind(chatController));

export default router;
