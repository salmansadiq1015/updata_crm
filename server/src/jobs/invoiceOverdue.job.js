import { BaseWorker } from '../shared/queue/BaseWorker.js';
import eventBus from '../shared/events/EventBus.js';
import EVENT_TYPES from '../shared/events/eventTypes.js';
import logger from '../shared/logger/index.js';

/**
 * Invoice overdue job.
 *
 * Scans invoices in SENT or PARTIALLY_PAID status whose dueDate
 * has passed and transitions them to OVERDUE.
 * Runs daily to keep invoice statuses current.
 */
export class InvoiceOverdueWorker extends BaseWorker {
  constructor() {
    super('invoice-overdue');
  }

  async process(job) {
    const now = new Date();

    // Lazy imports
    const Invoice = (await import('../modules/qop/invoice.model.js')).default;
    const DocumentStatusLog = (await import('../modules/qop/documentStatusLog.model.js')).default;

    const overdue = await Invoice.find({
      status: { $in: ['SENT', 'PARTIALLY_PAID'] },
      dueDate: { $lt: now },
      isDeleted: false,
    }).lean();

    let overdueCount = 0;

    for (const doc of overdue) {
      await Invoice.updateOne(
        { _id: doc._id },
        { $set: { status: 'OVERDUE' } },
      );

      await DocumentStatusLog.create({
        documentType: 'invoice',
        documentId: doc._id,
        fromStatus: doc.status,
        toStatus: 'OVERDUE',
        changedBy: doc.createdBy,
        reason: 'Automatically marked overdue — due date passed',
      });

      eventBus.publish(EVENT_TYPES.INVOICE_OVERDUE, {
        invoiceId: doc._id,
        invoiceNumber: doc.invoiceNumber,
        customerId: doc.customerId,
        amountDue: doc.amountDue,
      }, { source: 'jobs:invoice-overdue' });

      overdueCount++;
    }

    logger.info('Invoice overdue check completed', {
      module: 'jobs',
      action: 'invoice-overdue',
      overdueCount,
    });

    return { overdueCount };
  }
}

export default InvoiceOverdueWorker;
