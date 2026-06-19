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
      await chatRoomService.assertMembership(req.params.roomId, req.user);
      const room = await chatRoomService.getRoomById(req.params.roomId);
      return res.success({ data: room });
    } catch (err) { next(err); }
  }

  async listMessages(req, res, next) {
    try {
      const { limit, before } = req._validatedQuery || req.query;
      const messages = await chatMessageService.listMessages(
        req.params.roomId,
        req.user,
        { limit: Number(limit) || 50, before }
      );
      return res.success({ data: messages });
    } catch (err) { next(err); }
  }

  async searchMessages(req, res, next) {
    try {
      const filters = req._validatedQuery || req.query;
      const messages = await chatMessageService.searchMessages(req.user, {
        ...filters,
        limit: Number(filters.limit) || 50,
      });
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
      await chatMessageService.markRoomRead(req.params.roomId, req.user);
      return res.success({ message: 'Marked as read' });
    } catch (err) { next(err); }
  }

  async addReaction(req, res, next) {
    try {
      const reactions = await chatMessageService.addReaction(
        req.params.msgId,
        req.params.roomId,
        req.body.emoji,
        req.user,
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
        req.user,
        ''
      ); // addReaction toggles, so calling it again removes
      return res.success({ data: reactions });
    } catch (err) { next(err); }
  }

  async deleteMessage(req, res, next) {
    try {
      await chatMessageService.deleteMessage(req.params.msgId, req.user);
      return res.success({ message: 'Deleted' });
    } catch (err) { next(err); }
  }

  async editMessage(req, res, next) {
    try {
      const message = await chatMessageService.editMessage(
        req.params.msgId,
        req.body.content,
        req.user
      );
      return res.success({ data: message });
    } catch (err) { next(err); }
  }

  async blockUser(req, res, next) {
    try {
      await chatRoomService.blockUser(req.params.roomId, req.user);
      return res.success({ message: 'Blocked' });
    } catch (err) { next(err); }
  }

  async unblockUser(req, res, next) {
    try {
      await chatRoomService.unblockUser(req.params.roomId, req.user);
      return res.success({ message: 'Unblocked' });
    } catch (err) { next(err); }
  }

  async createGroupRoom(req, res, next) {
    try {
      const { name, memberIds = [], projectId, orderId, description } = req.body;
      const room = await chatRoomService.createGroupRoom(
        name,
        req.user,
        memberIds,
        projectId,
        orderId,
        description,
      );
      res.success({ data: room, statusCode: 201 });
    } catch (err) { next(err); }
  }

  async joinByCode(req, res, next) {
    try {
      const { joinCode } = req.body;
      const room = await chatRoomService.joinByCode(joinCode, req.user);
      res.success({ data: room });
    } catch (err) { next(err); }
  }

  async leaveRoom(req, res, next) {
    try {
      await chatRoomService.leaveRoom(req.params.roomId, req.user._id);
      res.success({ message: 'Left room' });
    } catch (err) { next(err); }
  }

  async deleteRoom(req, res, next) {
    try {
      await chatRoomService.deleteRoom(req.params.roomId, req.user._id);
      res.success({ message: 'Deleted' });
    } catch (err) { next(err); }
  }

  async refreshJoinCode(req, res, next) {
    try {
      const result = await chatRoomService.refreshJoinCode(req.params.roomId, req.user._id);
      res.json(result);
    } catch (err) { next(err); }
  }
}

export default new ChatController();
