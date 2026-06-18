import notificationRepository from './notification.repository.js';
import notificationDeliveryRepository from './notificationDelivery.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { AppError, NotFoundError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import queueManager from '../../shared/queue/QueueManager.js';
import logger from '../../shared/logger/index.js';
import { buildNotificationDeepLink } from './notificationDeepLink.js';

const NOTIFICATION_TTL = { l1Ttl: 30, l2Ttl: 120 };
const VALID_CHANNELS = ['PUSH', 'EMAIL', 'WHATSAPP', 'SMS', 'IN_APP'];
const IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000;

class NotificationService {
  async create(data, userId, meta = {}) {
    // Check idempotency
    if (data.idempotencyKey) {
      const existing = await notificationRepository.findByIdempotencyKey(data.idempotencyKey);
      if (existing) {
        const age = Date.now() - new Date(existing.createdAt).getTime();
        if (age < IDEMPOTENCY_WINDOW_MS) {
          throw new AppError(
            'Duplicate notification (idempotency key already exists)',
            409,
            ERROR_CODES.NOTIF_DUPLICATE,
          );
        }
        return existing;
      }
    }

    // Validate channels
    const channels = data.channels || [];
    for (const ch of channels) {
      if (!VALID_CHANNELS.includes(ch)) {
        throw new AppError(
          `Invalid notification channel: ${ch}`,
          400,
          ERROR_CODES.NOTIF_INVALID_CHANNEL,
        );
      }
    }

    if (channels.length === 0) {
      throw new AppError(
        'At least one notification channel is required',
        400,
        ERROR_CODES.NOTIF_INVALID_CHANNEL,
      );
    }

    const notification = await notificationRepository.create({
      ...data,
      status: 'QUEUED',
      createdBy: userId,
    });

    // Enqueue for dispatch
    await queueManager.addJob('notification-dispatch', 'dispatch', {
      notificationId: notification._id.toString(),
    });

    eventBus.publish(EVENT_TYPES.NOTIFICATION_QUEUED, {
      notificationId: notification._id,
      type: notification.type,
      category: notification.category,
      channels,
      recipientCount: (data.recipientIds || []).length,
      createdBy: userId,
    });

    auditService.logEvent({
      eventType: 'notification.created',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: {
        notificationId: notification._id,
        type: notification.type,
        category: notification.category,
        channels,
        recipientCount: (data.recipientIds || []).length,
      },
      module: 'notifications',
    });

    logger.info('Notification created and queued', {
      module: 'notifications',
      action: 'create',
      notificationId: notification._id,
      type: notification.type,
      userId,
    });

    return notification;
  }

  async getById(id) {
    const cacheKey = `notif:notification:${id}`;

    const notification = await cacheManager.getOrSet(
      cacheKey,
      async () => {
        const notif = await notificationRepository.findById(id);
        if (!notif) return null;

        const deliveries = await notificationDeliveryRepository.findByNotificationId(id);

        return { ...notif, deliveries };
      },
      NOTIFICATION_TTL,
    );

    if (!notification) throw new NotFoundError('Notification', id);

    return notification;
  }

  async search(queryParams) {
    const { cursor, limit, sortBy, sortOrder, ...filters } = queryParams;
    const filterKey = Object.entries(filters)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    const cacheKey = `notif:search:${cursor || ''}:${limit}:${sortBy}:${sortOrder}:${filterKey}`;

    return cacheManager.getOrSet(
      cacheKey,
      () => notificationRepository.findWithCursor({ cursor, limit, sortBy, sortOrder, filters }),
      NOTIFICATION_TTL,
    );
  }

