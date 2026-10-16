import { z } from 'zod';

import { api } from '@/services/api/apiClient';
import type { CursorPage } from '@/services/api/apiTypes';
import { ENDPOINTS } from '@/services/api/endpoints';

import { notificationFeedSchema, unreadCountSchema, type AppNotification } from '../types';

export const NOTIFICATIONS_PAGE_SIZE = 30;

export const notificationsApi = {
  /** GET /users/me/notifications — newest first, cursor-paginated. */
  async feed(cursor: string | undefined, signal?: AbortSignal): Promise<CursorPage<AppNotification>> {
    const { data, pagination } = await api.get(ENDPOINTS.notifications.feed, notificationFeedSchema, {
      signal,
      params: { limit: NOTIFICATIONS_PAGE_SIZE, cursor },
    });
    return {
      items: data.items,
      pagination: pagination ?? { hasNext: false, nextCursor: null, limit: NOTIFICATIONS_PAGE_SIZE },
    };
  },

  async unreadCount(signal?: AbortSignal): Promise<number> {
    const { data } = await api.get(ENDPOINTS.notifications.unreadCount, unreadCountSchema, { signal });
    return data.unreadCount;
  },

  async markRead(id: string): Promise<void> {
    await api.patch(ENDPOINTS.notifications.markRead(id), undefined, z.unknown());
  },

  async markAllRead(): Promise<void> {
    await api.post(ENDPOINTS.notifications.markAllRead, undefined, z.unknown());
  },
};
