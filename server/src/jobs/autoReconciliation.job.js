import { BaseWorker } from '../shared/queue/BaseWorker.js';
import logger from '../shared/logger/index.js';

/**
 * Auto-reconciliation job.
 *
 * Runs automatic reconciliation for all active bank accounts.
 * Matches unmatched bank transactions against QOP invoices.
 *
 * Scheduled to run every 30 minutes.
 */
export class AutoReconciliationWorker extends BaseWorker {
  constructor() {
    super('auto-reconciliation');
  }

  async process(job) {
    // Lazy import to avoid circular dependencies
    const BankAccount = (await import('../modules/accounting/bankAccount.model.js')).default;

    const accounts = await BankAccount.find({ status: 'ACTIVE' }).lean();

    let totalMatched = 0;
    let totalUnmatched = 0;

    for (const account of accounts) {
      try {
        const reconciliationService = (await import('../modules/accounting/reconciliation.service.js')).default;
        const result = await reconciliationService.runAutoReconciliation(account._id);

        totalMatched += result.matchedCount;
        totalUnmatched += result.unmatchedCount;
      } catch (err) {
        logger.warn('Auto-reconciliation failed for account', {
          module: 'jobs',
          action: 'auto-reconciliation',
          bankAccountId: account._id,
          error: { message: err.message },
        });
      }
    }

    logger.info('Auto-reconciliation job completed', {
      module: 'jobs',
      action: 'auto-reconciliation',
      totalMatched,
      totalUnmatched,
      accountsProcessed: accounts.length,
    });

    return { totalMatched, totalUnmatched };
  }
}

export default AutoReconciliationWorker;
