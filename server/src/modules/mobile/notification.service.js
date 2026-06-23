import DeviceToken from './deviceToken.model.js';
import NotificationLog from './notificationLog.model.js';
import InAppNotification from '../notifications/inAppNotification.model.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import logger from '../../shared/logger/index.js';

class NotificationService {
  async registerDevice(userId, data) {
    const deviceToken = data.deviceToken || data.token;
    const deviceId = data.deviceId || data.device_id || null;
    const appVersion = data.appVersion || data.app_version || null;

    const device = await DeviceToken.findOneAndUpdate(
      { deviceToken },
      {
        userId,
        deviceToken,
        platform: data.platform,
        deviceId,
        appVersion,
        isActive: true,
        lastUsedAt: new Date(),
      },
      { upsert: true, returnDocument: 'after', runValidators: true },
    );

    logger.info('Device token registered', { module: 'mobile', action: 'notification.registerDevice', userId, platform: data.platform });

    return device;
  }

  async removeDevice(deviceId) {
    const device = await DeviceToken.findOneAndUpdate(
      { _id: deviceId },
      { isActive: false },
      { returnDocument: 'after' },
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
    const filter = { userId, isDismissed: false };
    if (cursor) filter.sentAt = { $lt: new Date(cursor) };

    const docs = await InAppNotification.find(filter)
      .sort({ sentAt: -1 })
      .limit(limit)
      .lean();

    const nextCursor = docs.length === limit ? docs[docs.length - 1].sentAt.toISOString() : null;
    return { items: docs, nextCursor };
  }

  async markRead(notificationId, userId) {
    return InAppNotification.findOneAndUpdate(
      { _id: notificationId, userId },
      { isRead: true },
      { returnDocument: 'after' },
    ).lean();
  }

  async markAllRead(userId) {
    await InAppNotification.updateMany({ userId, isRead: false }, { $set: { isRead: true } });
    await this.invalidateNotificationCache(userId);
  }

  async getPreferences(userId) {
    const notificationPreferenceService = (await import('../notifications/notificationPreference.service.js')).default;
    return notificationPreferenceService.getPreferences(userId);
  }

  async updatePreferences(userId, data) {
    const notificationPreferenceService = (await import('../notifications/notificationPreference.service.js')).default;
    const normalized = this._normalizePreferencePayload(data);
    return notificationPreferenceService.updatePreferences(userId, normalized);
  }

  _normalizePreferencePayload(data = {}) {
    if (Array.isArray(data.preferences) || data.quietHours) {
      return data;
    }

    const preferenceMap = data.preferences && typeof data.preferences === 'object' ? data.preferences : {};
    const legacyPreferenceMap = {
      newAssignment: 'new_assignment',
      orderChanged: 'order_status_changed',
      chatMessage: 'chat_message',
      dailyReminder: 'task_reminder',
      escalation: 'maintenance_escalated',
    };
    const legacyEntries = Object.entries(legacyPreferenceMap)
      .filter(([key]) => typeof data[key] === 'boolean')
      .map(([key, notificationType]) => [notificationType, data[key]]);

    const entries = [...Object.entries(preferenceMap), ...legacyEntries].map(([notificationType, enabled]) => ({
      notificationType,
      channel: 'PUSH',
      enabled: Boolean(enabled),
    }));

    const quietHours = data.quiet_hours ? {
      enabled: Boolean(data.quiet_hours.enabled),
      startTime: data.quiet_hours.start || data.quiet_hours.startTime || '20:00',
      endTime: data.quiet_hours.end || data.quiet_hours.endTime || '07:00',
      timezone: data.quiet_hours.timezone || 'Europe/Zurich',
      bypassCritical: data.quiet_hours.bypassCritical ?? true,
    } : undefined;

    return {
      ...(entries.length > 0 ? { preferences: entries } : {}),
      ...(quietHours ? { quietHours } : {}),
    };
  }

  async invalidateNotificationCache(userId) {
    await cacheManager.del(`mobile:notifications:${userId}`);
  }
}

const notificationService = new NotificationService();
export default notificationService;
