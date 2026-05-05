import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

const E = ENDPOINTS.NOTIFICATIONS;

export const notificationFeedService = {
  getFeed: (params = {}) => apiClient.get(E.FEED, { params }),
  getUnreadCount: () => apiClient.get(E.UNREAD_COUNT),
  markRead: (id) => apiClient.patch(E.MARK_READ(id)),
  markAllRead: () => apiClient.post(E.MARK_ALL_READ),
  dismiss: (id) => apiClient.delete(E.DISMISS(id)),
};
