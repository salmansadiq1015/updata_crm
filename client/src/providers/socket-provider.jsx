'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { useNotificationStore } from '@/stores/notification-store';
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket/client';
import { usePresenceStore } from '@/stores/presence-store';
import { queryKeys } from '@/lib/query/keys';
import {
  mergeNotificationIntoFeed,
  normalizeNotificationItem,
} from '@/modules/notifications/utils/notification-feed-utils';

function mergeIncomingNotification(queryClient, payload) {
  const notification = normalizeNotificationItem(payload);

  queryClient.getQueryCache()
    .findAll({ queryKey: ['notifications', 'feed'] })
    .forEach((query) => {
      const filters = query.queryKey?.[2] || {};
      queryClient.setQueryData(
        query.queryKey,
        (old) => mergeNotificationIntoFeed(old, notification, filters),
      );
    });

  return notification;
}

function isOrderNotification(payload = {}) {
  const entityType = String(payload.relatedEntityType || '').toLowerCase();
  const category = String(payload.category || '').toLowerCase();
  const deepLink = String(payload.deepLink || '').toLowerCase();

  return (
    entityType.includes('assignment') ||
    entityType.includes('order') ||
    category.includes('schedule') ||
    category.includes('order') ||
    deepLink.includes('/orders/') ||
    deepLink.includes('/field-ops/orders')
  );
}

function invalidateOrderQueries(queryClient, payload = {}) {
  if (!isOrderNotification(payload)) return;

  const entityId = payload.relatedEntityId || payload.orderId || payload.assignmentId;
  queryClient.invalidateQueries({ queryKey: ['field-ops', 'orders'] });
  queryClient.invalidateQueries({ queryKey: queryKeys.mobile.orders.all() });

  if (entityId) {
    queryClient.invalidateQueries({ queryKey: queryKeys.mobile.orders.detail(entityId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.mobile.orders.history(entityId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.mobile.reports.byOrder(entityId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.mobile.photos.byOrder(entityId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.mobile.timeEntries.byOrder(entityId) });
    queryClient.invalidateQueries({ queryKey: ['tasks', 'byOrder', entityId] });
  }
}

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
        const notification = mergeIncomingNotification(queryClient, {
          id: payload.deliveryId,
          title: payload.title,
          body: payload.body,
          category: payload.category,
          priority: payload.priority,
          deepLink: payload.deepLink,
          relatedEntityType: payload.relatedEntityType,
          relatedEntityId: payload.relatedEntityId,
          sentAt: payload.sentAt,
          isRead: false,
        });
        addNotification(notification);
        socket.emit('ack:notification', { deliveryId: payload.deliveryId });
        invalidateOrderQueries(queryClient, payload);
        queryClient.invalidateQueries({ queryKey: queryKeys.mobile.notifications.list() });
        queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unreadCount() });
      });

      // Listen for in-app notifications (InApp adapter)
      socket.on('newNotification', (payload) => {
        const notification = mergeIncomingNotification(queryClient, {
          id: payload.id,
          title: payload.title,
          body: payload.body,
          category: payload.category,
          priority: payload.priority,
          deepLink: payload.deepLink,
          relatedEntityType: payload.relatedEntityType,
          relatedEntityId: payload.relatedEntityId,
          sentAt: payload.sentAt,
          isRead: false,
        });
        addNotification(notification);
        invalidateOrderQueries(queryClient, payload);
        queryClient.invalidateQueries({ queryKey: queryKeys.mobile.notifications.list() });
        queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unreadCount() });
      });

      // Unread count from server — update Zustand (used by bell badge)
      socket.on('unreadCount', ({ count }) => {
        useNotificationStore.getState().setUnreadCount(count);
        queryClient.setQueryData(queryKeys.notifications.unreadCount(), count);
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
