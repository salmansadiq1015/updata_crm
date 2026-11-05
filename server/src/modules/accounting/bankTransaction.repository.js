import BankTransaction from './bankTransaction.model.js';
import mongoose from 'mongoose';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

const ALLOWED_FILTERS = {
  bankAccountId: 'objectId',
  currency: 'exact',
  transactionDateFrom: 'dateFrom',
  transactionDateTo: 'dateTo',
  reconciliationStatus: 'exact',
};

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : value;
}

class BankTransactionRepository {
  async analytics({ bankAccountId, currency = 'CHF', dateFrom, dateTo }) {
    const match = { currency, transactionDate: { $gte: new Date(dateFrom), $lte: new Date(dateTo) } };
    if (bankAccountId) match.bankAccountId = toObjectId(bankAccountId);
    const money = {
      count: { $sum: 1 },
      inflows: { $sum: { $cond: [{ $gt: ['$amount', 0] }, '$amount', 0] } },
      outflows: { $sum: { $cond: [{ $lt: ['$amount', 0] }, { $abs: '$amount' }, 0] } },
      net: { $sum: '$amount' },
    };
    const [result] = await BankTransaction.aggregate([
      { $match: match },
      { $facet: {
        totals: [{ $group: { _id: null, ...money, unmatched: { $sum: { $cond: [{ $eq: ['$reconciliationStatus', 'UNMATCHED'] }, 1, 0] } } } }],
        daily: [{ $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$transactionDate', timezone: 'UTC' } }, ...money } }, { $sort: { _id: 1 } }],
        statuses: [{ $group: { _id: '$reconciliationStatus', ...money } }],
        counterparties: [{ $group: { _id: { $ifNull: ['$payerPayeeName', ''] }, ...money } }, { $sort: { outflows: -1, inflows: -1 } }, { $limit: 6 }],
      } },
    ]);
    return {
      currency, dateFrom, dateTo,
      totals: result?.totals?.[0] || { count: 0, inflows: 0, outflows: 0, net: 0, unmatched: 0 },
      daily: (result?.daily || []).map(({ _id, ...row }) => ({ date: _id, ...row })),
      statuses: (result?.statuses || []).map(({ _id, ...row }) => ({ status: _id, ...row })),
      counterparties: (result?.counterparties || []).map(({ _id, ...row }) => ({ name: _id, ...row })),
    };
  }

  async create(data, options = {}) {
    const txn = new BankTransaction(data);
    return txn.save({ session: options.session });
  }

  async bulkCreate(records) {
    return BankTransaction.insertMany(records, { ordered: false });
  }

  async existsStatement(bankAccountId, statementId) {
    if (!statementId) return false;
    const existing = await BankTransaction.exists({ bankAccountId, statementId });
    return Boolean(existing);
  }

  async findById(id, options = {}) {
    return BankTransaction.findById(id)
      .session(options.session || null)
      .lean();
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {} }) {
    const mappedFilters = {};
    if (filters.currency) mappedFilters.currency = filters.currency;
    if (filters.bankAccountId) mappedFilters.bankAccountId = filters.bankAccountId;
    if (filters.transactionDateFrom) mappedFilters.transactionDateFrom = filters.transactionDateFrom;
    if (filters.transactionDateTo) mappedFilters.transactionDateTo = filters.transactionDateTo;
    if (filters.reconciliationStatus) mappedFilters.reconciliationStatus = filters.reconciliationStatus;

    const filter = {
      ...buildFilter(mappedFilters, ALLOWED_FILTERS),
      ...buildCursorQuery(cursor, sortBy, sortOrder),
    };

    // Remap dateFrom/dateTo to transactionDate field
    if (filter.transactionDateFrom || filter.transactionDateTo) {
      filter.transactionDate = {};
      if (filter.transactionDateFrom) {
        filter.transactionDate.$gte = filter.transactionDateFrom.$gte || filter.transactionDateFrom;
        delete filter.transactionDateFrom;
      }
      if (filter.transactionDateTo) {
        filter.transactionDate.$lte = filter.transactionDateTo.$lte || filter.transactionDateTo;
        delete filter.transactionDateTo;
      }
    }

    if (filters.q) {
      const regex = new RegExp(escapeRegExp(filters.q), 'i');
      const searchFilter = {
        $or: [
          { description: regex },
          { bookingText: regex },
          { reference: regex },
          { payerPayeeName: regex },
          { endToEndId: regex },
          { creditorReference: regex },
        ],
      };
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, searchFilter];
        delete filter.$or;
      } else {
        filter.$or = searchFilter.$or;
      }
    }

    const sort = buildCursorSort(sortBy, sortOrder);

    const docs = await BankTransaction.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, sortBy);
  }

  async findUnmatched(bankAccountId) {
    return BankTransaction.find({
      bankAccountId,
      reconciliationStatus: 'UNMATCHED',
    }).lean();
  }

  async getReconciliationSummary({ bankAccountId, currency, dateFrom, dateTo } = {}) {
    const match = {};
    if (currency) match.currency = currency;
    if (bankAccountId) match.bankAccountId = toObjectId(bankAccountId);
    if (dateFrom || dateTo) {
      match.transactionDate = {};
      if (dateFrom) match.transactionDate.$gte = new Date(dateFrom);
      if (dateTo) match.transactionDate.$lte = new Date(dateTo);
    }

    return BankTransaction.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$reconciliationStatus',
          count: { $sum: 1 },
          total: { $sum: '$amount' },
          incomingTotal: {
            $sum: { $cond: [{ $gt: ['$amount', 0] }, '$amount', 0] },
          },
          outgoingTotal: {
            $sum: { $cond: [{ $lt: ['$amount', 0] }, { $abs: '$amount' }, 0] },
          },
        },
      },
    ]);
  }

  async findMatchedInvoiceTransactions({ bankAccountId, currency, dateFrom, dateTo } = {}) {
    const filter = {
      reconciliationStatus: { $in: ['AUTO_MATCHED', 'MANUALLY_MATCHED'] },
      matchedInvoiceId: { $ne: null },
    };
    if (currency) filter.currency = currency;
    if (bankAccountId) filter.bankAccountId = bankAccountId;
    if (dateFrom || dateTo) {
      filter.transactionDate = {};
      if (dateFrom) filter.transactionDate.$gte = new Date(dateFrom);
      if (dateTo) filter.transactionDate.$lte = new Date(dateTo);
    }

    return BankTransaction.find(filter)
      .select('_id amount currency reconciliationStatus matchedInvoiceId transactionDate')
      .lean();
  }

  async updateReconciliation(id, status, matchData = {}, options = {}) {
    return BankTransaction.findByIdAndUpdate(
      id,
      { reconciliationStatus: status, ...matchData },
      { returnDocument: 'after', runValidators: true, session: options.session },
    ).lean();
  }

  async markReconciledIfUnmatched(id, status, matchData = {}, options = {}) {
    return BankTransaction.updateOne(
      { _id: id, reconciliationStatus: 'UNMATCHED' },
      { $set: { reconciliationStatus: status, ...matchData } },
      { session: options.session, runValidators: true },
    );
  }
}

const bankTransactionRepository = new BankTransactionRepository();
export default bankTransactionRepository;
