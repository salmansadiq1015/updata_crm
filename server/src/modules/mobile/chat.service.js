import chatRepository from './chat.repository.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import logger from '../../shared/logger/index.js';
import { NotFoundError } from '../../shared/errors/AppError.js';
import chatAccessService from '../chat/chatAccess.service.js';
import chatRoomRepository from '../chat/chatRoom.repository.js';
import chatRoomService from '../chat/chatRoom.service.js';

const CHAT_TTL = { l1Ttl: 10, l2Ttl: 30 };

function userIdOf(user) {
  return String(user?._id ?? user);
}

function userNameOf(user, fallback) {
  return `${user?.firstName || ''} ${user?.lastName || ''}`.trim()
    || user?.email
    || fallback
    || 'Unknown';
}

function memberIdsFromRoom(room) {
  return [...new Set((room.members || [])
    .map((member) => String(member.userId?._id ?? member.userId))
    .filter(Boolean))];
}

class ChatService {
  async listMessages(projectId, user, { limit, before } = {}) {
    await chatAccessService.assertContextAccess({ projectId }, user);
    const cacheKey = `mobile:chat:${projectId}`;

    if (!before) {
      return cacheManager.getOrSet(
        cacheKey,
        () => chatRepository.findByProjectId(projectId, { limit, before }),
        CHAT_TTL,
      );
    }

    return chatRepository.findByProjectId(projectId, { limit, before });
  }

  async listMembers(projectId, user) {
    return chatAccessService.listProjectMembers(projectId, user);
  }

  async sendMessage(projectId, data, user, meta = {}) {
    const senderId = userIdOf(user);
    const projectTeamIds = await chatAccessService.assertContextAccess({ projectId }, user);
    const room = await chatRoomService.getOrCreateProjectRoom(projectId, user);

    const message = await chatRepository.create({
      roomId: room._id,
      projectId,
      orderId: data.orderId || null,
      senderId,
      senderName: userNameOf(user, data.senderName),
      messageType: data.messageType || 'TEXT',
      content: data.content || '',
      attachmentUrl: data.attachmentUrl || null,
      attachmentFileId: data.attachmentFileId || null,
      mentions: data.mentions || [],
      sentAt: new Date(),
    });

    await cacheManager.del(`mobile:chat:${projectId}`);

    await chatRoomRepository.updateLastMessage(room._id, {
      messageId: message._id,
      text: (message.content || message.messageType).slice(0, 200),
      sentAt: message.sentAt || new Date(),
    });

    global.io?.to(`room:${room._id}`).emit('chat:new_message', { roomId: room._id, message });
    memberIdsFromRoom(room).forEach((memberId) => {
      global.io?.to(`user:${memberId}`).emit('chat:room_updated', {
        roomId: room._id,
        lastMessageText: (message.content || message.messageType).slice(0, 40),
        lastMessageAt: message.sentAt || new Date(),
      });
    });

    eventBus.publish(EVENT_TYPES.MOBILE_CHAT_MESSAGE_SENT, {
      messageId: message._id,
      projectId,
      orderId: message.orderId || null,
      roomId: room._id,
      senderId,
      senderName: message.senderName,
      messageType: message.messageType,
      content: message.content || '',
      projectTeamIds,
    }, { source: 'mobile:chat', correlationId: meta.correlationId });

    logger.info('Chat message sent', {
      module: 'mobile',
      action: 'chat.sendMessage',
      messageId: message._id,
      projectId,
    });

    return message;
  }

  async markAsRead(messageId, user, meta = {}) {
    const message = await chatRepository.findById(messageId);
    if (!message) throw new NotFoundError('Message', messageId);

    if (message.projectId) {
      await chatAccessService.assertContextAccess({ projectId: message.projectId }, user);
    } else if (message.roomId) {
      await chatRoomService.assertMembership(message.roomId, user);
    }

    await chatRepository.markAsRead(messageId, userIdOf(user));
    logger.info('Chat message marked as read', {
      module: 'mobile',
      action: 'chat.markAsRead',
      messageId,
      userId: userIdOf(user),
      ipAddress: meta.ipAddress,
    });
  }
}

const chatService = new ChatService();
export default chatService;
