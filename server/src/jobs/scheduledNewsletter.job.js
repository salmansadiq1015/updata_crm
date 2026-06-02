import { BaseWorker } from '../shared/queue/BaseWorker.js';
import logger from '../shared/logger/index.js';

/**
 * Scheduled newsletter dispatch job.
 *
 * Polls for newsletters in 'scheduled' status whose scheduledAt timestamp is
 * due (<= now) and triggers their send. Reuses newsletterService.send() — the
 * SAME method used by immediate send — so per-recipient dispatch is not
 * reimplemented here.
 *
 * Idempotency: send() transitions the newsletter off 'scheduled' (to 'sending'),
 * so a newsletter that has already been dispatched will not be re-picked on the
 * next poll. Each newsletter is wrapped in try/catch so one failure does not
 * abort the rest of the batch.
 *
 * Runs frequently (every 5 minutes) so scheduled sends fire near their time.
 */
export class ScheduledNewsletterWorker extends BaseWorker {
  constructor() {
    super('scheduled-newsletter');
  }

  async process(_job) {
    const now = new Date();

    // Lazy imports to avoid circular dependencies during bootstrap
    const Newsletter = (await import('../modules/crm/newsletter/newsletter.model.js')).default;
    const newsletterService = (await import('../modules/crm/newsletter/newsletter.service.js')).default;

    const due = await Newsletter.find({
      status: 'scheduled',
      scheduledAt: { $ne: null, $lte: now },
    })
      .select('_id createdBy')
      .lean();

    let dispatched = 0;
    let failed = 0;

    for (const newsletter of due) {
      try {
        // Reuse the same dispatch path as immediate send. send() accepts
        // 'scheduled' status, creates delivery records, transitions status to
        // 'sending', and enqueues the newsletter-dispatch batch job.
        await newsletterService.send(newsletter._id, newsletter.createdBy, {
          ipAddress: 'internal',
          userAgent: 'jobs:scheduled-newsletter',
        });
        dispatched++;
      } catch (err) {
        failed++;
        logger.warn('Scheduled newsletter dispatch failed', {
          module: 'jobs',
          action: 'scheduled-newsletter',
          newsletterId: newsletter._id,
          error: { message: err.message },
        });
      }
    }

    logger.info('Scheduled newsletter poll completed', {
      module: 'jobs',
      action: 'scheduled-newsletter',
      candidates: due.length,
      dispatched,
      failed,
    });

    return { dispatched };
  }
}

export default ScheduledNewsletterWorker;
