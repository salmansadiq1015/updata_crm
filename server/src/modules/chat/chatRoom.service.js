import ChatMessage from '../mobile/chatMessage.model.js';
import chatRoomRepository from './chatRoom.repository.js';
import ChatRoom from './chatRoom.model.js';
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

  async createGroupRoom(name, creatorId, memberIds = []) {
    const joinCode = String(Math.floor(1000 + Math.random() * 9000));
    const joinCodeExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const allMembers = [...new Set([String(creatorId), ...memberIds.map(String)])];
    const room = await ChatRoom.create({
      roomType: 'GROUP',
      name,
      createdBy: creatorId,
      admins: [creatorId],
      members: allMembers.map(id => ({ userId: id })),
      joinCode,
      joinCodeExpiresAt,
      isActive: true,
    });
    return chatRoomRepository.findById(room._id);
  },

  async joinByCode(joinCode, userId) {
    const room = await chatRoomRepository.findByJoinCode(joinCode);
    if (!room) {
      const err = new Error('Invalid or expired join code');
      err.status = 404;
      throw err;
    }
    if (room.roomType !== 'GROUP') {
      const err = new Error('Code is not for a group room');
      err.status = 400;
      throw err;
    }
    if (room.joinCodeExpiresAt && new Date(room.joinCodeExpiresAt) < new Date()) {
      const err = new Error('Join code has expired');
      err.status = 410;
      throw err;
    }
    const alreadyMember = room.members.some(m => String(m.userId?._id || m.userId) === String(userId));
    if (!alreadyMember) await chatRoomRepository.addMember(room._id, userId);
    return chatRoomRepository.findById(room._id);
  },

  async leaveRoom(roomId, userId) {
    const room = await chatRoomRepository.findById(roomId);
    if (!room) {
      const err = new Error('Room not found');
      err.status = 404;
      throw err;
    }
    await chatRoomRepository.removeMember(roomId, userId);
  },

  async refreshJoinCode(roomId, requesterId) {
    const room = await chatRoomRepository.findById(roomId);
    if (!room) {
      const err = new Error('Room not found');
      err.status = 404;
      throw err;
    }
    const isAdmin = room.admins?.some(a => String(a._id || a) === String(requesterId));
    if (!isAdmin) {
      const err = new Error('Only admins can refresh the join code');
      err.status = 403;
      throw err;
    }
    const joinCode = String(Math.floor(1000 + Math.random() * 9000));
    const joinCodeExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await ChatRoom.findByIdAndUpdate(roomId, { $set: { joinCode, joinCodeExpiresAt } });
    return { joinCode, joinCodeExpiresAt };
  },
};

export default chatRoomService;
