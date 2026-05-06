import PaymentBatch from './paymentBatch.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';

class PaymentBatchRepository {
  async create(data) {
    const batch = new PaymentBatch(data);
    return batch.save();
  }

  async findById(id) {
    return PaymentBatch.findById(id).lean();
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc' }) {
    const filter = {
      ...buildCursorQuery(cursor, sortBy, sortOrder),
    };

    const sort = buildCursorSort(sortBy, sortOrder);

    const docs = await PaymentBatch.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, sortBy);
  }

  async updateStatus(id, status, additionalData = {}) {
    return PaymentBatch.findByIdAndUpdate(
      id,
      { status, ...additionalData },
      { returnDocument: 'after', runValidators: true },
    ).lean();
  }
}

const paymentBatchRepository = new PaymentBatchRepository();
export default paymentBatchRepository;
