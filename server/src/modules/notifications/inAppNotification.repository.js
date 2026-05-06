import InAppNotification from './inAppNotification.model.js';

class InAppNotificationRepository {
  async create(data) {
    const inApp = new InAppNotification(data);
    return inApp.save();
  }

  async findById(id) {
    return InAppNotification.findById(id).lean();
  }

  async findByUserId(userId, { cursor, limit = 50, category } = {}) {
    const filter = { userId, isDismissed: false };
    if (category) filter.category = category;

    if (cursor) {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8'));
      if (decoded) {
        filter.$or = [
          { sentAt: { $lt: new Date(decoded.sentAt) } },
          { sentAt: new Date(decoded.sentAt), _id: { $lt: decoded._id } },
        ];
      }
    }

    const docs = await InAppNotification.find(filter)
      .sort({ sentAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean();

    const hasNext = docs.length > limit;
    const data = hasNext ? docs.slice(0, limit) : docs;
    const nextCursor = hasNext && data.length > 0
      ? Buffer.from(JSON.stringify({
        _id: data[data.length - 1]._id.toString(),
        sentAt: data[data.length - 1].sentAt.toISOString(),
      })).toString('base64url')
      : null;

    return {
      data,
      pagination: { hasNext, nextCursor, limit },
    };
  }

  async countUnread(userId) {
    return InAppNotification.countDocuments({
      userId,
      isRead: false,
      isDismissed: false,
    });
  }

  async markRead(id, userId) {
    return InAppNotification.findOneAndUpdate(
      { _id: id, userId },
      { isRead: true },
      { returnDocument: 'after' },
    ).lean();
  }

  async markAllRead(userId) {
    const result = await InAppNotification.updateMany(
      { userId, isRead: false, isDismissed: false },
      { $set: { isRead: true } },
    );
    return result.modifiedCount;
  }

  async dismiss(id, userId) {
    return InAppNotification.findOneAndUpdate(
      { _id: id, userId },
      { isDismissed: true },
      { returnDocument: 'after' },
    ).lean();
  }

  async findByNotificationId(notificationId) {
    return InAppNotification.find({ notificationId }).lean();
  }
}

const inAppNotificationRepository = new InAppNotificationRepository();
export default inAppNotificationRepository;
