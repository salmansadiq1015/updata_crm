import { BaseWorker } from '../shared/queue/BaseWorker.js';
import eventBus from '../shared/events/EventBus.js';
import EVENT_TYPES from '../shared/events/eventTypes.js';
import logger from '../shared/logger/index.js';

const BATCH_SIZE = 100;

/**
 * Newsletter dispatch job.
 *
 * Processes newsletter deliveries in batches of 100.
 * For each pending delivery: enqueues an individual email via the
 * 'auth-email' queue, then updates the delivery record.
 * On completion: sets the newsletter status to 'sent' with sentAt timestamp.
 */
export class NewsletterDispatchWorker extends BaseWorker {
  constructor() {
    super('newsletter-dispatch');
  }

  async process(job) {
    const { newsletterId, userId } = job.data;

    const Newsletter = (await import('../modules/crm/newsletter/newsletter.model.js')).default;
    const NewsletterDelivery = (await import('../modules/crm/newsletter/newsletterDelivery.model.js')).default;
    const newsletterRepository = (await import('../modules/crm/newsletter/newsletter.repository.js')).default;
    const newsletterService = (await import('../modules/crm/newsletter/newsletter.service.js')).default;
    const config = (await import('../config/index.js')).default;

    const newsletter = await Newsletter.findById(newsletterId);
    if (!newsletter) {
      logger.warn('Newsletter not found for dispatch', {
        module: 'jobs',
        action: 'newsletter-dispatch',
        newsletterId,
      });
      return { sent: false, reason: 'newsletter_not_found' };
    }

    let totalProcessed = 0;
    let totalFailed = 0;
    let hasMore = true;

    while (hasMore) {
      // Fetch next batch of pending deliveries
      const deliveries = await NewsletterDelivery.find({
        newsletterId,
        status: 'pending',
      })
        .limit(BATCH_SIZE)
        .lean();

      if (deliveries.length === 0) {
        hasMore = false;
        break;
      }

      for (const delivery of deliveries) {
        try {
          // nDSG (CRM-013 AC-10): every newsletter email MUST carry a working
          // per-recipient unsubscribe link. Build the absolute URL using the
          // HMAC token helper so each link unsubscribes the right customer.
          const token = newsletterService.unsubscribeToken(delivery.customerId);
          const unsubscribeUrl = `${config.client.uri}/api/v1/crm/newsletters/unsubscribe`
            + `?customerId=${encodeURIComponent(String(delivery.customerId))}`
            + `&token=${encodeURIComponent(token)}`;
          const unsubscribeFooter = `<p style="font-size:12px;color:#888">Abmelden / Unsubscribe: `
            + `<a href="${unsubscribeUrl}">hier</a></p>`;
          const bodyHtml = `${newsletter.bodyHtml || ''}${unsubscribeFooter}`;

          // Enqueue individual email via the existing email dispatch infrastructure
          const sendMail = (await import('../shared/mail/mail.js')).default;
          await sendMail({
            email: delivery.email,
            subject: newsletter.subject,
            template: 'newsletter.ejs',
            data: { subject: newsletter.subject, bodyHtml },
            fromName: 'MB Boiler',
          });

          // Mark delivery as sent
          await NewsletterDelivery.findByIdAndUpdate(delivery._id, {
            $set: { status: 'sent', sentAt: new Date() },
          });

          totalProcessed++;
        } catch (err) {
          // Mark delivery as failed
          await NewsletterDelivery.findByIdAndUpdate(delivery._id, {
            $set: {
              status: 'failed',
              failedAt: new Date(),
              errorMessage: err.message,
            },
          });

          totalFailed++;

          logger.error('Newsletter email delivery failed', {
            module: 'jobs',
            action: 'newsletter-dispatch',
            newsletterId,
            deliveryId: delivery._id,
            email: delivery.email,
            error: { message: err.message },
          });
        }
      }

      // Update stats after each batch
      await newsletterRepository.updateStats(newsletterId);

      // Report progress
      const progress = Math.round(
        ((totalProcessed + totalFailed) / (newsletter.recipientCount || 1)) * 100,
      );
      await job.updateProgress(Math.min(progress, 100));

      // If we got fewer than BATCH_SIZE, we're done
      if (deliveries.length < BATCH_SIZE) {
        hasMore = false;
      }
    }

    // Mark newsletter as sent
    await Newsletter.findByIdAndUpdate(newsletterId, {
      $set: {
        status: 'sent',
        sentAt: new Date(),
      },
    });

    // Final stats update
    await newsletterRepository.updateStats(newsletterId);

    eventBus.publish(EVENT_TYPES.NEWSLETTER_SENT, {
      newsletterId,
      totalProcessed,
      totalFailed,
    }, { source: 'jobs:newsletter-dispatch' });

    logger.info('Newsletter dispatch completed', {
      module: 'jobs',
      action: 'newsletter-dispatch',
      newsletterId,
      totalProcessed,
      totalFailed,
    });

    return { sent: true, totalProcessed, totalFailed };
  }
}

export default NewsletterDispatchWorker;
