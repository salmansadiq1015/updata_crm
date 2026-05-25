import bankAccountRepository from './bankAccount.repository.js';
import bankTransactionRepository from './bankTransaction.repository.js';
import paymentBatchRepository from './paymentBatch.repository.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { AppError, NotFoundError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import logger from '../../shared/logger/index.js';

const ACCOUNTS_TTL = { l1Ttl: 30, l2Ttl: 120 };
const SUPPORTED_STATEMENT_FORMATS = ['camt053', 'camt054'];
const PAIN002_ACCEPTED_STATUSES = new Set(['ACCP', 'ACSC', 'ACSP', 'ACWC']);
const PAIN002_REJECTED_STATUSES = new Set(['RJCT']);
const AUTOMATED_CONNECTION_TYPES = new Set(['EBICS', 'SFTP']);
const STATEMENT_FILE_EXTENSIONS = new Set(['.xml']);

function normalizeIban(iban) {
  return String(iban || '').replace(/\s+/g, '').toUpperCase();
}

function detectStatementFormat(xml, fileName = '') {
  if (/<BkToCstmrDbtCdtNtfctn[\s>]/.test(xml) || /\.054\.xml$/i.test(fileName)) {
    return 'camt054';
  }
  if (/<BkToCstmrStmt[\s>]/.test(xml) || /\.053\.xml$/i.test(fileName)) {
    return 'camt053';
  }
  throw new AppError(
    'Unsupported bank statement XML type',
    400,
    ERROR_CODES.ACCT_BANK_IMPORT_PARSE_FAILED,
    [{ expected: 'camt.053 or camt.054', actual: fileName || 'unknown XML' }],
  );
}

async function moveRetrievedFile(sourcePath, targetDirectory) {
  if (!targetDirectory) return null;
  await fs.mkdir(targetDirectory, { recursive: true });
  const parsed = path.parse(sourcePath);
  const targetPath = path.join(
    targetDirectory,
    `${parsed.name}.${Date.now()}${parsed.ext}`,
  );
  await fs.rename(sourcePath, targetPath);
  return targetPath;
}

