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

  async getReconciliationSummary({ bankAccountId, dateFrom, dateTo } = {}) {
    const match = {};
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

  async findMatchedInvoiceTransactions({ bankAccountId, dateFrom, dateTo } = {}) {
    const filter = {
      reconciliationStatus: { $in: ['AUTO_MATCHED', 'MANUALLY_MATCHED'] },
      matchedInvoiceId: { $ne: null },
    };
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
