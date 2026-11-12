import mongoose from 'mongoose';
import InAppNotification from './inAppNotification.model.js';
import { ValidationError } from '../../shared/errors/AppError.js';

const DEFAULT_SUMMARY = {
  total: 0,
  unread: 0,
  highPriority: 0,
  critical: 0,
  byCategory: {},
  pendingActions: [],
};

const PENDING_ACTION_LIMIT = 5;
const PENDING_ACTION_CATEGORIES = ['TASK', 'FINANCE', 'MAINTENANCE', 'DOCUMENT', 'PROJECT', 'SCHEDULING'];
// Rank order of the original $switch: CRITICAL(4) > HIGH(3) > NORMAL(2) > everything else(1).
// The last bucket covers LOW and null/missing — the only other values the schema enum allows.
const PENDING_PRIORITY_BUCKETS = ['CRITICAL', 'HIGH', 'NORMAL', { $in: ['LOW', null] }];

function toObjectId(value) {
  if (value instanceof mongoose.Types.ObjectId) return value;
  const id = String(value?._id ?? value);
  return mongoose.isValidObjectId(id) && /^[a-f\d]{24}$/i.test(id) ? new mongoose.Types.ObjectId(id) : value;
}

function decodeCursor(cursor) {
  try {
    const decoded = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf-8'));
    const sentAt = new Date(decoded?.sentAt);
    if (!decoded || Number.isNaN(sentAt.getTime()) || !/^[a-f\d]{24}$/i.test(String(decoded._id))) throw new Error('bad cursor');
    return { sentAt, _id: new mongoose.Types.ObjectId(String(decoded._id)) };
  } catch {
    throw new ValidationError('Invalid cursor', [{ field: 'cursor', message: 'Cursor is malformed or expired' }]);
  }
}

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
      const decoded = decodeCursor(cursor);
      // Keyset on (sentAt desc, _id desc). The redundant `sentAt <= cursor` bound lets the
      // planner seek straight to the page start in the feed_*_cursor indexes.
      filter.sentAt = { $lte: decoded.sentAt };
      andFilters.push({ $or: [
        { sentAt: { $lt: decoded.sentAt } },
        { sentAt: decoded.sentAt, _id: { $lt: decoded._id } },
      ] });
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

  /**
   * Feed summary. One covered aggregation over the `feed_summary_pending` index
   * (no document fetch) yields total / unread / priority / per-category counts;
   * the top-5 pending actions are read per priority bucket in rank order, each an
   * index-ordered (sentAt desc, _id desc) scan that stops after `limit` hits.
   */
  async getSummary(userId) {
    const uid = toObjectId(userId);
    const [groups, pendingActions] = await Promise.all([
      InAppNotification.aggregate([
        { $match: { userId: uid, isDismissed: false } },
        { $project: { _id: 0, category: 1, isRead: 1, priority: 1 } },
        {
          $group: {
            _id: { category: '$category', isRead: '$isRead', priority: '$priority' },
            count: { $sum: 1 },
          },
        },
      ]),
      this._pendingActions(uid),
    ]);

    if (!groups?.length) return { ...DEFAULT_SUMMARY, byCategory: {}, pendingActions: [] };

    const summary = { total: 0, unread: 0, highPriority: 0, critical: 0, byCategory: {}, pendingActions };
    for (const { _id: key = {}, count = 0 } of groups) {
      const unread = key.isRead === false ? count : 0;
      summary.total += count;
      summary.unread += unread;
      if (key.priority === 'HIGH' || key.priority === 'CRITICAL') summary.highPriority += count;
      if (key.priority === 'CRITICAL') summary.critical += count;
      if (key.category) {
        const row = summary.byCategory[key.category] || { total: 0, unread: 0 };
        row.total += count;
        row.unread += unread;
        summary.byCategory[key.category] = row;
      }
    }
    return summary;
  }

  async _pendingActions(userId, limit = PENDING_ACTION_LIMIT) {
    const results = [];
    for (const priority of PENDING_PRIORITY_BUCKETS) {
      const remaining = limit - results.length;
      if (remaining <= 0) break;
      const rows = await InAppNotification.find({
        userId,
        isDismissed: false,
        isRead: false,
        priority,
        category: { $in: PENDING_ACTION_CATEGORIES },
      })
        .select('-__v')
        .sort({ sentAt: -1, _id: -1 })
        .limit(remaining)
        .lean();
      results.push(...rows);
    }
    return results;
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
