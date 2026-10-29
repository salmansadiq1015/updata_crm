'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { showError } from '@/lib/toast';
import { callingQualityApi } from '../services/calling-quality-api';
import type { QualityFilters, QualityFlag } from '../types/calling-quality-types';

const key = ['ai-calling', 'quality'] as const;

export function useQualitySummary(filters: QualityFilters) {
  return useQuery({ queryKey: [...key, 'summary', filters], queryFn: () => callingQualityApi.summary(filters), refetchInterval: 60_000 });
}
export function useFlaggedCalls(filters: QualityFilters & { reason?: QualityFlag; page?: number }) {
  return useQuery({ queryKey: [...key, 'flagged', filters], queryFn: () => callingQualityApi.flagged(filters) });
}

export function useBenchmarkSuites() {
  return useQuery({ queryKey: [...key, 'suites'], queryFn: () => callingQualityApi.suites() });
}
export function useBenchmarkSuite(id: string | null) {
  return useQuery({ queryKey: [...key, 'suite', id], queryFn: () => callingQualityApi.suite(id!), enabled: Boolean(id) });
}
export function useBenchmarkRuns(suiteId: string | null) {
  return useQuery({
    queryKey: [...key, 'runs', suiteId], queryFn: () => callingQualityApi.runs(suiteId!), enabled: Boolean(suiteId),
    refetchInterval: q => (q.state.data?.some(r => r.status === 'queued' || r.status === 'running') ? 3000 : false),
  });
}
export function useBenchmarkRun(runId: string | null) {
  return useQuery({ queryKey: [...key, 'run', runId], queryFn: () => callingQualityApi.run(runId!), enabled: Boolean(runId) });
}
export function useRunComparison(a: string | null, b: string | null) {
  return useQuery({ queryKey: [...key, 'compare', a, b], queryFn: () => callingQualityApi.compare(a!, b!), enabled: Boolean(a && b && a !== b) });
}

export function useScriptVersions(agentId: string) {
  return useQuery({ queryKey: [...key, 'versions', agentId], queryFn: () => callingQualityApi.versions(agentId), enabled: Boolean(agentId) });
}
export function useScriptState(agentId: string) {
  return useQuery({ queryKey: [...key, 'script-state', agentId], queryFn: () => callingQualityApi.scriptState(agentId) });
}
export function useExperiments(agentId: string) {
  return useQuery({ queryKey: [...key, 'experiments', agentId], queryFn: () => callingQualityApi.experiments(agentId) });
}
export function useExperiment(id: string | null) {
  return useQuery({ queryKey: [...key, 'experiment', id], queryFn: () => callingQualityApi.experiment(id!), enabled: Boolean(id), refetchInterval: 30_000 });
}

/** Every write refreshes all quality/benchmark/experiment views (and the agent, which promote/rollback rewrite). */
export function useQualityMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['ai-calling'] }); },
    onError: (error: unknown) => showError(error),
  });
}
