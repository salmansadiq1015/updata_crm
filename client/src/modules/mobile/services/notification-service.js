import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const notificationService = {
  async getNotifications(params = {}) {
    const res = await apiClient.get(ENDPOINTS.MOBILE.NOTIFICATIONS, { params });
    return res.data;
  },

  async markRead(id) {
    const res = await apiClient.put(ENDPOINTS.MOBILE.NOTIFICATION_READ(id));
    return res.data;
  },

  async getPreferences() {
    const res = await apiClient.get(ENDPOINTS.MOBILE.NOTIFICATION_PREFS);
    return res.data;
  },

  async updatePreferences(data) {
    const res = await apiClient.put(ENDPOINTS.MOBILE.NOTIFICATION_PREFS, data);
    return res.data;
  },
};
