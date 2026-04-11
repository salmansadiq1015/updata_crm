import accountRepository from './account.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import auditService from '../auth/audit.service.js';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';
import { AppError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

const ENTITY_TTL = { l1Ttl: 60, l2Ttl: 300 };
const CHART_TTL = { l1Ttl: 120, l2Ttl: 600 };
const LIST_TTL = { l1Ttl: 30, l2Ttl: 120 };

class AccountService {
  async create(data, createdBy, meta = {}) {
    // Check for duplicate account number
    const existing = await accountRepository.findByAccountNumber(data.accountNumber);
    if (existing) {
      throw new AppError(
        `Account number '${data.accountNumber}' already exists`,
        409,
        ERROR_CODES.ACCT_ACCOUNT_NUMBER_EXISTS,
      );
    }

    // Validate parent exists if provided
    if (data.parentId) {
      const parent = await accountRepository.findById(data.parentId);
      if (!parent) throw new NotFoundError('Parent Account', data.parentId);
    }

    const account = await accountRepository.create({ ...data, createdBy });

    await this._invalidateListCache();
    await this._invalidateChartCache();

    auditService.logEvent({
      eventType: 'account.created',
      userId: createdBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { accountId: account._id, accountNumber: account.accountNumber },
      module: 'accounting',
    });

    logger.info('Account created', { module: 'accounting', action: 'create', accountId: account._id, accountNumber: account.accountNumber });

    return accountRepository.findById(account._id);
  }

  async getById(id) {
    const cacheKey = `accounting:account:${id}`;
    const account = await cacheManager.getOrSet(
      cacheKey,
      () => accountRepository.findById(id),
      ENTITY_TTL,
    );
    if (!account) throw new NotFoundError('Account', id);
    return account;
  }

  async list(queryParams) {
    const { cursor, limit, sortBy, sortOrder, ...filters } = queryParams;
    const filterKey = Object.entries(filters)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    const cacheKey = `accounting:accounts:list:${cursor || ''}:${limit}:${sortBy}:${sortOrder}:${filterKey}`;

    return cacheManager.getOrSet(
      cacheKey,
      () => accountRepository.findWithCursor({ cursor, limit, sortBy, sortOrder, filters }),
      LIST_TTL,
    );
  }

  async getChartOfAccounts() {
    const cacheKey = 'accounting:chart';
    return cacheManager.getOrSet(
      cacheKey,
      async () => {
        const accounts = await accountRepository.findAll();
        return this._buildTree(accounts);
      },
      CHART_TTL,
    );
  }

  async update(id, data, updatedBy, meta = {}) {
    const existing = await accountRepository.findById(id);
    if (!existing) throw new NotFoundError('Account', id);

    const updated = await accountRepository.updateById(id, { ...data, updatedBy });
    await this._invalidateAccountCache(id);
    await this._invalidateListCache();
    await this._invalidateChartCache();

    auditService.logEvent({
      eventType: 'account.updated',
      userId: updatedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { accountId: id, changedFields: Object.keys(data) },
      module: 'accounting',
    });

    return updated;
  }

  async getBalance(id, { startDate, endDate } = {}) {
    const account = await accountRepository.findById(id);
    if (!account) throw new NotFoundError('Account', id);

    const JournalEntry = (await import('./journalEntry.model.js')).default;

    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);

    const matchStage = {};
    if (Object.keys(dateFilter).length) matchStage.entryDate = dateFilter;

    const [debitResult] = await JournalEntry.aggregate([
      { $match: { debitAccountId: account._id, ...matchStage } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    const [creditResult] = await JournalEntry.aggregate([
      { $match: { creditAccountId: account._id, ...matchStage } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    const totalDebits = debitResult?.total || 0;
    const totalCredits = creditResult?.total || 0;

    // ASSET & EXPENSE: debit-normal; LIABILITY, EQUITY, REVENUE: credit-normal
    const isDebitNormal = ['ASSET', 'EXPENSE'].includes(account.type);
    const balance = isDebitNormal ? totalDebits - totalCredits : totalCredits - totalDebits;

    return { accountId: id, accountNumber: account.accountNumber, name: account.name, type: account.type, totalDebits, totalCredits, balance };
  }

  async exportCsv() {
    const accounts = await accountRepository.findAll();
    const header = 'AccountNumber,Name,Type,ParentAccountNumber,IsGroup,IsActive,DefaultVatRate,Description';
    const rows = accounts.map((a) => {
      const parentNumber = a.parentId ? accounts.find((p) => String(p._id) === String(a.parentId))?.accountNumber || '' : '';
      return [a.accountNumber, `"${a.name}"`, a.type, parentNumber, a.isGroup, a.isActive, a.defaultVatRate ?? '', `"${a.description || ''}"`].join(',');
    });
    return [header, ...rows].join('\n');
  }

  _buildTree(accounts) {
    const map = new Map();
    const roots = [];

    for (const acct of accounts) {
      map.set(String(acct._id), { ...acct, children: [] });
    }

    for (const acct of accounts) {
      const node = map.get(String(acct._id));
      if (acct.parentId && map.has(String(acct.parentId))) {
        map.get(String(acct.parentId)).children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  async _invalidateAccountCache(id) {
    await cacheManager.del(`accounting:account:${id}`);
  }

  async _invalidateListCache() {
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}accounting:accounts:list:*`);
  }

  async _invalidateChartCache() {
    await cacheManager.del('accounting:chart');
  }
}

const accountService = new AccountService();
export default accountService;
