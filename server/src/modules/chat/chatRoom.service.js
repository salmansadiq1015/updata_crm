import ChatMessage from '../mobile/chatMessage.model.js';
import chatRoomRepository from './chatRoom.repository.js';
import { NotFoundError, AuthorizationError } from '../../shared/errors/AppError.js';

const chatRoomService = {
  async getOrCreateProjectRoom(projectId, userId) {
    return chatRoomRepository.findOrCreateProjectRoom(projectId, userId);
  },

  async getOrCreateDmRoom(userIdA, userIdB) {
    return chatRoomRepository.findOrCreateDmRoom(userIdA, userIdB);
  },

  async listRoomsForUser(userId) {
    const rooms = await chatRoomRepository.findRoomsForUser(userId);
    // Enrich each room with unreadCount
    const enriched = await Promise.all(
      rooms.map(async (room) => {
        const unreadCount = await ChatMessage.countDocuments({
          roomId: room._id,
          senderId: { $ne: userId },
          'readBy.userId': { $ne: userId },
          isDeleted: false,
        });
        return { ...room, unreadCount };
      })
    );
    return enriched;
  },

  async getRoomById(roomId) {
    const room = await chatRoomRepository.findById(roomId);
    if (!room) throw new NotFoundError('Chat room');
    return room;
  },

  async assertMembership(roomId, userId) {
    const room = await chatRoomRepository.findById(roomId);
    if (!room) throw new NotFoundError('Chat room');
    const isMember = room.members.some((m) => String(m.userId) === String(userId));
    if (!isMember) throw new AuthorizationError('You are not a member of this chat room');
    return room;
  },

  async blockUser(roomId, requesterId) {
    await this.assertMembership(roomId, requesterId);
    await chatRoomRepository.addBlock(roomId, requesterId);
  },

  async unblockUser(roomId, requesterId) {
    await chatRoomRepository.removeBlock(roomId, requesterId);
  },
};

export default chatRoomService;
