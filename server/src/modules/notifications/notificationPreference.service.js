import userNotificationPreferenceRepository from './userNotificationPreference.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import auditService from '../auth/audit.service.js';
import logger from '../../shared/logger/index.js';

const PREFERENCE_TTL = { l1Ttl: 60, l2Ttl: 300 };
const MANDATORY_NOTIFICATION_TYPES = new Set(['maintenance_escalated']);

const DEFAULT_PREFERENCES = {
  preferences: [],
  quietHours: {
    enabled: false,
    startTime: '20:00',
    endTime: '07:00',
    timezone: 'Europe/Zurich',
    bypassCritical: true,
  },
};

class NotificationPreferenceService {
  async getPreferences(userId) {
    const cacheKey = `notif:prefs:${userId}`;

    return cacheManager.getOrSet(
      cacheKey,
      async () => {
        const prefs = await userNotificationPreferenceRepository.findByUserId(userId);
        if (prefs) return prefs;

        // Return defaults without persisting (lazy creation)
        return {
          userId,
          ...DEFAULT_PREFERENCES,
        };
      },
      PREFERENCE_TTL,
    );
  }

  async updatePreferences(userId, data, meta = {}) {
    const updateData = {};

    if (data.preferences !== undefined) {
      updateData.preferences = data.preferences.map((entry) => (
        MANDATORY_NOTIFICATION_TYPES.has(entry.notificationType)
          ? { ...entry, enabled: true }
          : entry
      ));
    }

    if (data.quietHours !== undefined) {
      updateData.quietHours = data.quietHours;
    }

    const updated = await userNotificationPreferenceRepository.upsert(userId, updateData);

    await cacheManager.del(`notif:prefs:${userId}`);

    auditService.logEvent({
      eventType: 'notification_preference.updated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: {
        userId,
        updatedFields: Object.keys(updateData),
        preferenceCount: updateData.preferences?.length,
        quietHoursEnabled: updateData.quietHours?.enabled,
      },
      module: 'notifications',
    });

    logger.info('Notification preferences updated', {
      module: 'notifications',
      action: 'updatePreferences',
      userId,
    });

    return updated;
  }

  async isChannelEnabled(userId, notificationType, channel, priority = 'NORMAL') {
    if (priority === 'CRITICAL' || MANDATORY_NOTIFICATION_TYPES.has(notificationType)) {
      return true;
    }

    const prefs = await this.getPreferences(userId);

    if (!prefs.preferences || prefs.preferences.length === 0) {
      // No explicit preferences: all channels enabled by default
      return true;
    }

    const entry = prefs.preferences.find(
      (p) => p.notificationType === notificationType && p.channel === channel,
    );

    // If no explicit preference for this type+channel, default to enabled
    if (!entry) return true;

    return entry.enabled;
  }

  async isInQuietHours(userId, priority) {
    // CRITICAL priority always bypasses quiet hours
    if (priority === 'CRITICAL') return false;

    const prefs = await this.getPreferences(userId);
    const qh = prefs.quietHours;

    if (!qh || !qh.enabled) return false;

    // CRITICAL bypass configured at preference level
    if (priority === 'CRITICAL' && qh.bypassCritical) return false;

    const now = new Date();
    let currentTime;

    try {
      const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: qh.timezone || 'Europe/Zurich',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      currentTime = formatter.format(now);
    } catch {
      // Fallback to UTC if timezone is invalid
      const hours = String(now.getUTCHours()).padStart(2, '0');
      const minutes = String(now.getUTCMinutes()).padStart(2, '0');
      currentTime = `${hours}:${minutes}`;
    }

    const startTime = qh.startTime || '20:00';
    const endTime = qh.endTime || '07:00';

    // Handle overnight quiet hours (e.g., 20:00 - 07:00)
    if (startTime > endTime) {
      return currentTime >= startTime || currentTime < endTime;
    }

    // Same-day quiet hours (e.g., 12:00 - 14:00)
    return currentTime >= startTime && currentTime < endTime;
  }

  getAdminDefaults() {
    return {
      ...DEFAULT_PREFERENCES,
      availableChannels: ['PUSH', 'EMAIL', 'WHATSAPP', 'SMS', 'IN_APP'],
      defaultEnabledChannels: ['PUSH', 'EMAIL', 'IN_APP'],
      quietHoursDefaults: {
        enabled: false,
        startTime: '20:00',
        endTime: '07:00',
        timezone: 'Europe/Zurich',
        bypassCritical: true,
      },
    };
  }
}

const notificationPreferenceService = new NotificationPreferenceService();
export default notificationPreferenceService;
