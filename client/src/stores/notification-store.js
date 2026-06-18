import { create } from 'zustand';

function getNotificationId(notification) {
  const id = notification?._id ?? notification?.id;
  return id == null ? '' : String(id);
}

export const useNotificationStore = create((set) => ({
  notifications: [],
  unreadCount: 0,

  setUnreadCount: (count) => set({ unreadCount: count }),

  addNotification: (notification) =>
    set((state) => {
      const id = getNotificationId(notification);
      const exists = state.notifications.some((n) => getNotificationId(n) === id);
      const notifications = exists
        ? state.notifications.map((n) => (getNotificationId(n) === id ? { ...n, ...notification } : n))
        : [notification, ...state.notifications].slice(0, 50);

      return {
        notifications,
        unreadCount: exists || notification.isRead ? state.unreadCount : state.unreadCount + 1,
      };
    }),

  markAsRead: (id) =>
    set((state) => {
      const existing = state.notifications.find((n) => getNotificationId(n) === String(id));
      const shouldDecrement = existing ? !existing.isRead : true;

      return {
        notifications: state.notifications.map((n) =>
          getNotificationId(n) === String(id) ? { ...n, isRead: true } : n
        ),
        unreadCount: Math.max(0, state.unreadCount - (shouldDecrement ? 1 : 0)),
      };
    }),

  markAllAsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
      unreadCount: 0,
    })),

  dismissNotification: (id) =>
    set((state) => {
      const existing = state.notifications.find((n) => getNotificationId(n) === String(id));
      return {
        notifications: state.notifications.filter((n) => getNotificationId(n) !== String(id)),
        unreadCount: Math.max(0, state.unreadCount - (existing && !existing.isRead ? 1 : 0)),
      };
    }),

  clearNotifications: () => set({ notifications: [], unreadCount: 0 }),
}));
