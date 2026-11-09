import mongoose from 'mongoose';
import ChatMessage from '../mobile/chatMessage.model.js';
import chatRoomRepository from './chatRoom.repository.js';
import ChatRoom from './chatRoom.model.js';
import User from '../auth/user.model.js';
import chatAccessService from './chatAccess.service.js';
import { NotFoundError, AuthorizationError } from '../../shared/errors/AppError.js';

function userIdOf(user) {
  return String(user?._id ?? user);
}

function missingMemberIds(room, memberIds) {
  const existing = new Set((room.members || []).map(member => String(member.userId?._id ?? member.userId)));
  return memberIds.filter(id => !existing.has(String(id)));
}

const chatRoomService = {
  async getOrCreateProjectRoom(projectId, user) {
    const participantIds = await chatAccessService.assertContextAccess({ projectId }, user);
    const room = await chatRoomRepository.findOrCreateProjectRoom(projectId, userIdOf(user), participantIds);
    await chatAccessService.hydrateRoomMembers(room._id, missingMemberIds(room, participantIds));
    return chatRoomRepository.findById(room._id);
  },

  /**
   * Resolve the chat for a task: a task linked to a project uses the project's
   * chat room; any other task gets its own dedicated TASK room. Members are the
   * creator + assignee(s).
   */
  async getOrCreateTaskRoom(task, user) {
    if (task.projectId) {
      const projectId = task.projectId._id || task.projectId;
      return this.getOrCreateProjectRoom(projectId, user);
    }
    const memberIds = [
      ...(task.assigneeIds || []).map((a) => String(a._id || a)),
      task.assigneeId ? String(task.assigneeId._id || task.assigneeId) : null,
      task.createdBy ? String(task.createdBy._id || task.createdBy) : null,
    ].filter(Boolean);
    const room = await chatRoomRepository.findOrCreateTaskRoom(task._id, userIdOf(user), memberIds, task.title);
    await chatAccessService.hydrateRoomMembers(room._id, missingMemberIds(room, [...new Set([...memberIds, userIdOf(user)])]));
    return chatRoomRepository.findById(room._id);
  },

  async getOrCreateDmRoom(userIdA, userIdB) {
    const target = await User.findOne({ _id: userIdB, isDeleted: false, status: 'active' }).select('_id').lean();
    if (!target) throw new NotFoundError('User', userIdB);
    return chatRoomRepository.findOrCreateDmRoom(userIdA, userIdB);
  },

  async listRoomsForUser(user) {
    const userId = userIdOf(user);
    const allRooms = await chatRoomRepository.findRoomsForUser(userId);
    const hasLeadRooms = allRooms.some(room => room.roomType === 'LEAD' || room.leadIds?.length);
    const canReadLeads = hasLeadRooms && await chatAccessService.canReadLeads(user);
    const rooms = allRooms.filter(room => !(room.roomType === 'LEAD' || room.leadIds?.length) || canReadLeads);
    if (!rooms.length) return [];
    const unread = await ChatMessage.aggregate([
      { $match: { roomId: { $in: rooms.map(room => room._id) }, senderId: { $ne: new mongoose.Types.ObjectId(userId) }, 'readBy.userId': { $ne: new mongoose.Types.ObjectId(userId) }, isDeleted: false } },
      { $group: { _id: '$roomId', count: { $sum: 1 } } },
    ]);
    const counts = new Map(unread.map(item => [String(item._id), item.count]));
    return rooms.map(room => ({ ...room, unreadCount: counts.get(String(room._id)) || 0 }));
  },

  async getRoomById(roomId) {
    const room = await chatRoomRepository.findById(roomId);
    if (!room) throw new NotFoundError('Chat room');
    return room;
  },

  async assertMembership(roomId, user) {
    const room = await chatRoomRepository.findById(roomId);
    if (!room || room.isActive === false) throw new NotFoundError('Chat room');
    const userId = userIdOf(user);
    const isLinkedProjectRoom = room.roomType === 'PROJECT' || room.roomType === 'ORDER';
    const participantIds = await chatAccessService.assertLinkedRoomAccess(room, user);

    if (isLinkedProjectRoom && participantIds.includes(userId)) {
      const isMember = room.members.some((m) => String(m.userId?._id ?? m.userId) === userId);
      if (!isMember) {
        await chatRoomRepository.addMember(roomId, userId);
        return chatRoomRepository.findById(roomId);
      }
      return room;
    }

    const isMember = room.members.some((m) => String(m.userId?._id ?? m.userId) === userId);
    if (!isMember) throw new AuthorizationError('You are not a member of this chat room');
    return room;
  },

  async blockUser(roomId, requester) {
    await this.assertMembership(roomId, requester);
    await chatRoomRepository.addBlock(roomId, userIdOf(requester));
  },

  async unblockUser(roomId, requester) {
    await this.assertMembership(roomId, requester);
    await chatRoomRepository.removeBlock(roomId, userIdOf(requester));
  },

  async createGroupRoom(name, creator, memberIds = [], projectId = null, orderId = null, description = null) {
    const creatorId = userIdOf(creator);
    const allowedMembers = await chatAccessService.assertRequestedMembersAllowed({ projectId, orderId }, memberIds, creator);
    const joinCode = String(Math.floor(1000 + Math.random() * 9000));
    const joinCodeExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const allMembers = [...new Set([String(creatorId), ...allowedMembers.map(String)])];
    const room = await ChatRoom.create({
      roomType: 'GROUP',
      name,
      description,
      createdBy: creatorId,
      admins: [creatorId],
      members: allMembers.map(id => ({ userId: id })),
      joinCode,
      joinCodeExpiresAt,
      isActive: true,
      ...(projectId && { projectId }),
      ...(orderId && { orderId }),
    });
    return chatRoomRepository.findById(room._id);
  },

  async joinByCode(joinCode, user) {
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
    await chatAccessService.assertLinkedRoomAccess(room, user);
    const userId = userIdOf(user);
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
    if (!room.members.some(member => String(member.userId?._id || member.userId) === String(userId))) throw new AuthorizationError('You are not a member of this chat room');
    await chatRoomRepository.removeMember(roomId, userId);
    if (room.roomType === 'LEAD') await ChatRoom.updateOne({ _id: roomId }, { $unset: { leadChatKey: 1 }, $inc: { __v: 1 } });
    global.io?.in(`user:${userId}`).socketsLeave(`room:${roomId}`);
  },

  async deleteRoom(roomId, userId) {
    const room = await chatRoomRepository.findById(roomId);
    if (!room) throw new NotFoundError('Chat room');
    if (!room.members.some(member => String(member.userId?._id || member.userId) === String(userId))) throw new AuthorizationError('You are not a member of this chat room');
    if (room.roomType === 'DM') {
      await chatRoomRepository.removeMember(roomId, userId);
      global.io?.in(`user:${userId}`).socketsLeave(`room:${roomId}`);
    } else {
      const isAdmin = room.admins?.some(a => String(a._id ?? a) === String(userId));
      if (!isAdmin) throw new AuthorizationError('Only admins can delete this group');
      await ChatRoom.findByIdAndUpdate(roomId, { $set: { isActive: false } });
      global.io?.to(`room:${roomId}`).emit('chat:room_deleted', { roomId });
    }
  },

  async refreshJoinCode(roomId, requesterId) {
    const room = await chatRoomRepository.findById(roomId);
    if (!room) {
      const err = new Error('Room not found');
      err.status = 404;
      throw err;
    }
    if (room.roomType !== 'GROUP') throw new AuthorizationError('Join codes are only available for group conversations');
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
