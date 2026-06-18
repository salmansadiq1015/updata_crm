import logger from '../../../shared/logger/index.js';

class InAppAdapter {
  async send(delivery, content) {
    try {
      const InAppNotification = (await import('../inAppNotification.model.js')).default;

      const inApp = await InAppNotification.create({
        userId: delivery.recipientId,
        notificationId: delivery.notificationId,
        category: content.category || 'SYSTEM',
        priority: content.priority || 'NORMAL',
        icon: content.icon || null,
        title: content.subject || content.title || 'Notification',
        body: content.body || '',
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

      return { success: true, providerMessageId: inApp._id?.toString() };
    } catch (err) {
      logger.error('In-app delivery failed', { module: 'notifications', channel: 'in_app', error: { message: err.message } });
      return { success: false, error: err.message };
    }
  }
}

const inAppAdapter = new InAppAdapter();
export default inAppAdapter;
