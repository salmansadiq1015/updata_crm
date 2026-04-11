import ChatMessage from './chatMessage.model.js';

class ChatRepository {
  async create(data) {
    const message = new ChatMessage(data);
    return message.save();
  }

  async findByProjectId(projectId, { limit = 50, before } = {}) {
    const filter = { projectId };

    if (before) {
      filter.sentAt = { $lt: new Date(before) };
    }

    return ChatMessage.find(filter)
      .sort({ sentAt: -1 })
      .limit(limit)
      .lean();
  }

  async markAsRead(messageId, userId) {
    // No-op — read tracking deferred to Phase B
  }
}

const chatRepository = new ChatRepository();
export default chatRepository;
