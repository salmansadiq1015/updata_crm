import NotificationDelivery from './notificationDelivery.model.js';
import mongoose from 'mongoose';

const HISTORY_SORT = { createdAt: -1, _id: -1 };

function toObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null;
}

function buildHistoryMatch(filters = {}) {
  const match = {};

  if (filters.channel) match.channel = filters.channel;
  if (filters.deliveryStatus) match.status = filters.deliveryStatus;
  if (filters.status) match.status = filters.status;

  const recipientId = filters.recipientId ? toObjectId(filters.recipientId) : null;
  if (recipientId) match.recipientId = recipientId;

  const dateFilter = {};
  if (filters.dateFrom) dateFilter.$gte = new Date(filters.dateFrom);
  if (filters.dateTo) dateFilter.$lte = new Date(filters.dateTo);
  if (Object.keys(dateFilter).length > 0) match.createdAt = dateFilter;

  return match;
}

function buildNotificationMatch(filters = {}) {
  const match = {};

  if (filters.type) match['notification.type'] = filters.type;
  if (filters.category) match['notification.category'] = filters.category;
  if (filters.notificationStatus) match['notification.status'] = filters.notificationStatus;
  if (filters.sourceModule) match['notification.sourceModule'] = filters.sourceModule;
  if (filters.sourceEntityType) match['notification.sourceEntityType'] = filters.sourceEntityType;

  const sourceEntityId = filters.sourceEntityId ? toObjectId(filters.sourceEntityId) : null;
  if (sourceEntityId) match['notification.sourceEntityId'] = sourceEntityId;

  if (filters.search && String(filters.search).trim()) {
    const escaped = String(filters.search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(escaped, 'i');
    match.$or = [
      { recipientEmail: pattern },
      { recipientPhone: pattern },
      { renderedSubject: pattern },
      { renderedBody: pattern },
      { 'notification.type': pattern },
      { 'notification.sourceModule': pattern },
    ];
  }

  return match;
}

function buildCursorMatch(cursor) {
  if (!cursor) return null;

  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8'));
    const cursorDate = decoded?.createdAt ? new Date(decoded.createdAt) : null;
    const cursorId = decoded?._id ? toObjectId(decoded._id) : null;
    if (!cursorDate || Number.isNaN(cursorDate.getTime()) || !cursorId) return null;

    return {
      $or: [
        { createdAt: { $lt: cursorDate } },
        { createdAt: cursorDate, _id: { $lt: cursorId } },
      ],
    };
  } catch {
    return null;
  }
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

class NotificationDeliveryRepository {
  async create(data) {
    const delivery = new NotificationDelivery(data);
    return delivery.save();
  }

  async createMany(dataArray) {
    return NotificationDelivery.insertMany(dataArray);
  }

  async findById(id) {
    return NotificationDelivery.findById(id).lean();
  }

  async findByNotificationId(notificationId) {
    return NotificationDelivery.find({ notificationId })
      .sort({ createdAt: -1 })
      .lean();
  }

  async findByRecipientId(recipientId, { channel, status, limit } = {}) {
    const filter = { recipientId };
    if (channel) filter.channel = channel;
    if (status) filter.status = status;

    const query = NotificationDelivery.find(filter)
      .sort({ createdAt: -1 });

    if (limit) query.limit(limit);

    return query.lean();
  }

  async updateById(id, data) {
    return NotificationDelivery.findByIdAndUpdate(id, data, {
      returnDocument: 'after',
      runValidators: true,
    }).lean();
  }

  async updateByProviderMessageId(providerMessageId, data) {
    return NotificationDelivery.findOneAndUpdate(
      { providerMessageId },
      data,
      { returnDocument: 'after', runValidators: true },
    ).lean();
  }

  async findRetryable(now) {
    return NotificationDelivery.find({
      status: 'FAILED',
      $expr: { $lt: ['$retryCount', '$maxRetries'] },
      nextRetryAt: { $lte: now },
    })
      .sort({ nextRetryAt: 1 })
      .lean();
  }

  async getMetrics(dateFrom, dateTo) {
    const match = {};
    if (dateFrom || dateTo) {
      match.createdAt = {};
      if (dateFrom) match.createdAt.$gte = new Date(dateFrom);
      if (dateTo) match.createdAt.$lte = new Date(dateTo);
    }

    return NotificationDelivery.aggregate([
      { $match: match },
      {
        $group: {
          _id: { channel: '$channel', status: '$status' },
          count: { $sum: 1 },
          avgLatencyMs: {
            $avg: {
              $cond: {
                if: { $and: [{ $ifNull: ['$sentAt', false] }, { $ifNull: ['$createdAt', false] }] },
                then: { $subtract: ['$sentAt', '$createdAt'] },
                else: null,
              },
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          channel: '$_id.channel',
          status: '$_id.status',
          count: 1,
          avgLatencyMs: { $round: ['$avgLatencyMs', 2] },
        },
      },
      { $sort: { channel: 1, status: 1 } },
    ]);
  }

  async getChannelStats(channel, period) {
    const match = { channel };
    if (period) {
      match.createdAt = { $gte: new Date(period) };
    }

    const results = await NotificationDelivery.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    const stats = { sent: 0, delivered: 0, failed: 0, bounced: 0 };
    for (const r of results) {
      const key = r._id?.toLowerCase();
      if (key in stats) stats[key] = r.count;
    }
    return stats;
  }

  async searchHistory({ cursor, limit = 25, filters = {} } = {}) {
    const match = buildHistoryMatch(filters);
    const cursorMatch = buildCursorMatch(cursor);
    const notificationMatch = buildNotificationMatch(filters);

    const pipeline = [
      { $match: cursorMatch ? { $and: [match, cursorMatch] } : match },
      {
        $lookup: {
          from: 'notifications',
          localField: 'notificationId',
          foreignField: '_id',
          as: 'notification',
        },
      },
      { $unwind: { path: '$notification', preserveNullAndEmptyArrays: true } },
    ];

    if (Object.keys(notificationMatch).length > 0) {
      pipeline.push({ $match: notificationMatch });
    }

    pipeline.push(
      { $sort: HISTORY_SORT },
      { $limit: limit + 1 },
      {
        $project: {
          __v: 0,
          'notification.__v': 0,
          'notification.payload': 0,
        },
      },
    );

    const docs = await NotificationDelivery.aggregate(pipeline);
    const hasNext = docs.length > limit;
    const data = hasNext ? docs.slice(0, limit) : docs;
    const last = data[data.length - 1];
    const nextCursor = hasNext && last
      ? Buffer.from(JSON.stringify({
        _id: last._id.toString(),
        createdAt: last.createdAt.toISOString(),
      })).toString('base64url')
      : null;

    return {
      data,
      pagination: { hasNext, nextCursor, limit },
    };
  }

  async findHistoryForExport(filters = {}, limit = 10000) {
    const result = await this.searchHistory({ filters, limit });
    return result.data;
  }

  async markStaleSentForReview(cutoffDate, channels = ['EMAIL', 'WHATSAPP']) {
    const result = await NotificationDelivery.updateMany(
      {
        channel: { $in: channels },
        status: 'SENT',
        reviewRequiredAt: null,
        sentAt: { $lte: cutoffDate },
      },
      {
        $set: {
          reviewRequiredAt: new Date(),
          reviewReason: 'DELIVERY_CALLBACK_TIMEOUT',
        },
      },
    );

    return result.modifiedCount || 0;
  }

  async countReviewRequired({ channel } = {}) {
    const filter = { reviewRequiredAt: { $ne: null } };
    if (channel) filter.channel = channel;
    return NotificationDelivery.countDocuments(filter);
  }

  async anonymizeRecipientHistory({ recipientId, email, phone } = {}) {
    const clauses = [];
    const objectId = recipientId ? toObjectId(recipientId) : null;

    if (objectId) clauses.push({ recipientId: objectId });
    if (email) clauses.push({ recipientEmail: { $regex: `^${escapeRegex(email)}$`, $options: 'i' } });
    if (phone) clauses.push({ recipientPhone: String(phone) });

    if (clauses.length === 0) return { matchedCount: 0, modifiedCount: 0 };

    const anonymizedAt = new Date();
    const result = await NotificationDelivery.updateMany(
      { $or: clauses },
      {
        $set: {
          recipientEmail: null,
          recipientPhone: null,
          renderedSubject: '[redacted]',
          renderedBody: '[redacted]',
          renderedBodyHtml: '[redacted]',
          'metadata.gdprAnonymizedAt': anonymizedAt,
          'metadata.gdprAnonymized': true,
        },
      },
    );

    return {
      matchedCount: result.matchedCount || 0,
      modifiedCount: result.modifiedCount || 0,
    };
  }

  async findPendingPush(recipientId, limit = 50) {
    return NotificationDelivery.find({
      recipientId,
      channel: 'PUSH',
      status: 'PENDING',
    })
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean();
  }
}

const notificationDeliveryRepository = new NotificationDeliveryRepository();
export default notificationDeliveryRepository;
