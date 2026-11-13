'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { showError } from '@/lib/toast';
import { workflowApi } from '../services/workflow-api';
import type { CampaignInput, EventFilters, ListFilters, RunAction, RunFilters, WorkflowGraph, WorkflowSettings } from '../types/workflow-types';

export const workflowKeys = {
  all: ['workflows'] as const,
  catalog: () => ['workflows', 'catalog'] as const,
  templates: () => ['workflows', 'templates'] as const,
  list: (f: ListFilters) => ['workflows', 'list', f] as const,
  detail: (id: string) => ['workflows', 'detail', id] as const,
  versions: (id: string) => ['workflows', 'versions', id] as const,
  campaigns: (f: object) => ['workflows', 'campaigns', f] as const,
  campaign: (id: string) => ['workflows', 'campaign', id] as const,
  runs: (f: RunFilters) => ['workflows', 'runs', f] as const,
  run: (id: string) => ['workflows', 'run', id] as const,
  events: (f: EventFilters) => ['workflows', 'events', f] as const,
  analytics: (p: object) => ['workflows', 'analytics', p] as const,
};

export function useWorkflowCatalog() {
  return useQuery({ queryKey: workflowKeys.catalog(), queryFn: workflowApi.catalog, staleTime: Infinity });
}
export function useWorkflowTemplates() {
  return useQuery({ queryKey: workflowKeys.templates(), queryFn: workflowApi.templates, staleTime: 10 * 60_000 });
}
export function useWorkflows(filters: ListFilters = {}) {
  return useQuery({ queryKey: workflowKeys.list(filters), queryFn: () => workflowApi.list(filters), placeholderData: keepPreviousData, refetchInterval: 30_000 });
}
export function useWorkflow(id: string | null | undefined) {
  return useQuery({ queryKey: workflowKeys.detail(id || ''), queryFn: () => workflowApi.get(id as string), enabled: Boolean(id) });
}
export function useWorkflowVersions(id: string, enabled = true) {
  return useQuery({ queryKey: workflowKeys.versions(id), queryFn: () => workflowApi.versions(id), enabled });
}
export function useWorkflowCampaigns(filters: { workflowId?: string; status?: string; page?: number; limit?: number } = {}) {
  return useQuery({ queryKey: workflowKeys.campaigns(filters), queryFn: () => workflowApi.campaigns(filters), placeholderData: keepPreviousData, refetchInterval: 10_000 });
}
export function useWorkflowCampaign(id: string) {
  return useQuery({ queryKey: workflowKeys.campaign(id), queryFn: () => workflowApi.campaign(id), refetchInterval: 5_000, enabled: Boolean(id) });
}
export function useWorkflowRuns(filters: RunFilters = {}, refetchInterval = 10_000) {
  return useQuery({ queryKey: workflowKeys.runs(filters), queryFn: () => workflowApi.runs(filters), placeholderData: keepPreviousData, refetchInterval });
}
export function useWorkflowRun(id: string) {
  return useQuery({ queryKey: workflowKeys.run(id), queryFn: () => workflowApi.run(id), enabled: Boolean(id), refetchInterval: 5_000 });
}
export function useWorkflowEvents(filters: EventFilters = {}) {
  return useQuery({ queryKey: workflowKeys.events(filters), queryFn: () => workflowApi.events(filters), placeholderData: keepPreviousData, refetchInterval: 15_000 });
}
export function useWorkflowAnalytics(params: { days?: number; workflowId?: string } = {}) {
  return useQuery({ queryKey: workflowKeys.analytics(params), queryFn: () => workflowApi.analytics(params), placeholderData: keepPreviousData, refetchInterval: 30_000 });
}

export function useWorkflowMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: workflowKeys.all });
  const options = { onSuccess: () => { void invalidate(); }, onError: (error: unknown) => showError(error) };
  return {
    create: useMutation({ mutationFn: workflowApi.create, ...options }),
    save: useMutation({
      mutationFn: ({ id, ...input }: { id: string; name?: string; description?: string; graph?: WorkflowGraph; baseRevision?: number; settings?: Partial<WorkflowSettings>; isTemplate?: boolean }) => workflowApi.update(id, input),
      onSuccess: (wf) => { qc.setQueryData(workflowKeys.detail(wf._id), wf); void qc.invalidateQueries({ queryKey: ['workflows', 'list'] }); },
    }),
    publish: useMutation({ mutationFn: ({ id, notes }: { id: string; notes?: string }) => workflowApi.publish(id, notes), onSuccess: (wf) => { qc.setQueryData(workflowKeys.detail(wf._id), wf); void invalidate(); } }),
    setStatus: useMutation({ mutationFn: ({ id, status }: { id: string; status: 'published' | 'paused' | 'archived' }) => workflowApi.setStatus(id, status), ...options }),
    duplicate: useMutation({ mutationFn: (id: string) => workflowApi.duplicate(id), ...options }),
    remove: useMutation({ mutationFn: (id: string) => workflowApi.remove(id), ...options }),
    removeMany: useMutation({ mutationFn: workflowApi.removeMany, ...options }),
    rollback: useMutation({ mutationFn: ({ id, version }: { id: string; version: number }) => workflowApi.rollback(id, version), ...options }),
  };
}

export function useCampaignMutations() {
  const qc = useQueryClient();
  const options = { onSuccess: () => { void qc.invalidateQueries({ queryKey: workflowKeys.all }); }, onError: (error: unknown) => showError(error) };
  return {
    create: useMutation({ mutationFn: (input: CampaignInput) => workflowApi.createCampaign(input), ...options }),
    action: useMutation({ mutationFn: ({ id, action }: { id: string; action: 'start' | 'pause' | 'resume' | 'stop' }) => workflowApi.campaignAction(id, action), ...options }),
  };
}

export function useRunAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, port }: { id: string; action: RunAction; port?: string | null }) => workflowApi.runAction(id, action, port),
    onSuccess: (run) => { qc.setQueryData(workflowKeys.run(run._id), run); void qc.invalidateQueries({ queryKey: ['workflows', 'runs'] }); },
    onError: (error: unknown) => showError(error),
  });
}
