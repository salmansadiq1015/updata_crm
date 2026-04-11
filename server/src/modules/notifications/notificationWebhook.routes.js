import { Router } from 'express';
import crypto from 'crypto';
import notificationService from './notification.service.js';
import logger from '../../shared/logger/index.js';

/**
 * Notification webhook routes.
 * NO authentication — external providers post delivery status updates here.
 * HMAC signature verification is used instead.
 */
const router = Router();

function verifySignature(req, secretEnvKey) {
  const signature = req.headers['x-webhook-signature'] || req.headers['x-hub-signature-256'] || '';
  const secret = process.env[secretEnvKey];

  if (!secret) {
    logger.warn('Webhook secret not configured', {
      module: 'notifications',
      action: 'webhook.verifySignature',
      secretEnvKey,
    });
    return false;
  }

  const rawBody = JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature, 'utf8'),
    Buffer.from(expectedSignature, 'utf8'),
  );
}

router.post('/email-delivery', async (req, res) => {
  try {
    if (!verifySignature(req, 'NOTIFICATION_EMAIL_WEBHOOK_SECRET')) {
      logger.warn('Invalid email webhook signature', {
        module: 'notifications',
        action: 'webhook.emailDelivery',
      });
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { notificationId, deliveryId, status, bounceReason, messageId } = req.body;

    if (!notificationId || !status) {
      return res.status(400).json({ error: 'notificationId and status are required' });
    }

    await notificationService.handleWebhookUpdate({
      channel: 'EMAIL',
      notificationId,
      deliveryId,
      status,
      bounceReason,
      messageId,
    });

    logger.info('Email delivery webhook processed', {
      module: 'notifications',
      action: 'webhook.emailDelivery',
      notificationId,
      status,
    });

    return res.status(200).json({ received: true });
  } catch (err) {
    logger.error('Email delivery webhook processing failed', {
      module: 'notifications',
      action: 'webhook.emailDelivery',
      error: { message: err.message, stack: err.stack },
    });
    return res.status(200).json({ received: true });
  }
});

router.post('/whatsapp-delivery', async (req, res) => {
  try {
    if (!verifySignature(req, 'NOTIFICATION_WHATSAPP_WEBHOOK_SECRET')) {
      logger.warn('Invalid WhatsApp webhook signature', {
        module: 'notifications',
        action: 'webhook.whatsappDelivery',
      });
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { notificationId, deliveryId, status, errorCode, errorMessage, externalMessageId } = req.body;

    if (!notificationId || !status) {
      return res.status(400).json({ error: 'notificationId and status are required' });
    }

    await notificationService.handleWebhookUpdate({
      channel: 'WHATSAPP',
      notificationId,
      deliveryId,
      status,
      errorCode,
      errorMessage,
      externalMessageId,
    });

    logger.info('WhatsApp delivery webhook processed', {
      module: 'notifications',
      action: 'webhook.whatsappDelivery',
      notificationId,
      status,
    });

    return res.status(200).json({ received: true });
  } catch (err) {
    logger.error('WhatsApp delivery webhook processing failed', {
      module: 'notifications',
      action: 'webhook.whatsappDelivery',
      error: { message: err.message, stack: err.stack },
    });
    return res.status(200).json({ received: true });
  }
});

export default router;
