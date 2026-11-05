import { BaseWorker } from '../shared/queue/BaseWorker.js';
import logger from '../shared/logger/index.js';

/**
 * Bank statement import job.
 *
 * Scans all bank accounts with auto-retrieve enabled and active status,
 * then triggers statement retrieval for each.
 *
 * Runs on-demand or via schedule.
 */
export class BankStatementImportWorker extends BaseWorker {
  constructor() {
    super('bank-statement-import');
  }

  async process(_job) {
    // Lazy import to avoid circular dependencies
    const BankAccount = (await import('../modules/accounting/bankAccount.model.js')).default;

    const accounts = await BankAccount.find({
      autoRetrieveEnabled: true,
      connectionType: { $in: ['EBICS', 'SFTP'] },
      status: 'ACTIVE',
    }).lean();

    let accountsProcessed = 0;

    for (const account of accounts) {
      try {
        // Lazy import banking service
        const bankingService = (await import('../modules/accounting/banking.service.js')).default;
        await bankingService.retrieveStatements(account._id);
        accountsProcessed++;

        logger.info('Bank statement retrieval triggered', {
          module: 'jobs',
          action: 'bank-statement-import',
          bankAccountId: account._id,
          accountName: account.name,
          connectionType: account.connectionType,
        });
      } catch (err) {
        logger.warn('Failed to retrieve statements for account', {
          module: 'jobs',
          action: 'bank-statement-import',
          bankAccountId: account._id,
          error: { message: err.message },
        });
      }
    }

    logger.info('Bank statement import job completed', {
      module: 'jobs',
      action: 'bank-statement-import',
      accountsProcessed,
      totalAccounts: accounts.length,
    });

    return { accountsProcessed };
  }
}

export default BankStatementImportWorker;
