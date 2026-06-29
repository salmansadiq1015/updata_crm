import Budget from './budget.model.js';
import JournalEntry from './journalEntry.model.js';

class BudgetRepository {
  async create(data, options = {}) {
    const budget = new Budget(data);
    return budget.save({ session: options.session });
  }

  async updateById(id, data, options = {}) {
    return Budget.findByIdAndUpdate(id, data, {
      returnDocument: 'after',
      runValidators: true,
      session: options.session || null,
    }).lean();
  }

  async findById(id, options = {}) {
    return Budget.findById(id)
      .session(options.session || null)
      .lean();
  }

  async findWithFilters(filters = {}) {
    const query = {};
    if (filters.status) query.status = filters.status;
    if (filters.currency) query.currency = filters.currency;
    if (filters.startDate || filters.endDate) {
      query.startDate = {};
      if (filters.startDate) query.startDate.$gte = new Date(filters.startDate);
      if (filters.endDate) query.startDate.$lte = new Date(filters.endDate);
    }
    if (filters.search) {
      const pattern = new RegExp(String(filters.search).trim(), 'i');
      query.$or = [
        { budgetNumber: pattern },
        { name: pattern },
      ];
    }

    return Budget.find(query)
      .sort({ startDate: -1, budgetNumber: 1 })
      .limit(filters.limit || 100)
      .lean();
  }

  async summarize(filters = {}) {
    const match = {};
    if (filters.currency) match.currency = filters.currency;
    if (filters.status) match.status = filters.status;
    const [summary = {
      totalBudget: 0,
      count: 0,
      approvedCount: 0,
      lockedCount: 0,
    }] = await Budget.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalBudget: { $sum: '$totalBudget' },
          count: { $sum: 1 },
          approvedCount: {
            $sum: { $cond: [{ $in: ['$status', ['APPROVED', 'LOCKED']] }, 1, 0] },
          },
          lockedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'LOCKED'] }, 1, 0] },
          },
        },
      },
    ]);
    return summary;
  }

  async aggregateMonthlyActuals({ accountIds = [], startDate, endDate, currency = 'CHF' } = {}) {
    if (!accountIds.length) return [];
    const match = {
      currency,
      entryDate: { $gte: new Date(startDate), $lte: new Date(endDate) },
      $or: [
        { debitAccountId: { $in: accountIds } },
        { creditAccountId: { $in: accountIds } },
      ],
    };

    const [result = { debits: [], credits: [] }] = await JournalEntry.aggregate([
      { $match: match },
      {
        $facet: {
          debits: [
            { $match: { debitAccountId: { $in: accountIds } } },
            {
              $group: {
                _id: {
                  accountId: '$debitAccountId',
                  month: { $dateToString: { format: '%Y-%m', date: '$entryDate' } },
                },
                total: { $sum: '$amount' },
              },
            },
          ],
          credits: [
            { $match: { creditAccountId: { $in: accountIds } } },
            {
              $group: {
                _id: {
                  accountId: '$creditAccountId',
                  month: { $dateToString: { format: '%Y-%m', date: '$entryDate' } },
                },
                total: { $sum: '$amount' },
              },
            },
          ],
        },
      },
    ]);

    const rows = new Map();
    for (const row of result.debits || []) {
      const key = `${row._id.accountId}:${row._id.month}`;
      rows.set(key, {
        accountId: row._id.accountId,
        month: row._id.month,
        debit: row.total,
        credit: 0,
      });
    }
    for (const row of result.credits || []) {
      const key = `${row._id.accountId}:${row._id.month}`;
      rows.set(key, {
        ...(rows.get(key) || { accountId: row._id.accountId, month: row._id.month, debit: 0 }),
        credit: row.total,
      });
    }
    return [...rows.values()];
  }
}

const budgetRepository = new BudgetRepository();
export default budgetRepository;
