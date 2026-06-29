import RecurringTransaction from './recurringTransaction.model.js';
import RecurringRun from './recurringRun.model.js';

class RecurringTransactionRepository {
  async create(data, options = {}) {
    const transaction = new RecurringTransaction(data);
    return transaction.save({ session: options.session });
  }

  async updateById(id, data, options = {}) {
    return RecurringTransaction.findByIdAndUpdate(id, data, {
      returnDocument: 'after',
      runValidators: true,
      session: options.session || null,
    }).lean();
  }

  async completeExecution(id, data, options = {}) {
    return RecurringTransaction.findByIdAndUpdate(
      id,
      {
        $inc: { runCount: 1 },
        $set: data,
      },
      {
        returnDocument: 'after',
        runValidators: true,
        session: options.session || null,
      },
    ).lean();
  }

  async findById(id, options = {}) {
    return RecurringTransaction.findById(id)
      .session(options.session || null)
      .lean();
  }

  async findWithFilters(filters = {}) {
    const query = {};
    if (filters.status) query.status = filters.status;
    if (filters.transactionType) query.transactionType = filters.transactionType;
    if (filters.nextRunFrom || filters.nextRunTo) {
      query.nextRunDate = {};
      if (filters.nextRunFrom) query.nextRunDate.$gte = new Date(filters.nextRunFrom);
      if (filters.nextRunTo) query.nextRunDate.$lte = new Date(filters.nextRunTo);
    }
    if (filters.search) {
      const pattern = new RegExp(String(filters.search).trim(), 'i');
      query.$or = [
        { recurringNumber: pattern },
        { name: pattern },
        { description: pattern },
      ];
    }

    return RecurringTransaction.find(query)
      .sort({ nextRunDate: 1, recurringNumber: 1 })
      .limit(filters.limit || 100)
      .lean();
  }

  async findDue({ asOfDate = new Date(), limit = 100 } = {}) {
    return RecurringTransaction.find({
      status: 'ACTIVE',
      nextRunDate: { $lte: new Date(asOfDate) },
      $and: [
        {
          $or: [
            { endDate: null },
            { $expr: { $gte: ['$endDate', '$nextRunDate'] } },
          ],
        },
        {
          $or: [
            { maxRuns: null },
            { $expr: { $lt: ['$runCount', '$maxRuns'] } },
          ],
        },
      ],
    })
      .sort({ nextRunDate: 1, recurringNumber: 1 })
      .limit(limit)
      .lean();
  }

  async summarize() {
    const [summary = {
      total: 0,
      activeCount: 0,
      pausedCount: 0,
      dueCount: 0,
    }] = await RecurringTransaction.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          activeCount: { $sum: { $cond: [{ $eq: ['$status', 'ACTIVE'] }, 1, 0] } },
          pausedCount: { $sum: { $cond: [{ $eq: ['$status', 'PAUSED'] }, 1, 0] } },
          dueCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', 'ACTIVE'] },
                    { $lte: ['$nextRunDate', new Date()] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);
    return summary;
  }

  async findRun(recurringTransactionId, periodKey, options = {}) {
    return RecurringRun.findOne({ recurringTransactionId, periodKey })
      .session(options.session || null)
      .lean();
  }

  async createRun(data, options = {}) {
    const run = new RecurringRun(data);
    return run.save({ session: options.session });
  }

  async updateRun(id, data, options = {}) {
    return RecurringRun.findByIdAndUpdate(id, data, {
      returnDocument: 'after',
      runValidators: true,
      session: options.session || null,
    }).lean();
  }

  async recentRuns(filters = {}) {
    const query = {};
    if (filters.recurringTransactionId) query.recurringTransactionId = filters.recurringTransactionId;
    if (filters.status) query.status = filters.status;
    return RecurringRun.find(query)
      .sort({ runDate: -1, createdAt: -1 })
      .limit(filters.limit || 50)
      .lean();
  }
}

const recurringTransactionRepository = new RecurringTransactionRepository();
export default recurringTransactionRepository;
