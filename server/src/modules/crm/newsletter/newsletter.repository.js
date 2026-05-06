import Newsletter from './newsletter.model.js';
import NewsletterDelivery from './newsletterDelivery.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../../shared/utils/pagination.js';
import { buildFilter } from '../../../shared/utils/queryBuilder.js';

const ALLOWED_FILTERS = {
  status: 'exact',
};

const ALLOWED_SORT_FIELDS = ['createdAt', 'subject', 'scheduledAt', '_id'];

class NewsletterRepository {
  async create(data) {
    const newsletter = new Newsletter(data);
    return newsletter.save();
  }

  async findById(id) {
    return Newsletter.findById(id)
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email')
      .lean();
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {}, search }) {
    const filter = {
      ...buildFilter(filters, ALLOWED_FILTERS),
      ...buildCursorQuery(cursor, sortBy, sortOrder),
    };

    if (search) {
      filter.$or = [
        { subject: { $regex: search, $options: 'i' } },
      ];
    }

    const sort = buildCursorSort(sortBy, sortOrder);

    const docs = await Newsletter.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .populate('createdBy', 'firstName lastName email')
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, sortBy);
  }

  async updateById(id, data) {
    return Newsletter.findByIdAndUpdate(id, data, {
      returnDocument: 'after',
      runValidators: true,
    })
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email')
      .lean();
  }

  async softDelete(id) {
    return Newsletter.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { returnDocument: 'after' },
    );
  }

  /**
   * Aggregate delivery stats and update the newsletter document.
   */
  async updateStats(newsletterId) {
    const pipeline = [
      { $match: { newsletterId: Newsletter.base.Types.ObjectId.createFromHexString(newsletterId.toString()) } },
      {
        $group: {
          _id: null,
          sent: { $sum: { $cond: [{ $in: ['$status', ['sent', 'delivered', 'opened']] }, 1, 0] } },
          delivered: { $sum: { $cond: [{ $in: ['$status', ['delivered', 'opened']] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
          opened: { $sum: { $cond: [{ $eq: ['$status', 'opened'] }, 1, 0] } },
        },
      },
    ];

    const [result] = await NewsletterDelivery.aggregate(pipeline);

    const stats = result
      ? { sent: result.sent, delivered: result.delivered, failed: result.failed, opened: result.opened }
      : { sent: 0, delivered: 0, failed: 0, opened: 0 };

    return Newsletter.findByIdAndUpdate(
      newsletterId,
      { $set: { stats } },
      { returnDocument: 'after' },
    ).lean();
  }

  /**
   * Get delivery stats by aggregation (fresh, no cache).
   */
  async getDeliveryStats(newsletterId) {
    const pipeline = [
      { $match: { newsletterId: Newsletter.base.Types.ObjectId.createFromHexString(newsletterId.toString()) } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ];

    const results = await NewsletterDelivery.aggregate(pipeline);
    const stats = { total: 0, pending: 0, sent: 0, delivered: 0, failed: 0, opened: 0 };

    for (const row of results) {
      stats[row._id] = row.count;
      stats.total += row.count;
    }

    return stats;
  }
}

const newsletterRepository = new NewsletterRepository();
export default newsletterRepository;
