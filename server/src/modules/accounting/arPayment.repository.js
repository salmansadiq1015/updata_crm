import ArPayment from './arPayment.model.js';
import ArPaymentAllocation from './arPaymentAllocation.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';

class ArPaymentRepository {
  async create(data) {
    const payment = new ArPayment(data);
    return payment.save();
  }

  async findById(id) {
    return ArPayment.findById(id)
      .populate([
        { path: 'createdBy', select: 'firstName lastName email' },
      ])
      .lean();
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {} }) {
    const filter = { ...buildCursorQuery(cursor, sortBy, sortOrder) };

    if (filters.customerId) filter.customerId = filters.customerId;
    if (filters.source) filter.source = filters.source;
    if (filters.paymentDateFrom || filters.paymentDateTo) {
      filter.paymentDate = {};
      if (filters.paymentDateFrom) filter.paymentDate.$gte = new Date(filters.paymentDateFrom);
      if (filters.paymentDateTo) filter.paymentDate.$lte = new Date(filters.paymentDateTo);
    }

    const sort = buildCursorSort(sortBy, sortOrder);

    const docs = await ArPayment.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, sortBy);
  }

  async updateAllocatedAmount(id, newAllocated, newUnallocated) {
    return ArPayment.collection.updateOne(
      { _id: id },
      { $set: { allocatedAmount: newAllocated, unallocatedAmount: newUnallocated } },
    );
  }
}

class ArPaymentAllocationRepository {
  async create(data) {
    const allocation = new ArPaymentAllocation(data);
    return allocation.save();
  }

  async findByPaymentId(paymentId) {
    return ArPaymentAllocation.find({ paymentId }).lean();
  }

  async findByInvoiceId(invoiceId) {
    return ArPaymentAllocation.find({ invoiceId }).lean();
  }
}

export const arPaymentRepository = new ArPaymentRepository();
export const arPaymentAllocationRepository = new ArPaymentAllocationRepository();
export default arPaymentRepository;
