import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/queryKeys';

import { callCampaignApi } from '../api/callCampaignApi';
import type { CampaignInput } from '../types';

export function useCallCampaigns(status?: string, q?: string) {
  return useQuery({
    queryKey: queryKeys.callCampaigns.list(status, q),
    queryFn: ({ signal }) => callCampaignApi.campaigns({ status, q }, signal),
  });
}

export function useCallCampaign(id: string, live = false) {
  return useQuery({
    queryKey: queryKeys.callCampaigns.campaign(id),
    queryFn: ({ signal }) => callCampaignApi.campaign(id, signal),
    refetchInterval: live ? 15_000 : false,
  });
}

export function useCampaignTasks(id: string, state?: string) {
  return useQuery({
    queryKey: queryKeys.callCampaigns.tasks(id, state),
    queryFn: ({ signal }) => callCampaignApi.tasks(id, { state }, signal),
  });
}

export function useCampaignEvents(id: string) {
  return useQuery({
    queryKey: queryKeys.callCampaigns.events(id),
    queryFn: ({ signal }) => callCampaignApi.events(id, signal),
  });
}

export function useCallbacks(status: 'pending' | 'overdue' | 'done' | 'cancelled' = 'pending') {
  return useQuery({
    queryKey: queryKeys.callCampaigns.callbacks(status),
    queryFn: ({ signal }) => callCampaignApi.callbacks(status, signal),
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: queryKeys.callCampaigns.all });
}

export function useCreateCallCampaign() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CampaignInput) => callCampaignApi.create(input),
    onSuccess: invalidate,
  });
}

export function useCampaignAction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'start' | 'resume' | 'pause' | 'cancel' }) =>
      callCampaignApi.action(id, action),
    onSuccess: invalidate,
  });
}

export function useRetryTasks() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, taskIds }: { id: string; taskIds?: string[] }) => callCampaignApi.retry(id, taskIds),
    onSuccess: invalidate,
  });
}

export function useCallbackActions() {
  const invalidate = useInvalidate();
  const reschedule = useMutation({
    mutationFn: ({ taskId, ...body }: { taskId: string; at: string; timezone: string; reason?: string }) =>
      callCampaignApi.reschedule(taskId, body),
    onSuccess: invalidate,
  });
  const cancel = useMutation({
    mutationFn: (taskId: string) => callCampaignApi.cancelCallback(taskId),
    onSuccess: invalidate,
  });
  const retrySync = useMutation({
    mutationFn: (taskId: string) => callCampaignApi.retrySync(taskId),
    onSuccess: invalidate,
  });
  return { reschedule, cancel, retrySync };
}
