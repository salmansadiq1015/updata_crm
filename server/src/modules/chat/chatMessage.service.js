import ChatMessage from '../mobile/chatMessage.model.js';
import chatRoomRepository from './chatRoom.repository.js';
import chatRoomService from './chatRoom.service.js';
import { NotFoundError, AuthorizationError } from '../../shared/errors/AppError.js';

const chatMessageService = {
  async listMessages(roomId, userId, { limit = 50, before } = {}) {
    await chatRoomService.assertMembership(roomId, userId);
    const query = { roomId, isDeleted: false };
    if (before) query.sentAt = { $lt: new Date(before) };
    const messages = await ChatMessage.find(query)
      .sort({ sentAt: -1 })
      .limit(limit)
      .lean();
    return messages.reverse();
  },

  async sendMessage(roomId, data, sender) {
    const room = await chatRoomService.assertMembership(roomId, sender._id);
    // Check blocked
    const isBlocked = room.blockedBy?.some((id) => String(id) === String(sender._id));
    if (isBlocked) throw new AuthorizationError('You are blocked in this room');

    let replyToSnippet = null;
    let replyToSenderName = null;
    if (data.replyToId) {
      const replyMsg = await ChatMessage.findById(data.replyToId).lean();
      if (replyMsg) {
        replyToSnippet = replyMsg.content?.slice(0, 200) || null;
        replyToSenderName = replyMsg.senderName || null;
      }
    }

    const message = await ChatMessage.create({
      roomId,
      projectId: room.projectId || null,
      senderId: sender._id,
      senderName: `${sender.firstName || ''} ${sender.lastName || ''}`.trim() || sender.email,
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
    if (room.members) {
      room.members.forEach((m) => {
        global.io?.to(`user:${m.userId}`).emit('chat:room_updated', {
          roomId,
          lastMessageText: message.content?.slice(0, 40) || message.messageType,
          lastMessageAt: message.sentAt,
        });
      });
    }

    return message;
  },

  async addReaction(messageId, roomId, emoji, userId, userName) {
    const message = await ChatMessage.findById(messageId);
    if (!message) throw new NotFoundError('Message');

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

  async markRoomRead(roomId, userId) {
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

  async deleteMessage(messageId, requesterId) {
    const message = await ChatMessage.findById(messageId);
    if (!message) throw new NotFoundError('Message');
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

  async editMessage(messageId, content, requesterId) {
    const message = await ChatMessage.findById(messageId);
    if (!message) throw new NotFoundError('Message');
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
