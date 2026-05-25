import JournalEntry from './journalEntry.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';

class JournalEntryRepository {
  async create(data, options = {}) {
    const entry = new JournalEntry(data);
    return entry.save({ session: options.session });
  }

  async findById(id, options = {}) {
    return JournalEntry.findById(id)
      .session(options.session || null)
      .populate([
        { path: 'debitAccountId', select: 'accountNumber name' },
        { path: 'creditAccountId', select: 'accountNumber name' },
        { path: 'createdBy', select: 'firstName lastName email' },
      ])
      .lean();
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {} }) {
    const filter = { ...buildCursorQuery(cursor, sortBy, sortOrder) };

    if (filters.entryDateFrom || filters.entryDateTo) {
      filter.entryDate = {};
      if (filters.entryDateFrom) filter.entryDate.$gte = new Date(filters.entryDateFrom);
      if (filters.entryDateTo) filter.entryDate.$lte = new Date(filters.entryDateTo);
    }
    if (filters.referenceType) filter.referenceType = filters.referenceType;
    if (filters.debitAccountId) filter.debitAccountId = filters.debitAccountId;
    if (filters.creditAccountId) filter.creditAccountId = filters.creditAccountId;
    if (filters.accountId) {
      filter.$or = [
        { debitAccountId: filters.accountId },
        { creditAccountId: filters.accountId },
      ];
    }

    const sort = buildCursorSort(sortBy, sortOrder);

    const docs = await JournalEntry.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .populate([
        { path: 'debitAccountId', select: 'accountNumber name' },
        { path: 'creditAccountId', select: 'accountNumber name' },
      ])
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, sortBy);
  }

  async findForExport({ startDate, endDate, limit = 100000 }) {
    const filter = {};
    if (startDate || endDate) {
      filter.entryDate = {};
      if (startDate) filter.entryDate.$gte = new Date(startDate);
      if (endDate) filter.entryDate.$lte = new Date(endDate);
    }

    return JournalEntry.find(filter)
      .sort({ entryDate: 1, entryNumber: 1, _id: 1 })
      .limit(limit)
      .populate([
        { path: 'debitAccountId', select: 'accountNumber name' },
        { path: 'creditAccountId', select: 'accountNumber name' },
        { path: 'createdBy', select: 'firstName lastName email' },
      ])
      .select('-__v')
      .lean();
  }

  async findByReference(referenceType, referenceId) {
    return JournalEntry.find({ referenceType, referenceId })
      .populate([
        { path: 'debitAccountId', select: 'accountNumber name' },
        { path: 'creditAccountId', select: 'accountNumber name' },
      ])
      .lean();
  }

  /**
   * Set reversedBy on the original entry.
   * Uses native driver to bypass Mongoose immutability hooks.
   */
  async setReversedBy(entryId, reversalEntryId, options = {}) {
    return JournalEntry.collection.updateOne(
      { _id: entryId, reversedBy: null },
      { $set: { reversedBy: reversalEntryId } },
      { session: options.session },
    );
  }
}

const journalEntryRepository = new JournalEntryRepository();
export default journalEntryRepository;
