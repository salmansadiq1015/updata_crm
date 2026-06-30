import mongoose from 'mongoose';
import journalEntryRepository from './journalEntry.repository.js';
import counterService from './accounting.counter.service.js';
import accountRepository from './account.repository.js';
import fiscalPeriodService from './fiscalPeriod.service.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';
import { AppError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';
import { toCsv, formatDateOnly } from '../../shared/utils/csv.js';

const ENTITY_TTL = { l1Ttl: 60, l2Ttl: 300 };
const LIST_TTL = { l1Ttl: 30, l2Ttl: 120 };

class JournalEntryService {
  async createManual(data, userId, meta = {}) {
    const session = await mongoose.startSession();
    let entry;
    let entryNumber;

    try {
      await session.withTransaction(async () => {
        await fiscalPeriodService.assertPostingDateOpen(data.entryDate, { session });

        // Validate accounts exist and are not groups
        const debitAccount = await accountRepository.findById(data.debitAccountId, { session });
        if (!debitAccount) throw new NotFoundError('Debit Account', data.debitAccountId);
        if (debitAccount.isGroup) {
          throw new AppError('Cannot post to a group account', 400, ERROR_CODES.ACCT_ACCOUNT_IS_GROUP);
        }

        const creditAccount = await accountRepository.findById(data.creditAccountId, { session });
        if (!creditAccount) throw new NotFoundError('Credit Account', data.creditAccountId);
        if (creditAccount.isGroup) {
          throw new AppError('Cannot post to a group account', 400, ERROR_CODES.ACCT_ACCOUNT_IS_GROUP);
        }

        entryNumber = await counterService.getNextJournalEntryNumber({ session });

        entry = await journalEntryRepository.create({
          ...data,
          entryNumber,
          referenceType: data.referenceType || 'MANUAL',
          createdBy: userId,
        }, { session });
      });
    } finally {
      await session.endSession();
    }

    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.ACCOUNTING_JOURNAL_ENTRY_CREATED, {
      entryId: entry._id,
      entryNumber,
      amount: entry.amount,
      debitAccountId: entry.debitAccountId,
      creditAccountId: entry.creditAccountId,
      createdBy: userId,
    }, { source: 'accounting:journal' });

    auditService.logEvent({
      eventType: 'journal_entry.created',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { entryId: entry._id, entryNumber, amount: entry.amount },
      module: 'accounting',
    });

    logger.info('Journal entry created', { module: 'accounting', action: 'create', entryId: entry._id, entryNumber });

    return journalEntryRepository.findById(entry._id);
  }

  async createFromEvent(referenceType, referenceId, debitAccountId, creditAccountId, amount, description, userId, options = {}) {
    const entryDate = options.entryDate ? new Date(options.entryDate) : new Date();
    await fiscalPeriodService.assertPostingDateOpen(entryDate, { session: options.session });

    const entryNumber = await counterService.getNextJournalEntryNumber({ session: options.session });

    const entry = await journalEntryRepository.create({
      entryNumber,
      entryDate,
      description,
      debitAccountId,
      creditAccountId,
      amount,
      currency: options.currency || 'CHF',
      companyId: options.companyId || null,
      branchId: options.branchId || null,
      referenceType,
      referenceId,
      createdBy: userId,
    }, { session: options.session });

    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.ACCOUNTING_JOURNAL_ENTRY_CREATED, {
      entryId: entry._id,
      entryNumber,
      amount,
      referenceType,
      referenceId,
      createdBy: userId,
    }, { source: 'accounting:journal' });

    logger.info('Journal entry created from event', { module: 'accounting', action: 'createFromEvent', entryId: entry._id, referenceType, referenceId });

    return entry;
  }

  async reverse(entryId, reason, userId, meta = {}) {
    const session = await mongoose.startSession();
    let original;
    let reversalEntry;

    try {
      await session.withTransaction(async () => {
        original = await journalEntryRepository.findById(entryId, { session });
        if (!original) throw new NotFoundError('JournalEntry', entryId);

        if (original.reversedBy) {
          throw new ConflictError('Journal entry has already been reversed');
        }

        const reversalDate = new Date();
        await fiscalPeriodService.assertPostingDateOpen(reversalDate, { session });
        const entryNumber = await counterService.getNextJournalEntryNumber({ session });

        // Create reversal with swapped debit/credit
        reversalEntry = await journalEntryRepository.create({
          entryNumber,
          entryDate: reversalDate,
          description: `Reversal: ${reason}`,
          debitAccountId: original.creditAccountId._id || original.creditAccountId,
          creditAccountId: original.debitAccountId._id || original.debitAccountId,
          amount: original.amount,
          currency: original.currency,
          companyId: original.companyId || null,
          branchId: original.branchId || null,
          referenceType: 'REVERSAL',
          referenceId: original.referenceId,
          reversalOf: original._id,
          createdBy: userId,
        }, { session });

    // Update original with reversedBy — native driver bypasses immutability hooks
        const reversalUpdate = await journalEntryRepository.setReversedBy(
          original._id,
          reversalEntry._id,
          { session },
        );
        if (reversalUpdate.matchedCount !== 1) {
          throw new ConflictError('Journal entry has already been reversed');
        }
      });
    } finally {
      await session.endSession();
    }

    await this._invalidateListCache();
    await cacheManager.del(`accounting:journal:${entryId}`);

    auditService.logEvent({
      eventType: 'journal_entry.reversed',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { originalEntryId: entryId, reversalEntryId: reversalEntry._id, reason },
      module: 'accounting',
    });

    logger.info('Journal entry reversed', { module: 'accounting', action: 'reverse', originalEntryId: entryId, reversalEntryId: reversalEntry._id });

    return journalEntryRepository.findById(reversalEntry._id);
  }

  async getById(id) {
    const cacheKey = `accounting:journal:${id}`;
    const entry = await cacheManager.getOrSet(
      cacheKey,
      () => journalEntryRepository.findById(id),
      ENTITY_TTL,
    );
    if (!entry) throw new NotFoundError('JournalEntry', id);
    return entry;
  }

  async list(queryParams) {
    const { cursor, limit, sortBy, sortOrder, ...filters } = queryParams;
    const filterKey = Object.entries(filters)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    const cacheKey = `accounting:journal:list:${cursor || ''}:${limit}:${sortBy}:${sortOrder}:${filterKey}`;

    return cacheManager.getOrSet(
      cacheKey,
      () => journalEntryRepository.findWithCursor({ cursor, limit, sortBy, sortOrder, filters }),
      LIST_TTL,
    );
  }

  async exportCsv({
    startDate, endDate, companyId, branchId,
  }) {
    const exportQuery = {
      startDate,
      endDate,
    };
    if (companyId) exportQuery.companyId = companyId;
    if (branchId) exportQuery.branchId = branchId;
    const entries = await journalEntryRepository.findForExport(exportQuery);
    const headers = [
      'EntryNumber',
      'EntryDate',
      'CompanyId',
      'BranchId',
      'DebitAccount',
      'DebitAccountName',
      'CreditAccount',
      'CreditAccountName',
      'Amount',
      'Currency',
      'Description',
      'ReferenceType',
      'ReferenceId',
      'CreatedByEmail',
    ];

    const rows = entries.map((entry) => ({
      EntryNumber: entry.entryNumber,
      EntryDate: formatDateOnly(entry.entryDate),
      CompanyId: entry.companyId || '',
      BranchId: entry.branchId || '',
      DebitAccount: entry.debitAccountId?.accountNumber || '',
      DebitAccountName: entry.debitAccountId?.name || '',
      CreditAccount: entry.creditAccountId?.accountNumber || '',
      CreditAccountName: entry.creditAccountId?.name || '',
      Amount: Number(entry.amount || 0).toFixed(2),
      Currency: entry.currency || 'CHF',
      Description: entry.description || '',
      ReferenceType: entry.referenceType || '',
      ReferenceId: entry.referenceId || '',
      CreatedByEmail: entry.createdBy?.email || '',
    }));

    return toCsv(headers, rows);
  }

  async _invalidateListCache() {
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}accounting:journal:list:*`);
  }
}

const journalEntryService = new JournalEntryService();
export default journalEntryService;
