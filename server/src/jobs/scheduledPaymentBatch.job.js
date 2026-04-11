import { BaseWorker } from '../shared/queue/BaseWorker.js';
import logger from '../shared/logger/index.js';

/**
 * Scheduled payment batch job.
 *
 * Finds all approved AP invoices due within the next 3 days and
 * creates payment batches for them.
 *
 * Runs daily at 05:00.
 */
export class ScheduledPaymentBatchWorker extends BaseWorker {
  constructor() {
    super('scheduled-payment-batch');
  }

  async process(job) {
    // Lazy import to avoid circular dependencies
    const apInvoiceRepository = (await import('../modules/accounting/apInvoice.repository.js')).default;

    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const invoices = await apInvoiceRepository.findForPaymentBatch(
      now.toISOString(),
      threeDaysFromNow.toISOString(),
    );

    let batchesCreated = 0;
    const invoiceCount = invoices.length;

    if (invoices.length > 0) {
      try {
        const apInvoiceService = (await import('../modules/accounting/apInvoice.service.js')).default;

        // Group invoices by bank account (or create a single batch)
        const invoiceIds = invoices.map((inv) => inv._id);

        // Use first available bank account
        const BankAccount = (await import('../modules/accounting/bankAccount.model.js')).default;
        const defaultAccount = await BankAccount.findOne({ status: 'ACTIVE' }).lean();

        if (defaultAccount) {
          await apInvoiceService.createPaymentBatch(
            invoiceIds,
            defaultAccount._id,
            null, // system
            { ipAddress: 'internal' },
          );
          batchesCreated = 1;
        } else {
          logger.warn('No active bank account found for payment batch', {
            module: 'jobs',
            action: 'scheduled-payment-batch',
          });
        }
      } catch (err) {
        logger.warn('Failed to create payment batch', {
          module: 'jobs',
          action: 'scheduled-payment-batch',
          error: { message: err.message },
        });
      }
    }

    logger.info('Scheduled payment batch job completed', {
      module: 'jobs',
      action: 'scheduled-payment-batch',
      batchesCreated,
      invoiceCount,
    });

    return { batchesCreated, invoiceCount };
  }
}

export default ScheduledPaymentBatchWorker;
