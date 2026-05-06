import Notification from './notification.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

const ALLOWED_FILTERS = {
  type: 'exact',
  category: 'exact',
  status: 'exact',
  sourceModule: 'exact',
  sourceEntityType: 'exact',
  sourceEntityId: 'objectId',
  recipientId: 'in',
  dateFrom: 'dateFrom',
  dateTo: 'dateTo',
};

const ALLOWED_SORT_FIELDS = ['createdAt', '_id'];

class NotificationRepository {
  async create(data) {
    const notification = new Notification(data);
    return notification.save();
  }

  async findById(id) {
    return Notification.findById(id).lean();
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {} }) {
    const mappedFilters = { ...filters };

    // Map recipientId to recipientIds array field
    if (mappedFilters.recipientId) {
      mappedFilters.recipientId = undefined;
      mappedFilters.recipientIds = { $in: filters.recipientId.split(',').map((v) => v.trim()) };
    }

    // Map dateFrom/dateTo to createdAt range
    const dateFilter = {};
    if (mappedFilters.dateFrom) {
      dateFilter.$gte = new Date(mappedFilters.dateFrom);
      delete mappedFilters.dateFrom;
    }
    if (mappedFilters.dateTo) {
      dateFilter.$lte = new Date(mappedFilters.dateTo);
      delete mappedFilters.dateTo;
    }

    const safeSortBy = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt';

    const filter = {
      ...buildFilter(mappedFilters, ALLOWED_FILTERS),
      ...buildCursorQuery(cursor, safeSortBy, sortOrder),
    };

    if (Object.keys(dateFilter).length > 0) {
      filter.createdAt = { ...filter.createdAt, ...dateFilter };
    }

    // Handle recipientIds $in separately since buildFilter won't handle the mapped field
    if (mappedFilters.recipientIds) {
      filter.recipientIds = mappedFilters.recipientIds;
    }

    const sort = buildCursorSort(safeSortBy, sortOrder);

    const docs = await Notification.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, safeSortBy);
  }

  async updateById(id, data) {
    return Notification.findByIdAndUpdate(id, data, {
      returnDocument: 'after',
      runValidators: true,
    }).lean();
  }

  async updateStatus(id, status) {
    return Notification.findByIdAndUpdate(
      id,
      { status, ...(status === 'COMPLETED' ? { processedAt: new Date() } : {}) },
      { returnDocument: 'after', runValidators: true },
    ).lean();
  }

  async findByIdempotencyKey(key) {
    return Notification.findOne({ idempotencyKey: key }).lean();
  }

  async softDelete(id) {
    return Notification.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { returnDocument: 'after' },
    );
  }

  async countByFilters(filters = {}) {
    const mappedFilters = { ...filters };

    const dateFilter = {};
    if (mappedFilters.dateFrom) {
      dateFilter.$gte = new Date(mappedFilters.dateFrom);
      delete mappedFilters.dateFrom;
    }
    if (mappedFilters.dateTo) {
      dateFilter.$lte = new Date(mappedFilters.dateTo);
      delete mappedFilters.dateTo;
    }

    let recipientFilter;
    if (mappedFilters.recipientId) {
      recipientFilter = { $in: mappedFilters.recipientId.split(',').map((v) => v.trim()) };
      delete mappedFilters.recipientId;
    }

    const filter = buildFilter(mappedFilters, ALLOWED_FILTERS);

    if (Object.keys(dateFilter).length > 0) {
      filter.createdAt = dateFilter;
    }
    if (recipientFilter) {
      filter.recipientIds = recipientFilter;
    }

    return Notification.countDocuments(filter);
  }
}

const notificationRepository = new NotificationRepository();
export default notificationRepository;
