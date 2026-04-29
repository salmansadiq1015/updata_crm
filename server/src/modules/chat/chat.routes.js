import { Router } from 'express';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { validate } from '../../shared/validation/validate.js';
import chatController from './chat.controller.js';
import {
  createDmSchema, roomIdParamSchema, listMessagesSchema,
  sendMessageSchema, messageParamSchema, reactionSchema, editMessageSchema,
  createGroupRoomSchema, joinByCodeSchema,
} from './chat.validation.js';

const router = Router();
router.use(authenticate);

router.get('/rooms', chatController.listRooms.bind(chatController));
router.post('/rooms/dm', validate(createDmSchema), chatController.createOrGetDmRoom.bind(chatController));
router.post('/rooms/group', validate(createGroupRoomSchema), chatController.createGroupRoom.bind(chatController));
router.post('/rooms/join',  validate(joinByCodeSchema),       chatController.joinByCode.bind(chatController));
router.post('/rooms/:roomId/leave',        authenticate, chatController.leaveRoom.bind(chatController));
router.post('/rooms/:roomId/refresh-code', authenticate, chatController.refreshJoinCode.bind(chatController));
router.get('/rooms/:roomId', validate(roomIdParamSchema), chatController.getRoom.bind(chatController));
router.get('/rooms/:roomId/messages', validate(listMessagesSchema), chatController.listMessages.bind(chatController));
router.post('/rooms/:roomId/messages', validate(sendMessageSchema), chatController.sendMessage.bind(chatController));
router.put('/rooms/:roomId/read', validate(roomIdParamSchema), chatController.markRead.bind(chatController));
router.post('/rooms/:roomId/messages/:msgId/reactions', validate(reactionSchema), chatController.addReaction.bind(chatController));
router.delete('/rooms/:roomId/messages/:msgId/reactions', validate(reactionSchema), chatController.removeReaction.bind(chatController));
router.delete('/rooms/:roomId/messages/:msgId', validate(messageParamSchema), chatController.deleteMessage.bind(chatController));
router.patch('/rooms/:roomId/messages/:msgId', validate(editMessageSchema), chatController.editMessage.bind(chatController));
router.post('/rooms/:roomId/block', validate(roomIdParamSchema), chatController.blockUser.bind(chatController));
router.delete('/rooms/:roomId/block', validate(roomIdParamSchema), chatController.unblockUser.bind(chatController));

export default router;
