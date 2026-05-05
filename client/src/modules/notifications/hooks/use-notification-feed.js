import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { notificationFeedService } from '../services/notification-feed-service';
import { useNotificationStore } from '@/stores/notification-store';

export function useNotificationFeed(filters = {}) {
  return useQuery({
    queryKey: queryKeys.notifications.feed(filters),
    queryFn: () => notificationFeedService.getFeed(filters),
    select: (data) => (Array.isArray(data) ? data : (data?.items ?? data?.data ?? [])),
  });
}

export function useUnreadCount() {
  const storeCount = useNotificationStore((s) => s.unreadCount);
  const { data } = useQuery({
    queryKey: queryKeys.notifications.unreadCount(),
    queryFn: () => notificationFeedService.getUnreadCount(),
    select: (data) => data?.count ?? data?.unreadCount ?? 0,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  // Real-time store count takes priority when it differs
  return data ?? storeCount;
}

export function useNotificationMutations() {
  const qc = useQueryClient();
  const storeMarkRead = useNotificationStore((s) => s.markAsRead);
  const storeMarkAll = useNotificationStore((s) => s.markAllAsRead);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.notifications.feed({}) });
    qc.invalidateQueries({ queryKey: queryKeys.notifications.unreadCount() });
  };

  const markRead = useMutation({
    mutationFn: (id) => notificationFeedService.markRead(id),
    onMutate: (id) => storeMarkRead(id),
    onSettled: invalidate,
  });

  const markAllRead = useMutation({
    mutationFn: () => notificationFeedService.markAllRead(),
    onMutate: () => storeMarkAll(),
    onSettled: invalidate,
  });

  const dismiss = useMutation({
    mutationFn: (id) => notificationFeedService.dismiss(id),
    onSettled: invalidate,
  });

  return { markRead, markAllRead, dismiss };
}
