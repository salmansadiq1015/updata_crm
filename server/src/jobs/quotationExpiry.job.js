import { BaseWorker } from '../shared/queue/BaseWorker.js';
import eventBus from '../shared/events/EventBus.js';
import EVENT_TYPES from '../shared/events/eventTypes.js';
import logger from '../shared/logger/index.js';

/**
 * Quotation expiry job.
 *
 * Scans quotations in SENT or VIEWED status whose validUntil date
 * has passed and transitions them to EXPIRED.
 * Runs daily to keep quotation statuses current.
 */
export class QuotationExpiryWorker extends BaseWorker {
  constructor() {
    super('quotation-expiry');
  }

  async process(_job) {
    const now = new Date();

    // Lazy import to avoid circular dependencies
    const Quotation = (await import('../modules/qop/quotation.model.js')).default;
    const DocumentStatusLog = (await import('../modules/qop/documentStatusLog.model.js')).default;

    const expired = await Quotation.find({
      status: { $in: ['SENT', 'VIEWED'] },
      validUntil: { $lt: now },
      isDeleted: false,
    }).lean();

    let expiredCount = 0;

    for (const doc of expired) {
      await Quotation.updateOne(
        { _id: doc._id },
        { $set: { status: 'EXPIRED' } },
      );

      await DocumentStatusLog.create({
        documentType: 'quotation',
        documentId: doc._id,
        fromStatus: doc.status,
        toStatus: 'EXPIRED',
        changedBy: doc.assignedUserId || doc.createdBy,
        reason: 'Automatically expired — validUntil date passed',
      });

      eventBus.publish(EVENT_TYPES.QUOTATION_EXPIRED, {
        quotationId: doc._id,
        quotationNumber: doc.quotationNumber,
        customerId: doc.customerId,
      }, { source: 'jobs:quotation-expiry' });

      expiredCount++;
    }

    logger.info('Quotation expiry check completed', {
      module: 'jobs',
      action: 'quotation-expiry',
      expiredCount,
    });

    return { expiredCount };
  }
}

export default QuotationExpiryWorker;
