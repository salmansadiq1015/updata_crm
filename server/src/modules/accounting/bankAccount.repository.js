import BankAccount from './bankAccount.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';

class BankAccountRepository {
  async create(data) {
    const account = new BankAccount(data);
    return account.save();
  }

  async findById(id) {
    return BankAccount.findById(id).lean();
  }

  async findAll() {
    return BankAccount.find({ status: 'ACTIVE' }).lean();
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc' }) {
    const filter = {
      ...buildCursorQuery(cursor, sortBy, sortOrder),
    };

    const sort = buildCursorSort(sortBy, sortOrder);

    const docs = await BankAccount.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, sortBy);
  }

  async updateById(id, data) {
    return BankAccount.findByIdAndUpdate(id, data, {
      returnDocument: 'after',
      runValidators: true,
    }).lean();
  }

  async updateBalance(id, balance, date) {
    return BankAccount.findByIdAndUpdate(
      id,
      { currentBalance: balance, balanceDate: date },
      { returnDocument: 'after', runValidators: true },
    ).lean();
  }
}

const bankAccountRepository = new BankAccountRepository();
export default bankAccountRepository;
