'use client';

import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { notificationService } from '../services/notification-service';
import { db } from '../db/mobile-db';
import { useOfflineQuery } from './use-offline-query';
import { getExistingSocket } from '../lib/websocket-client';
import { useMobileUIStore } from '../stores/mobile-ui-store';

export function useNotifications(params = {}) {
  const queryClient = useQueryClient();
  const setUnreadCount = useMobileUIStore((s) => s.setUnreadCount);

  const query = useOfflineQuery({
    queryKey: queryKeys.mobile.notifications.list(),
    queryFn: () => notificationService.getNotifications(params),
    offlineFn: () => db.notifications.orderBy('received_at').reverse().toArray(),
    onServerData: async (res) => {
      const items = Array.isArray(res) ? res : res?.data || [];
      for (const n of items) {
        await db.notifications.put(n);
      }
      const unread = items.filter((n) => !n.is_read).length;
      setUnreadCount(unread);
    },
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    const socket = getExistingSocket();
    if (!socket) return;

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mobile.notifications.list() });
    };

    socket.on('pushNotification', invalidate);
    socket.on('newNotification', invalidate);

    return () => {
      socket.off('pushNotification', invalidate);
      socket.off('newNotification', invalidate);
    };
  }, [queryClient]);

  return query;
}

export function useNotificationMutations() {
  const queryClient = useQueryClient();
  const keys = [queryKeys.mobile.notifications.list()];

  const markRead = useMutation({
    mutationFn: (id) => notificationService.markRead(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: keys[0] });
      const previous = queryClient.getQueryData(keys[0]);
      queryClient.setQueryData(keys[0], (old) =>
        Array.isArray(old) ? old.map((n) => (n.id === id ? { ...n, is_read: true } : n)) : old
      );
      await db.notifications.update(id, { is_read: true });
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(keys[0], context.previous);
    },
    onSettled: () => {
      keys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const unread = await db.notifications.filter((n) => !n.is_read).toArray();
      for (const n of unread) {
        await notificationService.markRead(n.id);
      }
    },
    onSuccess: () => {
      keys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
    },
  });

  return { markRead, markAllRead };
}

export function useNotificationPreferences() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useOfflineQuery({
    queryKey: queryKeys.mobile.notifications.preferences(),
    queryFn: () => notificationService.getPreferences(),
    offlineFn: () => null,
    staleTime: 30 * 60 * 1000,
  });

  const updatePreferences = useMutation({
    mutationFn: (prefs) => notificationService.updatePreferences(prefs),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mobile.notifications.preferences() });
    },
  });

  return { preferences: data, isLoading, updatePreferences };
}
