import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import {
  normalizeNotificationFeedResponse,
  normalizeUnreadCountResponse,
} from '../utils/notification-feed-utils';

const E = ENDPOINTS.NOTIFICATIONS;

export const notificationFeedService = {
  getFeed: async (params = {}) => {
    const response = await apiClient.get(E.FEED, { params });
    return normalizeNotificationFeedResponse(response);
  },
  getUnreadCount: async () => {
    const response = await apiClient.get(E.UNREAD_COUNT);
    return normalizeUnreadCountResponse(response);
  },
  markRead: (id) => apiClient.patch(E.MARK_READ(id)),
  markAllRead: () => apiClient.post(E.MARK_ALL_READ),
  dismiss: (id) => apiClient.delete(E.DISMISS(id)),
};
