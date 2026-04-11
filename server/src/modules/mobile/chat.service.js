import chatRepository from './chat.repository.js';
import auditService from '../auth/audit.service.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

const CHAT_TTL = { l1Ttl: 10, l2Ttl: 30 };

class ChatService {
  async listMessages(projectId, { limit, before } = {}) {
    const cacheKey = `mobile:chat:${projectId}`;

    // Only cache the default first page (no before cursor)
    if (!before) {
      return cacheManager.getOrSet(
        cacheKey,
        () => chatRepository.findByProjectId(projectId, { limit, before }),
        CHAT_TTL,
      );
    }

    return chatRepository.findByProjectId(projectId, { limit, before });
  }

  async sendMessage(projectId, data, userId, meta = {}) {
    const message = await chatRepository.create({
      projectId,
      orderId: data.orderId || null,
      senderId: userId,
      senderName: data.senderName,
      messageType: data.messageType || 'TEXT',
      content: data.content,
      attachmentUrl: data.attachmentUrl || null,
      attachmentFileId: data.attachmentFileId || null,
      mentions: data.mentions || [],
      sentAt: new Date(),
    });

    await cacheManager.del(`mobile:chat:${projectId}`);

    eventBus.publish(EVENT_TYPES.MOBILE_CHAT_MESSAGE_SENT, {
      messageId: message._id,
      projectId,
      senderId: userId,
      senderName: data.senderName,
      messageType: message.messageType,
    }, { source: 'mobile:chat' });

    logger.info('Chat message sent', { module: 'mobile', action: 'chat.sendMessage', messageId: message._id, projectId });

    return message;
  }

  async markAsRead(messageId, userId, meta = {}) {
    await chatRepository.markAsRead(messageId, userId);
  }
}

const chatService = new ChatService();
export default chatService;
