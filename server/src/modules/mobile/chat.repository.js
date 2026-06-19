import ChatMessage from './chatMessage.model.js';

class ChatRepository {
  async create(data) {
    const message = new ChatMessage(data);
    return message.save();
  }

  async findByProjectId(projectId, { limit = 50, before } = {}) {
    const filter = { projectId, isDeleted: false };

    if (before) {
      filter.sentAt = { $lt: new Date(before) };
    }

    return ChatMessage.find(filter)
      .sort({ sentAt: -1 })
      .limit(limit)
      .lean();
  }

  async findById(messageId) {
    return ChatMessage.findOne({ _id: messageId, isDeleted: false }).lean();
  }

  async markAsRead(messageId, userId) {
    await ChatMessage.updateOne(
      { _id: messageId, 'readBy.userId': { $ne: userId }, isDeleted: false },
      { $push: { readBy: { userId, readAt: new Date() } } },
    );
  }
}

const chatRepository = new ChatRepository();
export default chatRepository;
