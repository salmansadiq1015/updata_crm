import ScheduledNotification from './scheduledNotification.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

const ALLOWED_FILTERS = {
  status: 'exact',
  sourceEntityType: 'exact',
  sourceEntityId: 'objectId',
  notificationType: 'exact',
};

const ALLOWED_SORT_FIELDS = ['createdAt', 'nextDispatchAt', '_id'];

class ScheduledNotificationRepository {
  async create(data) {
    const scheduled = new ScheduledNotification(data);
    return scheduled.save();
  }

  async findById(id) {
    return ScheduledNotification.findById(id).lean();
  }

  async findDue(now) {
    return ScheduledNotification.find({
      status: 'ACTIVE',
      nextDispatchAt: { $lte: now },
    })
      .sort({ nextDispatchAt: 1 })
      .lean();
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {} }) {
    const safeSortBy = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt';

    const filter = {
      ...buildFilter(filters, ALLOWED_FILTERS),
      ...buildCursorQuery(cursor, safeSortBy, sortOrder),
    };

    const sort = buildCursorSort(safeSortBy, sortOrder);

    const docs = await ScheduledNotification.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, safeSortBy);
  }

  async updateById(id, data) {
    return ScheduledNotification.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    }).lean();
  }

  async softDelete(id) {
    return ScheduledNotification.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date(), status: 'CANCELLED' },
      { new: true },
    );
  }
}

const scheduledNotificationRepository = new ScheduledNotificationRepository();
export default scheduledNotificationRepository;
