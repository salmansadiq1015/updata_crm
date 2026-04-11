import PriceUpdateBatch from './priceUpdateBatch.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

const ALLOWED_FILTERS = {
  status: 'exact',
  type: 'exact',
};

class PriceUpdateBatchRepository {
  async create(data) {
    const batch = new PriceUpdateBatch(data);
    return batch.save();
  }

  async findById(id) {
    return PriceUpdateBatch.findById(id).lean();
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {} }) {
    const filter = {
      ...buildFilter(filters, ALLOWED_FILTERS),
      ...buildCursorQuery(cursor, sortBy, sortOrder),
    };

    const sort = buildCursorSort(sortBy, sortOrder);

    const docs = await PriceUpdateBatch.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, sortBy);
  }

  async updateStatus(id, status, additionalData = {}) {
    return PriceUpdateBatch.findByIdAndUpdate(
      id,
      { status, ...additionalData },
      { new: true, runValidators: true },
    ).lean();
  }

  async findPendingScheduled(beforeDate) {
    return PriceUpdateBatch.find({
      status: 'PENDING',
      scheduledDate: { $lte: beforeDate },
    }).lean();
  }
}

const priceUpdateBatchRepository = new PriceUpdateBatchRepository();
export default priceUpdateBatchRepository;
