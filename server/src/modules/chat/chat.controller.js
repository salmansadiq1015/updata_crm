import chatRoomService from './chatRoom.service.js';
import chatMessageService from './chatMessage.service.js';

class ChatController {
  async listRooms(req, res, next) {
    try {
      const rooms = await chatRoomService.listRoomsForUser(req.user._id);
      return res.success({ data: rooms });
    } catch (err) { next(err); }
  }

  async createOrGetDmRoom(req, res, next) {
    try {
      const { targetUserId } = req.body;
      const room = await chatRoomService.getOrCreateDmRoom(req.user._id, targetUserId);
      return res.success({ data: room });
    } catch (err) { next(err); }
  }

  async getRoom(req, res, next) {
    try {
      await chatRoomService.assertMembership(req.params.roomId, req.user._id);
      const room = await chatRoomService.getRoomById(req.params.roomId);
      return res.success({ data: room });
    } catch (err) { next(err); }
  }

  async listMessages(req, res, next) {
    try {
      const { limit, before } = req._validatedQuery || req.query;
      const messages = await chatMessageService.listMessages(
        req.params.roomId,
        req.user._id,
        { limit: Number(limit) || 50, before }
      );
      return res.success({ data: messages });
    } catch (err) { next(err); }
  }

  async sendMessage(req, res, next) {
    try {
      const message = await chatMessageService.sendMessage(
        req.params.roomId,
        req.body,
        req.user
      );
      return res.success({ data: message }, 201);
    } catch (err) { next(err); }
  }

  async markRead(req, res, next) {
    try {
      await chatMessageService.markRoomRead(req.params.roomId, req.user._id);
      return res.success({ message: 'Marked as read' });
    } catch (err) { next(err); }
  }

  async addReaction(req, res, next) {
    try {
      const reactions = await chatMessageService.addReaction(
        req.params.msgId,
        req.params.roomId,
        req.body.emoji,
        req.user._id,
        `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim()
      );
      return res.success({ data: reactions });
    } catch (err) { next(err); }
  }

  async removeReaction(req, res, next) {
    try {
      const reactions = await chatMessageService.addReaction(
        req.params.msgId,
        req.params.roomId,
        req.body.emoji,
        req.user._id,
        ''
      ); // addReaction toggles, so calling it again removes
      return res.success({ data: reactions });
    } catch (err) { next(err); }
  }

  async deleteMessage(req, res, next) {
    try {
      await chatMessageService.deleteMessage(req.params.msgId, req.user._id);
      return res.success({ message: 'Deleted' });
    } catch (err) { next(err); }
  }

  async editMessage(req, res, next) {
    try {
      const message = await chatMessageService.editMessage(
        req.params.msgId,
        req.body.content,
        req.user._id
      );
      return res.success({ data: message });
    } catch (err) { next(err); }
  }

  async blockUser(req, res, next) {
    try {
      await chatRoomService.blockUser(req.params.roomId, req.user._id);
      return res.success({ message: 'Blocked' });
    } catch (err) { next(err); }
  }

  async unblockUser(req, res, next) {
    try {
      await chatRoomService.unblockUser(req.params.roomId, req.user._id);
      return res.success({ message: 'Unblocked' });
    } catch (err) { next(err); }
  }
}

export default new ChatController();
