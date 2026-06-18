import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import {
  normalizeNotificationPreferences,
  toNotificationPreferencesPayload,
} from '../utils/notification-preferences';

export const notificationPreferenceService = {
  getPreferences: async () => {
    const response = await apiClient.get(ENDPOINTS.NOTIFICATIONS.PREFERENCES);
    return normalizeNotificationPreferences(response);
  },
  updatePreferences: async (preferences) => {
    const response = await apiClient.put(
      ENDPOINTS.NOTIFICATIONS.PREFERENCES,
      toNotificationPreferencesPayload(preferences),
    );
    return normalizeNotificationPreferences(response);
  },
};
