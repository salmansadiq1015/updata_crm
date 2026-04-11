import DeviceToken from './deviceToken.model.js';
import NotificationLog from './notificationLog.model.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import logger from '../../shared/logger/index.js';

class NotificationService {
  async registerDevice(userId, data) {
    const device = await DeviceToken.findOneAndUpdate(
      { deviceToken: data.deviceToken },
      {
        userId,
        deviceToken: data.deviceToken,
        platform: data.platform,
        deviceId: data.deviceId || null,
        appVersion: data.appVersion || null,
        isActive: true,
        lastUsedAt: new Date(),
      },
      { upsert: true, new: true, runValidators: true },
    );

    logger.info('Device token registered', { module: 'mobile', action: 'notification.registerDevice', userId, platform: data.platform });

    return device;
  }

  async removeDevice(deviceId) {
    const device = await DeviceToken.findOneAndUpdate(
      { _id: deviceId },
      { isActive: false },
      { new: true },
    );

    if (device) {
      logger.info('Device token deactivated', { module: 'mobile', action: 'notification.removeDevice', deviceId });
    }

    return device;
  }

  async sendNotification(userId, notificationData) {
    const NotificationPreference = (await import('./notificationPreference.model.js')).default;

    let prefs = await NotificationPreference.findOne({ userId });
    if (!prefs) {
      prefs = await NotificationPreference.create({ userId });
    }

    // Check quiet hours
    if (prefs.quietHoursEnabled && notificationData.priority !== 'HIGH') {
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const start = prefs.quietHoursStart;
      const end = prefs.quietHoursEnd;

      const inQuietHours = start <= end
        ? currentTime >= start && currentTime < end
        : currentTime >= start || currentTime < end;

      if (inQuietHours) {
        logger.info('Notification suppressed due to quiet hours', {
          module: 'mobile',
          action: 'notification.sendNotification',
          userId,
          notificationType: notificationData.notificationType,
        });
        return null;
      }
    }

    const log = await NotificationLog.create({
      userId,
      notificationType: notificationData.notificationType,
      title: notificationData.title,
      body: notificationData.body,
      deepLink: notificationData.deepLink || null,
      relatedEntityType: notificationData.relatedEntityType || null,
      relatedEntityId: notificationData.relatedEntityId || null,
      sentAt: new Date(),
    });

    await this.invalidateNotificationCache(userId);

    // Placeholder for actual push notification (APNS/FCM integration is Phase B)
    logger.info('Notification created (push delivery pending Phase B)', {
      module: 'mobile',
      action: 'notification.sendNotification',
      notificationId: log._id,
      userId,
      notificationType: notificationData.notificationType,
    });

    return log;
  }

  async listNotifications(userId, { limit = 25, cursor } = {}) {
    const filter = { userId };

    if (cursor) {
      filter.sentAt = { $lt: new Date(cursor) };
    }

    return NotificationLog.find(filter)
      .sort({ sentAt: -1 })
      .limit(limit)
      .lean();
  }

  async markRead(notificationId, userId) {
    return NotificationLog.findOneAndUpdate(
      { _id: notificationId, userId },
      { isRead: true },
      { new: true },
    ).lean();
  }

  async getPreferences(userId) {
    const NotificationPreference = (await import('./notificationPreference.model.js')).default;

    let prefs = await NotificationPreference.findOne({ userId }).lean();
    if (!prefs) {
      const created = await NotificationPreference.create({ userId });
      prefs = created.toObject();
    }
    return prefs;
  }

  async updatePreferences(userId, data) {
    const NotificationPreference = (await import('./notificationPreference.model.js')).default;

    return NotificationPreference.findOneAndUpdate(
      { userId },
      { $set: data },
      { upsert: true, new: true, runValidators: true },
    ).lean();
  }

  async invalidateNotificationCache(userId) {
    await cacheManager.del(`mobile:notifications:${userId}`);
  }
}

const notificationService = new NotificationService();
export default notificationService;
