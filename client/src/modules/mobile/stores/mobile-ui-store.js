import { create } from 'zustand';

export const useMobileUIStore = create((set) => ({
  activeTimerOrderId: null,
  isTimerRunning: false,
  timerStartedAt: null,
  timerActivityType: null,
  breakStartedAt: null,
  unreadCount: 0,
  setUnreadCount: (count) => set({ unreadCount: count }),

  startTimer: (orderId, activityType) =>
    set({
      activeTimerOrderId: orderId,
      isTimerRunning: true,
      timerStartedAt: new Date().toISOString(),
      timerActivityType: activityType,
      breakStartedAt: null,
    }),

  pauseTimer: () =>
    set({ isTimerRunning: false }),

  resumeTimer: () =>
    set({ isTimerRunning: true, breakStartedAt: null }),

  startBreak: () =>
    set({ isTimerRunning: false, breakStartedAt: new Date().toISOString() }),

  stopTimer: () =>
    set({
      activeTimerOrderId: null,
      isTimerRunning: false,
      timerStartedAt: null,
      timerActivityType: null,
      breakStartedAt: null,
    }),
}));
