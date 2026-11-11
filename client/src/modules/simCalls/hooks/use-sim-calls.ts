'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { showError, showSuccess } from '@/lib/toast';
import { simCallsApi } from '../services/sim-calls-api';
import type { CreateSimCallCampaignInput } from '../types/sim-call-types';

export const simCallKeys = {
  all: ['sim-calls'] as const,
  list: (params: Record<string, unknown>) => ['sim-calls', 'list', params] as const,
  stats: ['sim-calls', 'stats'] as const,
  campaign: (id: string) => ['sim-calls', 'campaign', id] as const,
  tasks: (id: string, params: Record<string, unknown>) => ['sim-calls', 'tasks', id, params] as const,
  events: (id: string) => ['sim-calls', 'events', id] as const,
  callbacks: (status: string) => ['sim-calls', 'callbacks', status] as const,
};

const errorMessage = (e: unknown) =>
  (e as { response?: { data?: { error?: { message?: string } } }; message?: string })?.response?.data?.error?.message
  ?? (e as Error)?.message ?? 'Request failed';

export function useSimCallCampaigns(params: { status?: string; q?: string; page?: number } = {}) {
  return useQuery({
    queryKey: simCallKeys.list(params),
    queryFn: () => simCallsApi.list({ limit: 20, ...params }),
    refetchInterval: 20000,
    placeholderData: (previous) => previous,
  });
}

/** Totals across every campaign (not just the visible page); mutations invalidate simCallKeys.all. */
export function useSimCallStats() {
  return useQuery({ queryKey: simCallKeys.stats, queryFn: () => simCallsApi.stats(), refetchInterval: 30000 });
}

export function useSimCallCampaign(id: string | null) {
  return useQuery({
    queryKey: simCallKeys.campaign(id || ''),
    queryFn: () => simCallsApi.get(id as string),
    enabled: Boolean(id),
    refetchInterval: (query) => (query.state.data?.status === 'running' ? 10000 : false),
  });
}

export function useSimCallTasks(id: string | null, params: { state?: string; outcome?: string; q?: string; page?: number } = {}) {
  return useQuery({
    queryKey: simCallKeys.tasks(id || '', params),
    queryFn: () => simCallsApi.tasks(id as string, { limit: 50, ...params }),
    enabled: Boolean(id),
    placeholderData: (previous) => previous,
  });
}

export function useSimCallEvents(id: string | null) {
  return useQuery({ queryKey: simCallKeys.events(id || ''), queryFn: () => simCallsApi.events(id as string, { limit: 50 }), enabled: Boolean(id) });
}

export function useSimCallbacks(status: 'pending' | 'overdue' = 'pending') {
  return useQuery({ queryKey: simCallKeys.callbacks(status), queryFn: () => simCallsApi.callbacks({ status, limit: 100 }), refetchInterval: 60000 });
}

export function useSimCallMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: simCallKeys.all });
  const onError = (e: unknown) => showError(errorMessage(e));
  return {
    create: useMutation({
      mutationFn: (input: CreateSimCallCampaignInput) => simCallsApi.create(input),
      onSuccess: () => { showSuccess('Call campaign created'); void invalidate(); },
      onError,
    }),
    action: useMutation({
      mutationFn: ({ id, action }: { id: string; action: 'start' | 'resume' | 'pause' | 'cancel' }) => simCallsApi.action(id, action),
      onSuccess: () => void invalidate(),
      onError,
    }),
    retry: useMutation({
      mutationFn: ({ id, taskIds }: { id: string; taskIds?: string[] }) => simCallsApi.retry(id, taskIds),
      onSuccess: (r) => { showSuccess(`${r.retried} lead(s) queued again`); void invalidate(); },
      onError,
    }),
    retrySync: useMutation({ mutationFn: (taskId: string) => simCallsApi.retrySync(taskId), onSuccess: () => void invalidate(), onError }),
    reschedule: useMutation({
      mutationFn: ({ taskId, ...body }: { taskId: string; at: string; timezone: string; reason?: string }) => simCallsApi.reschedule(taskId, body),
      onSuccess: () => { showSuccess('Callback rescheduled'); void invalidate(); },
      onError,
    }),
    cancelCallback: useMutation({ mutationFn: (taskId: string) => simCallsApi.cancelCallback(taskId), onSuccess: () => void invalidate(), onError }),
  };
}
