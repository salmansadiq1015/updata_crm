import journalEntryRepository from './journalEntry.repository.js';
import counterService from './accounting.counter.service.js';
import accountRepository from './account.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';
import { AppError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

const ENTITY_TTL = { l1Ttl: 60, l2Ttl: 300 };
const LIST_TTL = { l1Ttl: 30, l2Ttl: 120 };

class JournalEntryService {
  async createManual(data, userId, meta = {}) {
    // Validate accounts exist and are not groups
    const debitAccount = await accountRepository.findById(data.debitAccountId);
    if (!debitAccount) throw new NotFoundError('Debit Account', data.debitAccountId);
    if (debitAccount.isGroup) {
      throw new AppError('Cannot post to a group account', 400, ERROR_CODES.ACCT_ACCOUNT_IS_GROUP);
    }

    const creditAccount = await accountRepository.findById(data.creditAccountId);
    if (!creditAccount) throw new NotFoundError('Credit Account', data.creditAccountId);
    if (creditAccount.isGroup) {
      throw new AppError('Cannot post to a group account', 400, ERROR_CODES.ACCT_ACCOUNT_IS_GROUP);
    }

    const entryNumber = await counterService.getNextJournalEntryNumber();

    const entry = await journalEntryRepository.create({
      ...data,
      entryNumber,
      referenceType: data.referenceType || 'MANUAL',
      createdBy: userId,
    });

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

  async createFromEvent(referenceType, referenceId, debitAccountId, creditAccountId, amount, description, userId) {
    const entryNumber = await counterService.getNextJournalEntryNumber();

    const entry = await journalEntryRepository.create({
      entryNumber,
      entryDate: new Date(),
      description,
      debitAccountId,
      creditAccountId,
      amount,
      referenceType,
      referenceId,
      createdBy: userId,
    });

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
    const original = await journalEntryRepository.findById(entryId);
    if (!original) throw new NotFoundError('JournalEntry', entryId);

    if (original.reversedBy) {
      throw new ConflictError('Journal entry has already been reversed');
    }

    const entryNumber = await counterService.getNextJournalEntryNumber();

    // Create reversal with swapped debit/credit
    const reversalEntry = await journalEntryRepository.create({
      entryNumber,
      entryDate: new Date(),
      description: `Reversal: ${reason}`,
      debitAccountId: original.creditAccountId._id || original.creditAccountId,
      creditAccountId: original.debitAccountId._id || original.debitAccountId,
      amount: original.amount,
      currency: original.currency,
      referenceType: 'REVERSAL',
      referenceId: original.referenceId,
      reversalOf: original._id,
      createdBy: userId,
    });

    // Update original with reversedBy — native driver bypasses immutability hooks
    await journalEntryRepository.setReversedBy(original._id, reversalEntry._id);

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

  async exportCsv({ startDate, endDate }) {
    const result = await journalEntryRepository.findWithCursor({
      limit: 100000,
      sortBy: 'entryNumber',
      sortOrder: 'asc',
      filters: { entryDateFrom: startDate, entryDateTo: endDate },
    });

    const entries = result.data || [];
    const header = 'EntryNumber,Date,Description,DebitAccount,CreditAccount,Amount,Currency,ReferenceType';
    const rows = entries.map((e) => {
      const debitAcct = e.debitAccountId?.accountNumber || '';
      const creditAcct = e.creditAccountId?.accountNumber || '';
      const date = new Date(e.entryDate).toISOString().split('T')[0];
      return [e.entryNumber, date, `"${e.description}"`, debitAcct, creditAcct, e.amount, e.currency, e.referenceType].join(',');
    });

    return [header, ...rows].join('\n');
  }

  async _invalidateListCache() {
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}accounting:journal:list:*`);
  }
}

const journalEntryService = new JournalEntryService();
export default journalEntryService;
