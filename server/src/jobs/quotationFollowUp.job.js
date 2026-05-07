import { BaseWorker } from '../shared/queue/BaseWorker.js';
import eventBus from '../shared/events/EventBus.js';
import EVENT_TYPES from '../shared/events/eventTypes.js';
import logger from '../shared/logger/index.js';

/**
 * Quotation follow-up job.
 *
 * Creates follow-up reminders for quotations sent more than 7 days ago
 * without a response, and expiration warnings for quotations expiring
 * within 3 days.
 */
export class QuotationFollowUpWorker extends BaseWorker {
  constructor() {
    super('quotation-follow-up');
  }

  async process(job) {
    const now = new Date();

    // Configurable via env — defaults: "7,14,21" days and 3 days expiry warning
    const intervalDays = (process.env.QUOTATION_FOLLOWUP_INTERVALS || '7,14,21')
      .split(',').map(Number).filter(Boolean);
    const expiryWarnDays = Number(process.env.QUOTATION_EXPIRY_WARN_DAYS || 3);

    const Quotation = (await import('../modules/qop/quotation.model.js')).default;
    const QuotationReminder = (await import('../modules/qop/quotationReminder.model.js')).default;

    let followUpCount = 0;
    let expirationWarningCount = 0;

    // Multi-interval follow-up reminders
    for (const days of intervalDays) {
      const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      const upperCutoff = new Date(cutoff.getTime() + 24 * 60 * 60 * 1000);

      const candidates = await Quotation.find({
        status: { $in: ['SENT', 'VIEWED'] },
        sentAt: { $gte: cutoff, $lt: upperCutoff },
        isDeleted: false,
      }).lean();

      for (const q of candidates) {
        const tag = `follow_up_${days}d`;
        const exists = await QuotationReminder.findOne({ quotationId: q._id, type: tag });
        if (!exists) {
          await QuotationReminder.create({
            quotationId: q._id,
            type: tag,
            intervalDays: days,
            scheduledAt: now,
            status: 'PENDING',
          });
          eventBus.publish(EVENT_TYPES.NOTIFICATION_QUEUED, {
            type: 'qop_followup_reminder',
            title: `Follow-up: ${q.quotationNumber}`,
            body: `Quotation ${q.quotationNumber} (${q.customerName}) needs follow-up (${days}d since sent).`,
            recipientId: q.assignedUserId || q.createdBy,
            metadata: { quotationId: q._id, quotationNumber: q.quotationNumber },
          }, { source: 'jobs:quotation-follow-up' });
          followUpCount++;
        }
      }
    }

    // Expiration warnings
    const expiryStart = new Date(now.getTime() + expiryWarnDays * 24 * 60 * 60 * 1000);
    const expiryEnd = new Date(expiryStart.getTime() + 24 * 60 * 60 * 1000);

    const expirationCandidates = await Quotation.find({
      status: { $in: ['SENT', 'VIEWED'] },
      validUntil: { $gte: expiryStart, $lt: expiryEnd },
      isDeleted: false,
    }).lean();

    for (const q of expirationCandidates) {
      const exists = await QuotationReminder.findOne({ quotationId: q._id, type: 'expiration_warning' });
      if (!exists) {
        await QuotationReminder.create({
          quotationId: q._id,
          type: 'expiration_warning',
          scheduledAt: now,
          status: 'PENDING',
        });
        expirationWarningCount++;
      }
    }

    logger.info('Quotation follow-up check completed', {
      module: 'jobs', action: 'quotation-follow-up', followUpCount, expirationWarningCount,
    });

    return { followUpCount, expirationWarningCount };
  }
}

export default QuotationFollowUpWorker;
