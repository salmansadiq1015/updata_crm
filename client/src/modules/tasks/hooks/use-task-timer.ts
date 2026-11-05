'use client';

import { useEffect, useState } from 'react';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/auth-store';
import { useLanguage } from '@/lib/i18n/language-context';
import { taskTimeApi } from '../services/task-time-api';
import type { TimerStartInput } from '../types/task-time-types';

const useUserId = () => useAuthStore((state: { user?: { _id?: string; id?: string } | null }) => state.user?._id ?? state.user?.id);
export const taskTimeKeys = { root: ['task-time'] as const, active: (userId?: string) => ['task-time', 'active', userId] as const };
export const useTaskTimerUi = create<{ focusId: string | null; stopId: string | null; setFocusId: (value: string | null) => void; setStopId: (value: string | null) => void }>((set) => ({
  focusId: null, stopId: null, setFocusId: (focusId) => set({ focusId }), setStopId: (stopId) => set({ stopId }),
}));
export const useTaskTimerBusy = () => useIsMutating({ mutationKey: ['task-timer-control'] }) > 0;

export function useActiveTaskTimer() {
  const userId = useUserId();
  return useQuery({ queryKey: taskTimeKeys.active(userId), queryFn: taskTimeApi.active, enabled: Boolean(userId),
    staleTime: 5000, refetchInterval: 15000, refetchOnWindowFocus: true, refetchOnReconnect: true, retry: 1 });
}

export function useTaskTimeSummary(taskId: string, page: number) {
  const userId = useUserId();
  return useQuery({ queryKey: [...taskTimeKeys.root, 'task', userId, taskId, page], queryFn: () => taskTimeApi.summary(taskId, page),
    enabled: Boolean(taskId && userId), staleTime: 5000, refetchInterval: 15000, refetchOnWindowFocus: true });
}

export function useTaskTimeReport(days: number, scope: 'mine' | 'team') {
  const userId = useUserId();
  return useQuery({ queryKey: [...taskTimeKeys.root, 'report', userId, days, scope], queryFn: () => taskTimeApi.report(days, scope),
    enabled: Boolean(userId), staleTime: 10000, refetchInterval: 30000, refetchOnWindowFocus: true });
}

export function useTaskTimerActions() {
  const qc = useQueryClient();
  const userId = useUserId();
  const { t } = useLanguage();
  const success = (result: Awaited<ReturnType<typeof taskTimeApi.active>>) => {
    qc.setQueryData(taskTimeKeys.active(userId), result);
    void qc.invalidateQueries({ queryKey: taskTimeKeys.root });
  };
  const onError = (error: unknown) => {
    const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : t('tasks.time.failed', 'The timer could not be updated. Please retry.');
    toast.error(message);
    void qc.invalidateQueries({ queryKey: taskTimeKeys.root });
  };
  const online = () => {
    if (!navigator.onLine) throw new Error(t('tasks.time.offline', 'Connect to the internet to change the timer. Your running time is still being recorded.'));
  };
  const start = useMutation({ mutationKey: ['task-timer-control'], networkMode: 'always', mutationFn: (input: TimerStartInput) => { online(); return taskTimeApi.start(input); }, onSuccess: success, onError });
  const change = useMutation({ mutationKey: ['task-timer-control'], networkMode: 'always', mutationFn: ({ sessionId, action, note }: { sessionId: string; action: 'pause' | 'resume' | 'stop'; note?: string }) => {
    online(); return taskTimeApi.transition(sessionId, action, note);
  }, onSuccess: success, onError });
  return { start, change };
}

// Render from server elapsed time plus time since the snapshot reached this browser.
// Browser clock changes and suspended/background intervals do not accumulate drift.
export function useTimerElapsed(timer: ReturnType<typeof useActiveTaskTimer>): number {
  const [now, setNow] = useState(() => performance.now());
  const running = timer.data?.session?.status === 'RUNNING';
  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(() => setNow(performance.now()), 1000);
    return () => window.clearInterval(interval);
  }, [running]);
  const session = timer.data?.session;
  return session ? session.elapsedMs + (running ? Math.max(0, now - (timer.data?.receivedAt ?? now)) : 0) : 0;
}
