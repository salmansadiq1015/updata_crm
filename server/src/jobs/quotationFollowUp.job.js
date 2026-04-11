import { BaseWorker } from '../shared/queue/BaseWorker.js';
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
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    // Lazy imports
    const Quotation = (await import('../modules/qop/quotation.model.js')).default;
    const QuotationReminder = (await import('../modules/qop/quotationReminder.model.js')).default;

    // --- Follow-up reminders for quotations sent > 7 days ago ---
    const followUpCandidates = await Quotation.find({
      status: 'SENT',
      sentAt: { $lt: sevenDaysAgo },
      isDeleted: false,
    }).lean();

    let followUpCount = 0;

    for (const q of followUpCandidates) {
      const existingReminder = await QuotationReminder.findOne({
        quotationId: q._id,
        type: 'follow_up',
        status: 'PENDING',
      });

      if (!existingReminder) {
        await QuotationReminder.create({
          quotationId: q._id,
          type: 'follow_up',
          scheduledAt: now,
          status: 'PENDING',
        });
        followUpCount++;
      }
    }

    // --- Expiration warnings for quotations expiring within 3 days ---
    const expirationCandidates = await Quotation.find({
      status: { $in: ['SENT', 'VIEWED'] },
      validUntil: { $gte: now, $lte: threeDaysFromNow },
      isDeleted: false,
    }).lean();

    let expirationWarningCount = 0;

    for (const q of expirationCandidates) {
      const existingReminder = await QuotationReminder.findOne({
        quotationId: q._id,
        type: 'expiration_warning',
        status: 'PENDING',
      });

      if (!existingReminder) {
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
      module: 'jobs',
      action: 'quotation-follow-up',
      followUpCount,
      expirationWarningCount,
    });

    return { followUpCount, expirationWarningCount };
  }
}

export default QuotationFollowUpWorker;
