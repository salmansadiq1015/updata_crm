import InAppNotification from './inAppNotification.model.js';

const DEFAULT_SUMMARY = {
  total: 0,
  unread: 0,
  highPriority: 0,
  critical: 0,
  byCategory: {},
  pendingActions: [],
};

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

class InAppNotificationRepository {
  async create(data) {
    const inApp = new InAppNotification(data);
    return inApp.save();
  }

  async findById(id) {
    return InAppNotification.findById(id).lean();
  }

  async findByUserId(userId, { cursor, limit = 50, category, isRead, search } = {}) {
    const filter = { userId, isDismissed: false };
    const andFilters = [];

    if (category) filter.category = category;
    if (typeof isRead === 'boolean') filter.isRead = isRead;
    if (search && String(search).trim()) {
      const pattern = new RegExp(escapeRegex(search.trim()), 'i');
      andFilters.push({ $or: [{ title: pattern }, { body: pattern }] });
    }

    if (cursor) {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8'));
      if (decoded) {
        andFilters.push({ $or: [
          { sentAt: { $lt: new Date(decoded.sentAt) } },
          { sentAt: new Date(decoded.sentAt), _id: { $lt: decoded._id } },
        ] });
      }
    }

    if (andFilters.length > 0) filter.$and = andFilters;

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

  async getSummary(userId) {
    const [summary] = await InAppNotification.aggregate([
      { $match: { userId, isDismissed: false } },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                unread: { $sum: { $cond: [{ $eq: ['$isRead', false] }, 1, 0] } },
                highPriority: {
                  $sum: { $cond: [{ $in: ['$priority', ['HIGH', 'CRITICAL']] }, 1, 0] },
                },
                critical: { $sum: { $cond: [{ $eq: ['$priority', 'CRITICAL'] }, 1, 0] } },
              },
            },
          ],
          categories: [
            {
              $group: {
                _id: '$category',
                total: { $sum: 1 },
                unread: { $sum: { $cond: [{ $eq: ['$isRead', false] }, 1, 0] } },
              },
            },
          ],
          pendingActions: [
            {
              $match: {
                isRead: false,
                category: { $in: ['TASK', 'FINANCE', 'MAINTENANCE', 'DOCUMENT', 'PROJECT', 'SCHEDULING'] },
              },
            },
            {
              $addFields: {
                priorityRank: {
                  $switch: {
                    branches: [
                      { case: { $eq: ['$priority', 'CRITICAL'] }, then: 4 },
                      { case: { $eq: ['$priority', 'HIGH'] }, then: 3 },
                      { case: { $eq: ['$priority', 'NORMAL'] }, then: 2 },
                    ],
                    default: 1,
                  },
                },
              },
            },
            { $sort: { priorityRank: -1, sentAt: -1, _id: -1 } },
            { $limit: 5 },
            { $project: { priorityRank: 0, __v: 0 } },
          ],
        },
      },
    ]);

    if (!summary) return DEFAULT_SUMMARY;

    const totals = summary.totals?.[0] || {};
    const byCategory = {};
    for (const row of summary.categories || []) {
      if (row._id) byCategory[row._id] = { total: row.total || 0, unread: row.unread || 0 };
    }

    return {
      total: totals.total || 0,
      unread: totals.unread || 0,
      highPriority: totals.highPriority || 0,
      critical: totals.critical || 0,
      byCategory,
      pendingActions: summary.pendingActions || [],
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
