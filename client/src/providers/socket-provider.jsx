'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { useNotificationStore } from '@/stores/notification-store';
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket/client';
import { usePresenceStore } from '@/stores/presence-store';
import { queryKeys } from '@/lib/query/keys';

export function SocketProvider({ children }) {
  const { isAuthenticated, accessToken } = useAuthStore();
  const addNotification = useNotificationStore((s) => s.addNotification);
  const queryClient = useQueryClient();
  const prevTokenRef = useRef(null);

  useEffect(() => {
    if (isAuthenticated && accessToken) {
      // Reconnect if token changed
      if (prevTokenRef.current && prevTokenRef.current !== accessToken) {
        disconnectSocket();
      }
      const socket = connectSocket(accessToken);
      prevTokenRef.current = accessToken;

      // Listen for push notifications (buffered for offline users)
      socket.on('pushNotification', (payload) => {
        addNotification({
          id: payload.deliveryId,
          title: payload.title,
          body: payload.body,
          category: payload.category,
          deepLink: payload.deepLink,
          sentAt: payload.sentAt,
          isRead: false,
        });
        socket.emit('ack:notification', { deliveryId: payload.deliveryId });
        queryClient.invalidateQueries({ queryKey: queryKeys.mobile.notifications.list() });
      });

      // Listen for in-app notifications (InApp adapter)
      socket.on('newNotification', (payload) => {
        addNotification({
          id: payload.id,
          title: payload.title,
          body: payload.body,
          category: payload.category,
          deepLink: payload.deepLink,
          sentAt: payload.sentAt,
          isRead: false,
        });
        // Invalidate the notifications list so the page updates instantly
        queryClient.invalidateQueries({ queryKey: queryKeys.mobile.notifications.list() });
      });

      // Unread count from server — update Zustand (used by bell badge)
      socket.on('unreadCount', ({ count }) => {
        useNotificationStore.getState().setUnreadCount(count);
      });

      // Real-time user presence
      socket.on('userStatus', ({ userId, isOnline }) => {
        if (isOnline) usePresenceStore.getState().setOnline(userId);
        else usePresenceStore.getState().setOffline(userId);
      });

      socket.on('userStatus:init', ({ onlineUserIds }) => {
        usePresenceStore.getState().initBulk(onlineUserIds);
      });

      return () => {
        socket.off('pushNotification');
        socket.off('newNotification');
        socket.off('unreadCount');
        socket.off('userStatus');
        socket.off('userStatus:init');
      };
    } else {
      disconnectSocket();
      prevTokenRef.current = null;
    }
  }, [isAuthenticated, accessToken, addNotification, queryClient]);

  return children;
}
