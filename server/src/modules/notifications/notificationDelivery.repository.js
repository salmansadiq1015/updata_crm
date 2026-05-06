import NotificationDelivery from './notificationDelivery.model.js';

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
