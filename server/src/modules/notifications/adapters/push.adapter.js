import logger from '../../../shared/logger/index.js';

function getOneSignalConfig() {
  const appId = process.env.ONESIGNAL_APP_ID || '';
  const apiKey = process.env.ONESIGNAL_REST_API_KEY || '';
  return { appId, apiKey };
}

export class PushAdapter {
  async send(delivery, content) {
    try {
      const userId = delivery.recipientId?.toString();
      if (!userId) {
        return { success: false, permanent: true, error: 'No recipientId on delivery' };
      }

      const payload = {
        deliveryId: delivery._id?.toString(),
        notificationId: delivery.notificationId?.toString(),
        category: content.category || 'SYSTEM',
        priority: content.priority || 'NORMAL',
        title: content.subject || content.title || 'Notification',
        body: content.body || '',
        icon: content.icon || null,
        deepLink: content.deepLink || null,
        relatedEntityType: content.relatedEntityType || null,
        relatedEntityId: content.relatedEntityId || null,
        sentAt: new Date().toISOString(),
      };

      const socketResult = await this._sendSocket(userId, payload);

      const { appId, apiKey } = getOneSignalConfig();
      if (!appId || !apiKey) {
        if (socketResult.delivered) {
          return {
            success: true,
            delivered: true,
            provider: 'websocket',
            providerMessageId: `ws-${delivery._id}`,
            targetCount: 1,
          };
        }

        return {
          success: false,
          permanent: true,
          provider: 'onesignal',
          error: 'ONESIGNAL_APP_ID or ONESIGNAL_REST_API_KEY is not configured',
          targetCount: 0,
        };
      }

      const pushResult = await this._sendOneSignal(userId, payload);

      if (!pushResult.success && socketResult.delivered) {
        return {
          success: true,
          delivered: true,
          provider: 'websocket',
          providerMessageId: `ws-${delivery._id}`,
          targetCount: 1,
        };
      }

      if (!pushResult.success) {
        return {
          success: false,
          provider: 'onesignal',
          error: pushResult.error,
          targetCount: 0,
        };
      }

      return {
        success: true,
        provider: 'onesignal',
        providerMessageId: pushResult.messageId,
        targetCount: pushResult.recipients,
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

  async _sendSocket(userId, payload) {
    try {
      const { isUserOnline } = await import('../../../shared/socket/socketServer.js');
      if (global.io && isUserOnline(userId)) {
        global.io.to(userId).emit('pushNotification', payload);

        logger.info('Push notification delivered via WebSocket', {
          module: 'notifications',
          channel: 'push',
          recipientId: userId,
          deliveryId: payload.deliveryId,
        });

        return { delivered: true };
      }
    } catch (err) {
      logger.warn('WebSocket push emit failed', {
        module: 'notifications',
        channel: 'push',
        recipientId: userId,
        error: { message: err.message },
      });
    }

    return { delivered: false };
  }

  async _sendOneSignal(userId, payload) {
    const { appId, apiKey } = getOneSignalConfig();

    const data = Object.fromEntries(
      Object.entries({
        deliveryId: payload.deliveryId,
        notificationId: payload.notificationId,
        category: payload.category,
        priority: payload.priority,
        deepLink: payload.deepLink,
        relatedEntityType: payload.relatedEntityType,
        relatedEntityId: payload.relatedEntityId,
        sentAt: payload.sentAt,
      }).filter(([, value]) => value !== null && value !== undefined).map(([key, value]) => [key, String(value)]),
    );

    const body = {
      app_id: appId,
      include_external_user_ids: [userId],
      headings: { en: payload.title },
      contents: { en: payload.body },
      data,
      priority: payload.priority === 'CRITICAL' ? 10 : 5,
      content_available: true,
    };

    const response = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: {
        Authorization: `Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMsg = result.errors
        ? (Array.isArray(result.errors) ? result.errors.join('; ') : JSON.stringify(result.errors))
        : `OneSignal request failed with ${response.status}`;
      logger.warn('OneSignal push failed', {
        module: 'notifications',
        channel: 'push',
        userId,
        status: response.status,
        error: errorMsg,
      });
      return { success: false, error: errorMsg };
    }

    return {
      success: true,
      messageId: result.id || `onesignal-${Date.now()}`,
      recipients: result.recipients || 0,
    };
  }
}

const pushAdapter = new PushAdapter();
export default pushAdapter;
