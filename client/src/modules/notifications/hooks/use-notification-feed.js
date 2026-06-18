import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { notificationFeedService } from '../services/notification-feed-service';
import { useNotificationStore } from '@/stores/notification-store';
import {
  dismissNotificationFromFeed,
  findNotificationInFeed,
  markAllNotificationsReadInFeed,
  markNotificationReadInFeed,
  normalizeNotificationFeedResponse,
} from '../utils/notification-feed-utils';

export function useNotificationFeed(filters = {}) {
  return useQuery({
    queryKey: queryKeys.notifications.feed(filters),
    queryFn: () => notificationFeedService.getFeed(filters),
  });
}

export function useInfiniteNotificationFeed(filters = {}) {
  return useInfiniteQuery({
    queryKey: queryKeys.notifications.feed(filters),
    initialPageParam: null,
    queryFn: ({ pageParam }) => notificationFeedService.getFeed({
      ...filters,
      cursor: pageParam || undefined,
    }),
    getNextPageParam: (lastPage) => lastPage.pagination?.nextCursor || undefined,
    select: normalizeNotificationFeedResponse,
  });
}

export function useUnreadCount() {
  const storeCount = useNotificationStore((s) => s.unreadCount);
  const { data } = useQuery({
    queryKey: queryKeys.notifications.unreadCount(),
    queryFn: () => notificationFeedService.getUnreadCount(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  return Math.max(data ?? 0, storeCount ?? 0);
}

export function useNotificationMutations() {
  const qc = useQueryClient();
  const storeMarkRead = useNotificationStore((s) => s.markAsRead);
  const storeMarkAll = useNotificationStore((s) => s.markAllAsRead);
  const storeDismiss = useNotificationStore((s) => s.dismissNotification);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['notifications', 'feed'] });
    qc.invalidateQueries({ queryKey: queryKeys.notifications.unreadCount() });
  };

  const getCachedNotification = (id) => {
    const queries = qc.getQueriesData({ queryKey: ['notifications', 'feed'] });
    for (const [, feed] of queries) {
      const notification = findNotificationInFeed(feed, id);
      if (notification) return notification;
    }
    return null;
  };

  const markRead = useMutation({
    mutationFn: (id) => notificationFeedService.markRead(id),
    onMutate: (id) => {
      const cached = getCachedNotification(id);
      storeMarkRead(id);
      qc.setQueriesData({ queryKey: ['notifications', 'feed'] }, (old) => markNotificationReadInFeed(old, id));
      if (!cached || !cached.isRead) {
        qc.setQueryData(queryKeys.notifications.unreadCount(), (old) => Math.max(0, (old ?? 0) - 1));
      }
    },
    onSettled: invalidate,
  });

  const markAllRead = useMutation({
    mutationFn: () => notificationFeedService.markAllRead(),
    onMutate: () => {
      storeMarkAll();
      qc.setQueriesData({ queryKey: ['notifications', 'feed'] }, markAllNotificationsReadInFeed);
      qc.setQueryData(queryKeys.notifications.unreadCount(), 0);
    },
    onSettled: invalidate,
  });

  const dismiss = useMutation({
    mutationFn: (id) => notificationFeedService.dismiss(id),
    onMutate: (id) => {
      const cached = getCachedNotification(id);
      storeDismiss(id);
      qc.setQueriesData({ queryKey: ['notifications', 'feed'] }, (old) => dismissNotificationFromFeed(old, id));
      if (cached && !cached.isRead) {
        qc.setQueryData(queryKeys.notifications.unreadCount(), (old) => Math.max(0, (old ?? 0) - 1));
      }
    },
    onSettled: invalidate,
  });

  return { markRead, markAllRead, dismiss };
}