function getStatementDirectory(account) {
  const directory = account.connectionConfig?.statementDirectory;
  if (!directory) {
    throw new AppError(
      'Automated bank retrieval requires connectionConfig.statementDirectory',
      503,
      ERROR_CODES.SERVICE_UNAVAILABLE,
    );
  }
  return directory;
}

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
    if (!SUPPORTED_STATEMENT_FORMATS.includes(format)) {
      throw new AppError(
        'Unsupported bank statement format',
        400,
        ERROR_CODES.ACCT_BANK_IMPORT_PARSE_FAILED,
        [{ expected: SUPPORTED_STATEMENT_FORMATS.join(', '), actual: format }],
      );
    }
    if (!fileBuffer?.length) {
      throw new AppError(
        'Bank statement file is empty',
        400,
        ERROR_CODES.ACCT_BANK_IMPORT_PARSE_FAILED,
      );
    }

    // Lazy import ISO 20022 parser
    const iso20022 = await import('./iso20022.parser.js');
    const xml = fileBuffer.toString('utf8');

    let parsed;
    if (format === 'camt054') {
      parsed = iso20022.parseCamt054(xml);
    } else {
      parsed = iso20022.parseCamt053(xml);
    }

    if (normalizeIban(parsed.accountIban) !== normalizeIban(account.iban)) {
      throw new AppError(
        'Bank statement IBAN does not match selected bank account',
        400,
        ERROR_CODES.ACCT_BANK_IMPORT_PARSE_FAILED,
        [{ expected: normalizeIban(account.iban), actual: normalizeIban(parsed.accountIban) }],
      );
    }

    if (!parsed.transactions.length) {
      throw new AppError(
        'Bank statement contains no transactions to import',
        400,
        ERROR_CODES.ACCT_BANK_IMPORT_PARSE_FAILED,
      );
    }

    const alreadyImported = await bankTransactionRepository.existsStatement?.(
      bankAccountId,
      parsed.statementId,
    );
    if (alreadyImported) {
      auditService.logEvent({
        eventType: 'accounting.bank_statement.duplicate_skipped',
        userId,
        ipAddress: meta.ipAddress || 'internal',
        userAgent: meta.userAgent,
        result: 'success',
        details: { bankAccountId, statementId: parsed.statementId },
        module: 'accounting',
      });

      return {
        status: 'duplicate',
        statementId: parsed.statementId,
        transactionCount: 0,
        balance: parsed.balance,
      };
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

    return {
      status: 'imported',
      statementId: parsed.statementId,
      transactionCount: created.length,
      balance: parsed.balance,
    };
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

  async importPaymentStatus(fileBuffer, userId, meta = {}) {
    if (!fileBuffer?.length) {
      throw new AppError(
        'Payment status report file is empty',
        400,
        ERROR_CODES.ACCT_BANK_IMPORT_PARSE_FAILED,
      );
    }

    const iso20022 = await import('./iso20022.parser.js');
    const parsed = iso20022.parsePain002(fileBuffer.toString('utf8'));
    const batch = await paymentBatchRepository.findByBatchNumber(parsed.batchNumber);
    if (!batch) throw new NotFoundError('PaymentBatch', parsed.batchNumber);

    const statusCode = parsed.paymentInfoStatus || parsed.groupStatus;
    const batchStatus = this._mapPain002Status(statusCode, batch.status);
    const reason = parsed.paymentInfoReason || parsed.groupReason || null;

    const updated = await paymentBatchRepository.updateStatus(batch._id, batchStatus, {
      pain002Status: statusCode || null,
      pain002Reason: reason,
      pain002ReceivedAt: new Date(),
      pain002TransactionStatuses: parsed.transactionStatuses,
    });

    auditService.logEvent({
      eventType: 'accounting.payment_batch.pain002_imported',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: {
        batchId: batch._id,
        batchNumber: batch.batchNumber,
        originalMessageId: parsed.originalMessageId,
        statusCode,
        batchStatus,
        transactionStatusCount: parsed.transactionStatuses.length,
      },
      module: 'accounting',
    });

    logger.info('Payment status report imported', {
      module: 'accounting',
      action: 'payment_status.import',
      batchId: batch._id,
      batchNumber: batch.batchNumber,
      statusCode,
      batchStatus,
    });

    return { batch: updated, report: parsed };
  }

  async getTransaction(id) {
    const txn = await bankTransactionRepository.findById(id);
    if (!txn) throw new NotFoundError('BankTransaction', id);
    return txn;
  }

  async retrieveStatements(bankAccountId, userId = null, meta = {}) {
    const account = await bankAccountRepository.findById(bankAccountId);
    if (!account) throw new NotFoundError('BankAccount', bankAccountId);

    if (!AUTOMATED_CONNECTION_TYPES.has(account.connectionType)) {
      throw new AppError(
        'Automated retrieval is only available for EBICS or SFTP bank connections',
        400,
        ERROR_CODES.INVALID_INPUT,
      );
    }
    if (account.status !== 'ACTIVE') {
      throw new AppError('Bank account is not active', 400, ERROR_CODES.INVALID_INPUT);
    }

    const statementDirectory = getStatementDirectory(account);
    const processedDirectory = account.connectionConfig?.processedDirectory || null;
    const failedDirectory = account.connectionConfig?.failedDirectory || null;
    let entries;

    try {
      entries = await fs.readdir(statementDirectory, { withFileTypes: true });
    } catch (err) {
      throw new AppError(
        `Unable to read bank statement directory: ${err.message}`,
        503,
        ERROR_CODES.SERVICE_UNAVAILABLE,
      );
    }

    const files = entries
      .filter((entry) => entry.isFile() && STATEMENT_FILE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));

    const result = {
      status: 'completed',
      bankAccountId,
      connectionType: account.connectionType,
      filesFound: files.length,
      filesProcessed: 0,
      importedTransactions: 0,
      skippedFiles: [],
      failedFiles: [],
    };

    for (const fileName of files) {
      const sourcePath = path.join(statementDirectory, fileName);
      try {
        const fileBuffer = await fs.readFile(sourcePath);
        const format = detectStatementFormat(fileBuffer.toString('utf8'), fileName);
        const imported = await this.importStatement(bankAccountId, fileBuffer, format, userId, {
          ...meta,
          sourceFileName: fileName,
        });
        result.filesProcessed += 1;
        result.importedTransactions += imported.transactionCount || 0;
        if (imported.status === 'duplicate') {
          result.skippedFiles.push({ fileName, reason: 'duplicate_statement', statementId: imported.statementId });
        }
        await moveRetrievedFile(sourcePath, processedDirectory);
      } catch (err) {
        result.failedFiles.push({ fileName, error: err.message });
        try {
          await moveRetrievedFile(sourcePath, failedDirectory);
        } catch (moveErr) {
          logger.warn('Failed to move failed bank statement file', {
            module: 'accounting',
            action: 'bank_statement.retrieve',
            bankAccountId,
            fileName,
            error: { message: moveErr.message },
          });
        }
      }
    }

    auditService.logEvent({
      eventType: 'accounting.bank_statement.retrieved',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: result.failedFiles.length ? 'failure' : 'success',
      details: result,
      module: 'accounting',
    });

    logger.info('Bank statement retrieval completed', {
      module: 'accounting',
      action: 'bank_statement.retrieve',
      bankAccountId,
      connectionType: account.connectionType,
      filesProcessed: result.filesProcessed,
      failedFiles: result.failedFiles.length,
    });

    return result;
  }

  _mapPain002Status(statusCode, currentStatus) {
    if (PAIN002_ACCEPTED_STATUSES.has(statusCode)) return 'CONFIRMED';
    if (PAIN002_REJECTED_STATUSES.has(statusCode)) return 'REJECTED';
    return currentStatus === 'CREATED' ? 'EXPORTED' : currentStatus;
  }

  async _invalidateAccountsCache() {
    await cacheManager.del('accounting:bank:accounts');
  }
}

const bankingService = new BankingService();
export default bankingService;