  async processDispatch(notificationId) {
    const notification = await notificationRepository.findById(notificationId);
    if (!notification) {
      logger.warn('Notification not found for dispatch', { module: 'notifications', action: 'processDispatch', notificationId });
      return;
    }

    await notificationRepository.updateStatus(notificationId, 'PROCESSING');

    const recipients = await this._resolveRecipients(notification.recipientIds || []);
    const notificationPreferenceService = (await import('./notificationPreference.service.js')).default;
    const notificationTemplateService = (await import('./notificationTemplate.service.js')).default;

    let enqueuedCount = 0;
    let skippedCount = 0;

    for (const recipient of recipients) {
      for (const channel of notification.channels) {
        // Check user channel preference
        const channelEnabled = await notificationPreferenceService.isChannelEnabled(
          recipient._id,
          notification.type,
          channel,
          notification.priority,
        );
        if (!channelEnabled) {
          skippedCount++;
          logger.debug('Channel disabled by user preference', {
            module: 'notifications',
            action: 'processDispatch',
            recipientId: recipient._id,
            channel,
            notificationType: notification.type,
          });
          continue;
        }

        // Check quiet hours (CRITICAL bypasses)
        const inQuietHours = await notificationPreferenceService.isInQuietHours(
          recipient._id,
          notification.priority,
        );
        if (inQuietHours) {
          skippedCount++;
          logger.debug('Skipped due to quiet hours', {
            module: 'notifications',
            action: 'processDispatch',
            recipientId: recipient._id,
            channel,
          });
          continue;
        }

        // Render template
        let renderedContent = {
          subject: notification.payload?.title || notification.type,
          body: notification.payload?.body || '',
          bodyHtml: notification.payload?.bodyHtml || null,
        };

        try {
          const templateResult = await notificationTemplateService.render(
            notification.type,
            channel,
            recipient.language || 'de',
            {
              ...notification.payload,
              recipientName: `${recipient.firstName || ''} ${recipient.lastName || ''}`.trim(),
              firstName: recipient.firstName || '',
              lastName: recipient.lastName || '',
              email: recipient.email || '',
            },
          );
          if (templateResult) {
            renderedContent = templateResult;
          }
        } catch (err) {
          logger.warn('Template rendering failed, using payload fallback', {
            module: 'notifications',
            action: 'processDispatch',
            notificationType: notification.type,
            channel,
            error: err.message,
          });
        }

        // Create delivery record
        const delivery = await notificationDeliveryRepository.create({
          notificationId: notification._id,
          recipientId: recipient._id,
          recipientEmail: recipient.email || null,
          recipientPhone: recipient.phone || null,
          channel,
          status: 'QUEUED',
          renderedSubject: renderedContent.subject || null,
          renderedBody: renderedContent.body || null,
        });

        // Enqueue to channel-specific queue
        const queueName = `notification-${channel.toLowerCase().replace('_', '-')}`;
        await queueManager.addJob(queueName, 'deliver', {
          deliveryId: delivery._id.toString(),
          channel,
        });

        enqueuedCount++;
      }
    }

    // Update notification status
    const finalStatus = skippedCount > 0 && enqueuedCount > 0
      ? 'PARTIAL'
      : enqueuedCount > 0
        ? 'COMPLETED'
        : 'FAILED';

    await notificationRepository.updateStatus(notificationId, finalStatus);

    logger.info('Notification dispatch processed', {
      module: 'notifications',
      action: 'processDispatch',
      notificationId,
      enqueuedCount,
      skippedCount,
      finalStatus,
    });
  }

  async processChannelDelivery(deliveryId, channel) {
    const delivery = await notificationDeliveryRepository.findById(deliveryId);
    if (!delivery) {
      logger.warn('Delivery record not found', { module: 'notifications', action: 'processChannelDelivery', deliveryId });
      return;
    }

    const adapter = await this._getAdapter(channel);

    const content = {
      subject: delivery.renderedSubject,
      body: delivery.renderedBody,
      bodyHtml: delivery.renderedBody,
      recipientName: '',
      category: 'SYSTEM',
    };

    // Enrich content from notification payload
    try {
      const notification = await notificationRepository.findById(delivery.notificationId);
      if (notification) {
        content.category = notification.category || 'SYSTEM';
        content.priority = notification.priority || 'NORMAL';
        content.deepLink = notification.payload?.deepLink
          || buildNotificationDeepLink(notification.sourceEntityType, notification.sourceEntityId);
        content.icon = notification.payload?.icon || null;
        content.whatsappTemplateId = notification.payload?.whatsappTemplateId || null;
        content.language = notification.payload?.language || 'de';
        content.relatedEntityType = notification.sourceEntityType || null;
        content.relatedEntityId = notification.sourceEntityId || null;
      }
    } catch (err) {
      logger.warn('Failed to enrich delivery content from notification', {
        module: 'notifications',
        action: 'processChannelDelivery',
        deliveryId,
        error: err.message,
      });
    }

    const result = await adapter.send(delivery, content);

    if (result.success) {
      const isPending = result.pending === true;

      await notificationDeliveryRepository.updateById(deliveryId, {
        status: isPending ? 'PENDING' : 'SENT',
        providerMessageId: result.providerMessageId || null,
        sentAt: isPending ? null : new Date(),
      });

      if (!isPending) {
        eventBus.publish(EVENT_TYPES.NOTIFICATION_SENT, {
          deliveryId,
          notificationId: delivery.notificationId,
          channel,
          recipientId: delivery.recipientId,
          providerMessageId: result.providerMessageId,
        });

        logger.info('Notification delivered via channel', {
          module: 'notifications',
          action: 'processChannelDelivery',
          deliveryId,
          channel,
          recipientId: delivery.recipientId?.toString(),
        });
      } else {
        logger.info('Notification pending — user offline, will deliver on reconnect', {
          module: 'notifications',
          action: 'processChannelDelivery',
          deliveryId,
          channel,
          recipientId: delivery.recipientId?.toString(),
        });
      }
    } else {
      const newRetryCount = (delivery.retryCount || 0) + 1;
      const maxRetries = delivery.maxRetries || 3;

      const updateData = {
        status: 'FAILED',
        errorMessage: result.error || 'Unknown error',
        failedAt: new Date(),
        retryCount: newRetryCount,
      };

      if (newRetryCount < maxRetries) {
        // Exponential backoff: 30s, 120s, 480s ...
        const delayMs = 30000 * Math.pow(4, newRetryCount - 1);
        updateData.nextRetryAt = new Date(Date.now() + delayMs);
        updateData.status = 'FAILED';
      }

      await notificationDeliveryRepository.updateById(deliveryId, updateData);

      if (newRetryCount < maxRetries) {
        const queueName = `notification-${channel.toLowerCase().replace('_', '-')}`;
        await queueManager.addJob(queueName, 'deliver', {
          deliveryId,
          channel,
        }, { delay: 30000 * Math.pow(4, newRetryCount - 1) });

        logger.warn('Notification delivery failed, scheduled retry', {
          module: 'notifications',
          action: 'processChannelDelivery',
          deliveryId,
          channel,
          retryCount: newRetryCount,
          maxRetries,
          error: result.error,
        });
      } else {
        eventBus.publish(EVENT_TYPES.NOTIFICATION_FAILED, {
          deliveryId,
          notificationId: delivery.notificationId,
          channel,
          recipientId: delivery.recipientId,
          error: result.error,
          retryCount: newRetryCount,
        });

        logger.error('Notification delivery failed permanently', {
          module: 'notifications',
          action: 'processChannelDelivery',
          deliveryId,
          channel,
          error: result.error,
          retryCount: newRetryCount,
        });
      }
    }
  }

