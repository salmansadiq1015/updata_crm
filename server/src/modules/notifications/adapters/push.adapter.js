import logger from '../../../shared/logger/index.js';

/**
 * Push notification adapter — delivers via WebSocket (Socket.IO).
 * If the user is online, emits 'pushNotification' to their personal room.
 * If the user is offline, returns pending: true so the delivery stays
 * in PENDING status and gets flushed on socket reconnect.
 */
class PushAdapter {
  async send(delivery, content) {
    try {
      const userId = delivery.recipientId?.toString();
      if (!userId) {
        return { success: false, error: 'No recipientId on delivery' };
      }

      const payload = {
        deliveryId: delivery._id?.toString(),
        notificationId: delivery.notificationId?.toString(),
        category: content.category || 'SYSTEM',
        title: content.subject || content.title || 'Notification',
        body: content.body || '',
        icon: content.icon || null,
        deepLink: content.deepLink || null,
        relatedEntityType: content.relatedEntityType || null,
        relatedEntityId: content.relatedEntityId || null,
        sentAt: new Date().toISOString(),
      };

      const { isUserOnline } = await import('../../../shared/socket/socketServer.js');

      if (global.io && isUserOnline(userId)) {
        global.io.to(userId).emit('pushNotification', payload);

        logger.info('Push notification delivered via WebSocket', {
          module: 'notifications',
          channel: 'push',
          recipientId: userId,
          deliveryId: delivery._id?.toString(),
        });

        return { success: true, providerMessageId: `ws-${delivery._id}` };
      }

      // User offline — mark as pending for delivery on reconnect
      logger.debug('Push notification queued (user offline)', {
        module: 'notifications',
        channel: 'push',
        recipientId: userId,
        deliveryId: delivery._id?.toString(),
      });

      return {
        success: true,
        providerMessageId: `ws-pending-${delivery._id}`,
        pending: true,
      };
    } catch (err) {
      logger.error('Push delivery failed', {
        module: 'notifications',
        channel: 'push',
        error: { message: err.message },
      });
      return { success: false, error: err.message };
    }
  }
}

const pushAdapter = new PushAdapter();
export default pushAdapter;
