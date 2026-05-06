import Account from './account.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

const ALLOWED_FILTERS = {
  type: 'exact',
  isActive: 'exact',
  parentId: 'objectId',
};

const ALLOWED_SORT_FIELDS = ['createdAt', 'accountNumber', 'name', '_id'];

class AccountRepository {
  async create(data) {
    const account = new Account(data);
    return account.save();
  }

  async findById(id) {
    return Account.findById(id).lean();
  }

  async findByAccountNumber(accountNumber) {
    return Account.findOne({ accountNumber }).lean();
  }

  async findAll() {
    return Account.find().sort({ accountNumber: 1 }).lean();
  }

  async findByParentId(parentId) {
    return Account.find({ parentId }).lean();
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'accountNumber', sortOrder = 'asc', filters = {} }) {
    const filter = {
      ...buildFilter(filters, ALLOWED_FILTERS),
      ...buildCursorQuery(cursor, sortBy, sortOrder),
    };

    const sort = buildCursorSort(sortBy, sortOrder);

    const docs = await Account.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, sortBy);
  }

  async updateById(id, data) {
    return Account.findByIdAndUpdate(id, data, {
      returnDocument: 'after',
      runValidators: true,
    }).lean();
  }

  async softDelete(id) {
    return Account.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { returnDocument: 'after' },
    );
  }

  async hasEntries(id) {
    // Lazy import to avoid circular dependencies
    const JournalEntry = (await import('./journalEntry.model.js')).default;
    const count = await JournalEntry.countDocuments({
      $or: [{ debitAccountId: id }, { creditAccountId: id }],
    });
    return count > 0;
  }
}

const accountRepository = new AccountRepository();
export default accountRepository;
