import mongoose from 'mongoose';
import ArPayment from './arPayment.model.js';
import ArPaymentAllocation from './arPaymentAllocation.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';

class ArPaymentRepository {
  async create(data, options = {}) {
    const payment = new ArPayment(data);
    return payment.save({ session: options.session });
  }

  async findById(id, options = {}) {
    return ArPayment.findById(id)
      .session(options.session || null)
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

  async applyAllocationDelta(id, amount, options = {}) {
    const paymentId = typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id;

    return ArPayment.collection.updateOne(
      { _id: paymentId, unallocatedAmount: { $gte: amount } },
      [
        {
          $set: {
            allocatedAmount: { $round: [{ $add: ['$allocatedAmount', amount] }, 2] },
            unallocatedAmount: { $round: [{ $subtract: ['$unallocatedAmount', amount] }, 2] },
          },
        },
      ],
      { session: options.session },
    );
  }

  async getCustomerCreditBalance(customerId, options = {}) {
    const normalizedCustomerId = typeof customerId === 'string'
      ? new mongoose.Types.ObjectId(customerId)
      : customerId;

    const [summary] = await ArPayment.aggregate([
      {
        $match: {
          customerId: normalizedCustomerId,
          unallocatedAmount: { $gt: 0 },
        },
      },
      {
        $group: {
          _id: '$currency',
          totalCredit: { $sum: '$unallocatedAmount' },
          paymentCount: { $sum: 1 },
          oldestCreditDate: { $min: '$paymentDate' },
        },
      },
      {
        $project: {
          _id: 0,
          currency: '$_id',
          totalCredit: { $round: ['$totalCredit', 2] },
          paymentCount: 1,
          oldestCreditDate: 1,
        },
      },
    ]).session(options.session || null);

    const payments = await ArPayment.find({
      customerId: normalizedCustomerId,
      unallocatedAmount: { $gt: 0 },
    })
      .session(options.session || null)
      .sort({ paymentDate: 1, _id: 1 })
      .limit(100)
      .select('_id paymentDate amount allocatedAmount unallocatedAmount currency paymentReference source bankAccountId bankTransactionId')
      .lean();

    return {
      customerId,
      currency: summary?.currency || payments[0]?.currency || 'CHF',
      totalCredit: summary?.totalCredit || 0,
      paymentCount: summary?.paymentCount || 0,
      oldestCreditDate: summary?.oldestCreditDate || null,
      payments,
    };
  }
}

class ArPaymentAllocationRepository {
  async create(data, options = {}) {
    const allocation = new ArPaymentAllocation(data);
    return allocation.save({ session: options.session });
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
