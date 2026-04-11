'use client';

import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useNotificationStore } from '@/stores/notification-store';
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket/client';

export function SocketProvider({ children }) {
  const { isAuthenticated, accessToken } = useAuthStore();
  const addNotification = useNotificationStore((s) => s.addNotification);
  const prevTokenRef = useRef(null);

  useEffect(() => {
    if (isAuthenticated && accessToken) {
      // Reconnect if token changed
      if (prevTokenRef.current && prevTokenRef.current !== accessToken) {
        disconnectSocket();
      }
      const socket = connectSocket(accessToken);
      prevTokenRef.current = accessToken;

      // Listen for push notifications
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
        // Acknowledge receipt
        socket.emit('ack:notification', { deliveryId: payload.deliveryId });
      });

      // Listen for in-app notifications
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
      });

      // Listen for unread count updates
      socket.on('unreadCount', ({ count }) => {
        useNotificationStore.getState().setUnreadCount(count);
      });

      return () => {
        socket.off('pushNotification');
        socket.off('newNotification');
        socket.off('unreadCount');
      };
    } else {
      disconnectSocket();
      prevTokenRef.current = null;
    }
  }, [isAuthenticated, accessToken, addNotification]);

  return children;
}
