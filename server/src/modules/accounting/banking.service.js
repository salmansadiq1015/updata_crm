import bankAccountRepository from './bankAccount.repository.js';
import bankTransactionRepository from './bankTransaction.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { NotFoundError } from '../../shared/errors/AppError.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

const ACCOUNTS_TTL = { l1Ttl: 30, l2Ttl: 120 };

class BankingService {
  async createBankAccount(data, userId, meta = {}) {
    const account = await bankAccountRepository.create(data);

    await this._invalidateAccountsCache();

    auditService.logEvent({
      eventType: 'accounting.bank_account.created',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { bankAccountId: account._id, iban: data.iban },
      module: 'accounting',
    });

    logger.info('Bank account created', {
      module: 'accounting',
      action: 'bank_account.create',
      bankAccountId: account._id,
    });

    return account;
  }

  async getBankAccount(id) {
    const account = await bankAccountRepository.findById(id);
    if (!account) throw new NotFoundError('BankAccount', id);
    return account;
  }

  async listBankAccounts(params = {}) {
    if (!params.cursor && !params.limit) {
      // Simple list — use cache
      const cacheKey = 'accounting:bank:accounts';
      return cacheManager.getOrSet(
        cacheKey,
        () => bankAccountRepository.findAll(),
        ACCOUNTS_TTL,
      );
    }
    return bankAccountRepository.findWithCursor(params);
  }

  async updateBankAccount(id, data, userId, meta = {}) {
    const existing = await bankAccountRepository.findById(id);
    if (!existing) throw new NotFoundError('BankAccount', id);

    const updated = await bankAccountRepository.updateById(id, data);

    await this._invalidateAccountsCache();

    auditService.logEvent({
      eventType: 'accounting.bank_account.updated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { bankAccountId: id, changedFields: Object.keys(data) },
      module: 'accounting',
    });

    return updated;
  }

  async importStatement(bankAccountId, fileBuffer, format, userId, meta = {}) {
    const account = await bankAccountRepository.findById(bankAccountId);
    if (!account) throw new NotFoundError('BankAccount', bankAccountId);

    // Lazy import ISO 20022 parser
    const iso20022 = await import('./iso20022.parser.js');

    let parsed;
    if (format === 'camt054') {
      parsed = iso20022.parseCamt054(fileBuffer.toString('utf8'));
    } else {
      parsed = iso20022.parseCamt053(fileBuffer.toString('utf8'));
    }

    // Build transaction records
    const records = parsed.transactions.map((txn) => ({
      bankAccountId,
      transactionDate: txn.transactionDate,
      valueDate: txn.valueDate,
      amount: txn.amount,
      currency: txn.currency || account.currency,
      reference: txn.reference,
      payerPayeeName: txn.payerPayeeName,
      payerPayeeIban: txn.payerPayeeIban,
      bookingText: txn.bookingText,
      statementId: parsed.statementId,
    }));

    const created = await bankTransactionRepository.bulkCreate(records);

    // Update bank balance
    if (parsed.balance !== undefined) {
      await bankAccountRepository.updateBalance(bankAccountId, parsed.balance, new Date());
    }

    await this._invalidateAccountsCache();

    eventBus.publish(EVENT_TYPES.ACCOUNTING_BANK_STATEMENT_IMPORTED, {
      bankAccountId,
      statementId: parsed.statementId,
      transactionCount: created.length,
      importedBy: userId,
    }, { source: 'accounting:banking' });

    auditService.logEvent({
      eventType: 'accounting.bank_statement.imported',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { bankAccountId, statementId: parsed.statementId, transactionCount: created.length },
      module: 'accounting',
    });

    logger.info('Bank statement imported', {
      module: 'accounting',
      action: 'bank_statement.import',
      bankAccountId,
      transactionCount: created.length,
    });

    return { transactionCount: created.length, balance: parsed.balance };
  }

  async getTransactions(params) {
    const { cursor, limit, sortBy, sortOrder, ...filters } = params;
    return bankTransactionRepository.findWithCursor({
      cursor,
      limit,
      sortBy,
      sortOrder,
      filters,
    });
  }

  async getTransaction(id) {
    const txn = await bankTransactionRepository.findById(id);
    if (!txn) throw new NotFoundError('BankTransaction', id);
    return txn;
  }

  async retrieveStatements(bankAccountId) {
    const account = await bankAccountRepository.findById(bankAccountId);
    if (!account) throw new NotFoundError('BankAccount', bankAccountId);

    // Placeholder for EBICS/SFTP auto-retrieval
    logger.info('Statement retrieval requested (placeholder)', {
      module: 'accounting',
      action: 'bank_statement.retrieve',
      bankAccountId,
      connectionType: account.connectionType,
    });

    return { status: 'not_implemented', connectionType: account.connectionType };
  }

  async _invalidateAccountsCache() {
    await cacheManager.del('accounting:bank:accounts');
  }
}

const bankingService = new BankingService();
export default bankingService;