  async handleWebhookUpdate(providerMessageId, status, metadata = {}) {
    let deliveryLookup = providerMessageId;
    let nextStatus = status;
    let nextMetadata = metadata;
    let lookupByDeliveryId = false;

    if (providerMessageId && typeof providerMessageId === 'object') {
      const update = providerMessageId;
      deliveryLookup = update.externalMessageId || update.messageId || update.providerMessageId || update.deliveryId;
      nextStatus = update.status;
      nextMetadata = {
        ...update,
        reason: update.bounceReason || update.errorMessage || update.reason,
      };
      lookupByDeliveryId = Boolean(update.deliveryId && !update.externalMessageId && !update.messageId && !update.providerMessageId);
    }

    const normalizedStatus = String(nextStatus || '').toUpperCase();
    const updateData = {
      status: normalizedStatus,
      ...(normalizedStatus === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
      ...(normalizedStatus === 'READ' ? { readAt: new Date() } : {}),
      ...(normalizedStatus === 'BOUNCED' ? { failedAt: new Date(), errorMessage: nextMetadata.reason || 'Bounced' } : {}),
      ...(normalizedStatus === 'FAILED' ? { failedAt: new Date(), errorMessage: nextMetadata.errorMessage || nextMetadata.reason || 'Failed' } : {}),
    };

    const delivery = lookupByDeliveryId
      ? await notificationDeliveryRepository.updateById(deliveryLookup, updateData)
      : await notificationDeliveryRepository.updateByProviderMessageId(deliveryLookup, updateData);

    if (!delivery) {
      logger.warn('Webhook update for unknown providerMessageId', {
        module: 'notifications',
        action: 'handleWebhookUpdate',
        providerMessageId: deliveryLookup,
        status: normalizedStatus,
      });
      return null;
    }

    if (normalizedStatus === 'DELIVERED') {
      eventBus.publish(EVENT_TYPES.NOTIFICATION_DELIVERED, {
        deliveryId: delivery._id,
        notificationId: delivery.notificationId,
        channel: delivery.channel,
        providerMessageId: deliveryLookup,
      });
    } else if (normalizedStatus === 'BOUNCED') {
      eventBus.publish(EVENT_TYPES.NOTIFICATION_BOUNCED, {
        deliveryId: delivery._id,
        notificationId: delivery.notificationId,
        channel: delivery.channel,
        providerMessageId: deliveryLookup,
        reason: nextMetadata.reason,
      });
    }

    logger.info('Webhook delivery status updated', {
      module: 'notifications',
      action: 'handleWebhookUpdate',
      deliveryId: delivery._id,
      providerMessageId: deliveryLookup,
      status: normalizedStatus,
    });

    return delivery;
  }

  async _getAdapter(channel) {
    switch (channel) {
      case 'PUSH':
        return (await import('./adapters/push.adapter.js')).default;
      case 'EMAIL':
        return (await import('./adapters/email.adapter.js')).default;
      case 'WHATSAPP':
        return (await import('./adapters/whatsapp.adapter.js')).default;
      case 'SMS':
        return (await import('./adapters/sms.adapter.js')).default;
      case 'IN_APP':
        return (await import('./adapters/inApp.adapter.js')).default;
      default:
        throw new AppError(`Unsupported notification channel: ${channel}`, 400, ERROR_CODES.NOTIF_INVALID_CHANNEL);
    }
  }

  async _resolveRecipients(recipientIds) {
    if (!recipientIds || recipientIds.length === 0) return [];

    try {
      const mongoose = (await import('mongoose')).default;
      const User = mongoose.model('User');
      return User.find({ _id: { $in: recipientIds } })
        .select('email phone firstName lastName language')
        .lean();
    } catch (err) {
      logger.error('Failed to resolve recipients', {
        module: 'notifications',
        action: '_resolveRecipients',
        recipientCount: recipientIds.length,
        error: err.message,
      });
      return [];
    }
  }
}

const notificationService = new NotificationService();
export default notificationService;
