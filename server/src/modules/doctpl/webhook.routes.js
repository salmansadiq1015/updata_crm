import { Router } from 'express';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import logger from '../../shared/logger/index.js';
import emailWebhookSecurityService from './emailWebhookSecurity.service.js';

/**
 * Email webhook routes.
 * NO authentication — external webhook provider posts status updates here.
 */
const router = Router();

router.post('/', async (req, res) => {
  try {
    if (!emailWebhookSecurityService.verify(req)) {
      logger.warn('Email webhook rejected due to invalid signature', {
        module: 'doctpl',
        action: 'webhook.email',
      });
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    const { emailRecordId, status, messageId, bounceReason } = req.body;

    if (!emailRecordId || !status) {
      return res.status(400).json({ error: 'emailRecordId and status are required' });
    }

    const { default: emailRecordRepository } = await import('./emailRecord.repository.js');

    const statusMap = {
      delivered: 'DELIVERED',
      bounced: 'BOUNCED',
      failed: 'FAILED',
    };

    const mappedStatus = statusMap[status] || status;
    const details = {};

    if (mappedStatus === 'DELIVERED') {
      details.deliveredAt = new Date();
    } else if (mappedStatus === 'BOUNCED') {
      details.bouncedAt = new Date();
      details.errorMessage = bounceReason || '';
    } else if (mappedStatus === 'FAILED') {
      details.errorMessage = bounceReason || '';
    }

    if (messageId) {
      details.externalId = messageId;
    }

    await emailRecordRepository.updateStatus(emailRecordId, mappedStatus, details);

    // Keep the unified lead-message record in sync with verified provider
    // evidence. The messaging service is loaded lazily to avoid a doctpl cycle.
    if (['DELIVERED', 'BOUNCED', 'FAILED'].includes(mappedStatus)) {
      const { default: messagingService } = await import('../messaging/messaging.service.js');
      await messagingService.applyProviderEvent({
        provider: 'existing_email', providerMessageId: emailRecordId,
        status: mappedStatus.toLowerCase(),
        eventKey: `email:${emailRecordId}:${mappedStatus}:${messageId || ''}`,
        occurredAt: new Date(), payload: { status: mappedStatus, messageId, bounceReason },
      });
      if (mappedStatus === 'BOUNCED') await messagingService.suppressEmailBounce(emailRecordId, bounceReason);
    }

    // Publish appropriate event
    const eventMap = {
      DELIVERED: EVENT_TYPES.DOCTPL_EMAIL_DELIVERED,
      BOUNCED: EVENT_TYPES.DOCTPL_EMAIL_BOUNCED,
      FAILED: EVENT_TYPES.DOCTPL_EMAIL_FAILED,
    };

    if (eventMap[mappedStatus]) {
      eventBus.publish(eventMap[mappedStatus], {
        emailRecordId,
        status: mappedStatus,
      }, { source: 'doctpl:webhook' });
    }

    logger.info('Email webhook processed', {
      module: 'doctpl',
      action: 'webhook.email',
      emailRecordId,
      status: mappedStatus,
    });

    return res.status(200).json({ received: true });
  } catch (err) {
    logger.error('Email webhook processing failed', {
      module: 'doctpl',
      action: 'webhook.email',
      error: { message: err.message, stack: err.stack },
    });
    return res.status(200).json({ received: true });
  }
});

export default router;
