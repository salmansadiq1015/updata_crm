import BankTransaction from './bankTransaction.model.js';
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

class BankTransactionRepository {
  async create(data) {
    const txn = new BankTransaction(data);
    return txn.save();
  }

  async bulkCreate(records) {
    return BankTransaction.insertMany(records, { ordered: false });
  }

  async findById(id) {
    return BankTransaction.findById(id).lean();
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

  async updateReconciliation(id, status, matchData = {}) {
    return BankTransaction.findByIdAndUpdate(
      id,
      { reconciliationStatus: status, ...matchData },
      { new: true, runValidators: true },
    ).lean();
  }
}

const bankTransactionRepository = new BankTransactionRepository();
export default bankTransactionRepository;
