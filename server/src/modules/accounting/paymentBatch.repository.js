import PaymentBatch from './paymentBatch.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';

class PaymentBatchRepository {
  async create(data, options = {}) {
    const batch = new PaymentBatch(data);
    return batch.save({ session: options.session });
  }

  async findById(id, options = {}) {
    return PaymentBatch.findById(id)
      .session(options.session || null)
      .lean();
  }

  async findByBatchNumber(batchNumber, options = {}) {
    return PaymentBatch.findOne({ batchNumber })
      .session(options.session || null)
      .lean();
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

  async updateStatus(id, status, additionalData = {}, options = {}) {
    return PaymentBatch.findByIdAndUpdate(
      id,
      { status, ...additionalData },
      { returnDocument: 'after', runValidators: true, session: options.session },
    ).lean();
  }
}

const paymentBatchRepository = new PaymentBatchRepository();
export default paymentBatchRepository;
