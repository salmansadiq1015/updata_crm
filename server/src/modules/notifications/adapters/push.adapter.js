import logger from '../../../shared/logger/index.js';

const FCM_BATCH_SIZE = 500;
const INVALID_TOKEN_ERRORS = new Set([
  'InvalidRegistration',
  'NotRegistered',
  'registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
]);
const RETRYABLE_FCM_ERRORS = new Set([
  'Unavailable',
  'InternalServerError',
  'messaging/server-unavailable',
  'messaging/internal-error',
  'messaging/unknown-error',
]);

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function getFcmServerKey() {
  return process.env.FCM_SERVER_KEY || process.env.FIREBASE_SERVER_KEY || '';
}

function getFcmSendUrl() {
  return process.env.FCM_SEND_URL || 'https://fcm.googleapis.com/fcm/send';
}

function buildFcmPayload(tokens, payload) {
  return {
    registration_ids: tokens,
    notification: {
      title: payload.title,
      body: payload.body,
    },
    data: Object.fromEntries(
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
    ),
    android: { priority: payload.priority === 'CRITICAL' ? 'high' : 'normal' },
    priority: payload.priority === 'CRITICAL' ? 'high' : 'normal',
    content_available: true,
  };
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
      const deviceTokens = await this._getActiveDeviceTokens(userId);

      if (deviceTokens.length === 0) {
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
          skipped: true,
          reason: 'NO_ACTIVE_PUSH_TARGETS',
          targetCount: 0,
        };
      }

      if (!getFcmServerKey()) {
        return {
          success: false,
          permanent: true,
          provider: 'fcm',
          error: 'FCM_SERVER_KEY or FIREBASE_SERVER_KEY is not configured',
          targetCount: deviceTokens.length,
        };
      }

      const fcmResult = await this._sendFcm(deviceTokens, payload);
      if (fcmResult.invalidTokens.length > 0) {
        await this._deactivateTokens(fcmResult.invalidTokens);
      }

      if (fcmResult.retryableFailures > 0 && fcmResult.successCount === 0 && !socketResult.delivered) {
        return {
          success: false,
          provider: 'fcm',
          error: 'FCM temporarily unavailable',
          targetCount: deviceTokens.length,
          invalidTokenCount: fcmResult.invalidTokens.length,
        };
      }

      if (fcmResult.successCount === 0 && socketResult.delivered) {
        return {
          success: true,
          delivered: true,
          provider: 'websocket',
          providerMessageId: `ws-${delivery._id}`,
          targetCount: 1,
          invalidTokenCount: fcmResult.invalidTokens.length,
        };
      }

      if (fcmResult.successCount === 0) {
        return {
          skipped: true,
          provider: 'fcm',
          reason: 'NO_VALID_PUSH_TOKENS',
          targetCount: deviceTokens.length,
          invalidTokenCount: fcmResult.invalidTokens.length,
        };
      }

      return {
        success: true,
        provider: 'fcm',
        providerMessageId: `fcm-${delivery._id}`,
        targetCount: fcmResult.successCount,
        invalidTokenCount: fcmResult.invalidTokens.length,
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

  async _getActiveDeviceTokens(userId) {
    const DeviceToken = (await import('../../mobile/deviceToken.model.js')).default;
    return DeviceToken.find({ userId, isActive: true })
      .select('deviceToken platform')
      .lean();
  }

  async _sendFcm(deviceTokens, payload) {
    const invalidTokens = [];
    let successCount = 0;
    let retryableFailures = 0;

    for (const batch of chunk(deviceTokens, FCM_BATCH_SIZE)) {
      const tokens = batch.map((device) => device.deviceToken);
      const response = await fetch(getFcmSendUrl(), {
        method: 'POST',
        headers: {
          Authorization: `key=${getFcmServerKey()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildFcmPayload(tokens, payload)),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || `FCM request failed with ${response.status}`);
      }

      successCount += result.success || 0;
      const batchResults = Array.isArray(result.results) ? result.results : [];
      batchResults.forEach((item, index) => {
        if (!item?.error) return;
        if (INVALID_TOKEN_ERRORS.has(item.error)) {
          invalidTokens.push(tokens[index]);
        } else if (RETRYABLE_FCM_ERRORS.has(item.error)) {
          retryableFailures += 1;
        }
      });
    }

    return { successCount, invalidTokens, retryableFailures };
  }

  async _deactivateTokens(tokens) {
    if (!tokens.length) return;
    const DeviceToken = (await import('../../mobile/deviceToken.model.js')).default;
    await DeviceToken.updateMany(
      { deviceToken: { $in: tokens } },
      { $set: { isActive: false } },
    );
  }
}

const pushAdapter = new PushAdapter();
export default pushAdapter;
