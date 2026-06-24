import logger from '../../../shared/logger/index.js';

const IN_APP_TITLE_MAX_LENGTH = 255;
const IN_APP_BODY_MAX_LENGTH = 1000;

function compactText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function firstNonEmptyText(...values) {
  for (const value of values) {
    const text = compactText(value);
    if (text) return text;
  }
  return '';
}

function truncateText(value, maxLength) {
  const text = compactText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

class InAppAdapter {
  async send(delivery, content) {
    try {
      const InAppNotification = (await import('../inAppNotification.model.js')).default;
      const title = truncateText(
        firstNonEmptyText(content.subject, content.title, content.body, 'Notification'),
        IN_APP_TITLE_MAX_LENGTH,
      );
      const body = truncateText(
        firstNonEmptyText(
          content.body,
          content.message,
          content.description,
          content.bodyHtml,
          title,
          'Notification',
        ),
        IN_APP_BODY_MAX_LENGTH,
      );

      const inApp = await InAppNotification.create({
        userId: delivery.recipientId,
        notificationId: delivery.notificationId,
        category: content.category || 'SYSTEM',
        priority: content.priority || 'NORMAL',
        icon: content.icon || null,
        title,
        body,
        deepLink: content.deepLink || null,
        relatedEntityType: content.relatedEntityType || null,
        relatedEntityId: content.relatedEntityId || null,
        sentAt: new Date(),
      });

      try {
        if (global.io) {
          const userId = delivery.recipientId?.toString();
          global.io.to(userId).emit('newNotification', {
            id: inApp._id,
            category: inApp.category,
            priority: inApp.priority,
            title: inApp.title,
            body: inApp.body,
            deepLink: inApp.deepLink,
            relatedEntityType: inApp.relatedEntityType,
            relatedEntityId: inApp.relatedEntityId,
            sentAt: inApp.sentAt,
          });

          const unreadCount = await InAppNotification.countDocuments({
            userId: delivery.recipientId,
            isRead: false,
            isDismissed: false,
          });
          global.io.to(userId).emit('unreadCount', { count: unreadCount });
        }
      } catch (socketErr) {
        logger.warn('Socket.IO emit failed (non-critical)', { module: 'notifications', error: { message: socketErr.message } });
      }

      logger.info('In-app notification created', {
        module: 'notifications', channel: 'in_app',
        recipientId: delivery.recipientId?.toString(),
        inAppId: inApp._id?.toString(),
      });

      return {
        success: true,
        delivered: true,
        provider: 'in_app',
        providerMessageId: inApp._id?.toString(),
      };
    } catch (err) {
      logger.error('In-app delivery failed', { module: 'notifications', channel: 'in_app', error: { message: err.message } });
      return { success: false, error: err.message };
    }
  }
}

const inAppAdapter = new InAppAdapter();
export default inAppAdapter;
