import ChatMessage from '../mobile/chatMessage.model.js';
import chatRoomRepository from './chatRoom.repository.js';
import chatRoomService from './chatRoom.service.js';
import chatAccessService from './chatAccess.service.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import { NotFoundError, AuthorizationError, ValidationError } from '../../shared/errors/AppError.js';

function userIdOf(user) {
  return String(user?._id ?? user);
}

function userNameOf(user) {
  return `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.email || 'Unknown';
}

function memberIdsFromRoom(room) {
  return [...new Set((room.members || [])
    .map((member) => String(member.userId?._id ?? member.userId))
    .filter(Boolean))];
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const chatMessageService = {
  async listMessages(roomId, user, { limit = 50, before } = {}) {
    await chatRoomService.assertMembership(roomId, user);
    const query = { roomId, isDeleted: false };
    if (before) query.sentAt = { $lt: new Date(before) };
    const messages = await ChatMessage.find(query)
      .sort({ sentAt: -1 })
      .limit(limit)
      .lean();
    return messages.reverse();
  },

  async sendMessage(roomId, data, sender) {
    const senderId = userIdOf(sender);
    const room = await chatRoomService.assertMembership(roomId, sender);
    // Check blocked
    const isBlocked = room.blockedBy?.some((id) => String(id) === senderId);
    if (isBlocked) throw new AuthorizationError('You are blocked in this room');

    let replyToSnippet = null;
    let replyToSenderName = null;
    if (data.replyToId) {
      const replyMsg = await ChatMessage.findById(data.replyToId).lean();
      if (!replyMsg || String(replyMsg.roomId) !== String(roomId)) {
        throw new ValidationError('Reply target must be in the same chat room', [
          { field: 'replyToId', message: 'Invalid reply target' },
        ]);
      }
      replyToSnippet = replyMsg.content?.slice(0, 200) || null;
      replyToSenderName = replyMsg.senderName || null;
    }

    const message = await ChatMessage.create({
      roomId,
      projectId: room.projectId || null,
      orderId: room.orderId || null,
      senderId,
      senderName: userNameOf(sender),
      messageType: data.messageType || 'TEXT',
      content: data.content || '',
      attachmentUrl: data.attachmentUrl || null,
      attachmentFileId: data.attachmentFileId || null,
      mentions: data.mentions || [],
      replyToId: data.replyToId || null,
      replyToSnippet,
      replyToSenderName,
      isViewOnce: data.isViewOnce || false,
      sentAt: new Date(),
    });

    await chatRoomRepository.updateLastMessage(roomId, {
      messageId: message._id,
      text: message.content?.slice(0, 200) || message.messageType,
      sentAt: message.sentAt,
    });

    // Emit to room
    global.io?.to(`room:${roomId}`).emit('chat:new_message', { roomId, message });
    // Notify each member's personal room for sidebar refresh
    const roomMemberIds = memberIdsFromRoom(room);
    if (roomMemberIds.length > 0) {
      roomMemberIds.forEach((memberId) => {
        global.io?.to(`user:${memberId}`).emit('chat:room_updated', {
          roomId,
          lastMessageText: message.content?.slice(0, 40) || message.messageType,
          lastMessageAt: message.sentAt,
        });
      });
    }

    const projectTeamIds = room.projectId || room.orderId
      ? await chatAccessService.assertLinkedRoomAccess(room, sender)
      : roomMemberIds;

    eventBus.publish(EVENT_TYPES.MOBILE_CHAT_MESSAGE_SENT, {
      messageId: message._id,
      projectId: room.projectId || null,
      orderId: room.orderId || null,
      roomId,
      senderId,
      senderName: message.senderName,
      messageType: message.messageType,
      content: message.content || '',
      projectTeamIds,
    }, { source: 'chat' });

    return message;
  },

  async searchMessages(user, {
    q,
    roomId,
    projectId,
    orderId,
    messageType,
    limit = 50,
    before,
  } = {}) {
    const queryText = String(q || '').trim();
    if (!queryText) return [];

    const query = {
      isDeleted: false,
      content: { $regex: escapeRegExp(queryText), $options: 'i' },
    };

    if (before) query.sentAt = { $lt: new Date(before) };
    if (messageType) query.messageType = messageType;

    if (roomId) {
      await chatRoomService.assertMembership(roomId, user);
      query.roomId = roomId;
    } else if (projectId || orderId) {
      await chatAccessService.assertContextAccess({ projectId, orderId }, user);
      if (projectId) query.projectId = projectId;
      if (orderId) query.orderId = orderId;
    } else {
      const rooms = await chatRoomRepository.findRoomsForUser(userIdOf(user));
      const roomIds = rooms.map((room) => room._id);
      if (roomIds.length === 0) return [];
      query.roomId = { $in: roomIds };
    }

    return ChatMessage.find(query)
      .sort({ sentAt: -1 })
      .limit(Math.min(Number(limit) || 50, 50))
      .populate('senderId', 'firstName lastName email avatarFileId')
      .populate('attachmentFileId', 'originalName mimeType sizeBytes url')
      .lean();
  },

  async addReaction(messageId, roomId, emoji, user, userName) {
    await chatRoomService.assertMembership(roomId, user);
    const message = await ChatMessage.findById(messageId);
    if (!message) throw new NotFoundError('Message');
    if (String(message.roomId) !== String(roomId)) throw new NotFoundError('Message');

    const userId = userIdOf(user);
    const existingIdx = message.reactions.findIndex(
      (r) => r.emoji === emoji && String(r.userId) === String(userId)
    );
    if (existingIdx >= 0) {
      message.reactions.splice(existingIdx, 1);
    } else {
      message.reactions.push({ emoji, userId, userName });
    }
    await message.save();

    global.io?.to(`room:${roomId}`).emit('chat:reaction_updated', {
      roomId, messageId, reactions: message.reactions,
    });
    return message.reactions;
  },

  async markRoomRead(roomId, user) {
    await chatRoomService.assertMembership(roomId, user);
    const userId = userIdOf(user);
    const now = new Date();
    await ChatMessage.updateMany(
      {
        roomId,
        senderId: { $ne: userId },
        isDeleted: false,
        'readBy.userId': { $ne: userId },
      },
      { $addToSet: { readBy: { userId, readAt: now } } }
    );
    global.io?.to(`room:${roomId}`).emit('chat:read', { roomId, userId, readAt: now });
  },

  async deleteMessage(messageId, requester) {
    const message = await ChatMessage.findById(messageId);
    if (!message) throw new NotFoundError('Message');
    await chatRoomService.assertMembership(message.roomId, requester);
    const requesterId = userIdOf(requester);
    if (String(message.senderId) !== String(requesterId)) {
      throw new AuthorizationError('You can only delete your own messages');
    }
    message.isDeleted = true;
    message.deletedAt = new Date();
    await message.save();
    global.io?.to(`room:${message.roomId}`).emit('chat:message_deleted', {
      roomId: message.roomId, messageId,
    });
    return message;
  },

  async editMessage(messageId, content, requester) {
    const message = await ChatMessage.findById(messageId);
    if (!message) throw new NotFoundError('Message');
    await chatRoomService.assertMembership(message.roomId, requester);
    const requesterId = userIdOf(requester);
    if (String(message.senderId) !== String(requesterId)) {
      throw new AuthorizationError('You can only edit your own messages');
    }
    if (message.messageType !== 'TEXT') throw new Error('Only TEXT messages can be edited');
    message.content = content;
    message.editedAt = new Date();
    await message.save();
    global.io?.to(`room:${message.roomId}`).emit('chat:message_edited', {
      roomId: message.roomId, messageId, content, editedAt: message.editedAt,
    });
    return message;
  },
};

export default chatMessageService;
