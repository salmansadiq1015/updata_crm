import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';

import { queryKeys } from '@/constants/queryKeys';
import type { CursorPage } from '@/services/api/apiTypes';
import { showApiErrorToast, showSuccessToast } from '@/utils/toast';
import { i18next } from '@/i18n';

import { notificationsApi } from '../api/notificationsApi';
import type { AppNotification } from '../types';

type FeedData = InfiniteData<CursorPage<AppNotification>, string | undefined>;

export function useNotificationFeed() {
  return useInfiniteQuery({
    queryKey: queryKeys.notifications.feed,
    queryFn: ({ pageParam, signal }) => notificationsApi.feed(pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.pagination.hasNext ? (last.pagination.nextCursor ?? undefined) : undefined,
  });
}

/**
 * Badge count. Polled every minute while the app is in the foreground; polling
 * stops after an error (e.g. 403 for users without `notifications:feed`).
 */
export function useUnreadCount() {
  return useQuery({
    queryKey: queryKeys.notifications.unreadCount,
    queryFn: ({ signal }) => notificationsApi.unreadCount(signal),
    refetchInterval: (query) => (query.state.status === 'error' ? false : 60_000),
  });
}

function setReadInFeed(data: FeedData | undefined, isMatch: (item: AppNotification) => boolean) {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((item) => (isMatch(item) ? { ...item, isRead: true } : item)),
    })),
  };
}

export function useMarkNotificationRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: (_result, id) => {
      client.setQueryData<FeedData>(queryKeys.notifications.feed, (data) =>
        setReadInFeed(data, (n) => n.id === id),
      );
      void client.invalidateQueries({ queryKey: queryKeys.notifications.unreadCount });
    },
    onError: showApiErrorToast,
  });
}

export function useMarkAllNotificationsRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      client.setQueryData<FeedData>(queryKeys.notifications.feed, (data) => setReadInFeed(data, () => true));
      client.setQueryData(queryKeys.notifications.unreadCount, 0);
      showSuccessToast(i18next.t('notifications.markedAllRead'));
    },
    onError: showApiErrorToast,
  });
}
