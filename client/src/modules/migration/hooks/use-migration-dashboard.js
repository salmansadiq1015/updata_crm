'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { downloadBlob } from '@/lib/api/download';
import { migrationService } from '../services/migration-service';

const RUN_LIMIT = 50;
const ERROR_PAGE_SIZE = 12;
const RUNNING_REFETCH_MS = 5000;

export const migrationQueryKeys = {
  all: ['migration'],
  runs: (filters) => ['migration', 'runs', filters],
  run: (runId) => ['migration', 'run', runId],
  progress: (runId) => ['migration', 'progress', runId],
  report: (runId) => ['migration', 'validation-report', runId],
  errors: (runId, filters) => ['migration', 'errors', runId, filters],
};

function normalizeData(response) {
  return response?.data ?? response ?? null;
}

function normalizeList(response) {
  const data = normalizeData(response);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function buildRunsParams(statusFilter) {
  return {
    limit: RUN_LIMIT,
    ...(statusFilter && statusFilter !== 'all' ? { status: statusFilter } : {}),
  };
}

function buildErrorParams(filters) {
  return {
    pageSize: ERROR_PAGE_SIZE,
    ...(filters.domain && filters.domain !== 'all' ? { domain: filters.domain } : {}),
    ...(filters.severity && filters.severity !== 'all' ? { severity: filters.severity } : {}),
    ...(filters.errorType && filters.errorType !== 'all' ? { errorType: filters.errorType } : {}),
  };
}

const ACTIONS = {
  start: (runId) => migrationService.start(runId),
  pause: (runId) => migrationService.pause(runId),
  resume: (runId) => migrationService.resume(runId),
  cancel: (runId) => migrationService.cancel(runId),
  rollback: (runId, payload) => migrationService.rollback(runId, payload),
  spotCheck: (runId, payload) => migrationService.generateSpotCheck(runId, payload),
};

export function useMigrationDashboard({ statusFilter, errorFilters }) {
  const queryClient = useQueryClient();
  const [selectedRunId, setSelectedRunId] = useState(null);

  const runsParams = useMemo(() => buildRunsParams(statusFilter), [statusFilter]);
  const errorParams = useMemo(() => buildErrorParams(errorFilters), [errorFilters]);

  const runsQuery = useQuery({
    queryKey: migrationQueryKeys.runs(runsParams),
    queryFn: async () => normalizeList(await migrationService.listRuns(runsParams)),
    staleTime: 30_000,
  });

  const runs = useMemo(() => runsQuery.data || [], [runsQuery.data]);

  useEffect(() => {
    if (runsQuery.isLoading) return;
    if (!runs.length) {
      if (selectedRunId) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelectedRunId(null);
      }
      return;
    }
    if (!selectedRunId || !runs.some((run) => run._id === selectedRunId)) {
      setSelectedRunId(runs[0]._id);
    }
  }, [runs, runsQuery.isLoading, selectedRunId]);

  const selectedRunQuery = useQuery({
    queryKey: migrationQueryKeys.run(selectedRunId),
    queryFn: async () => normalizeData(await migrationService.getRun(selectedRunId)),
    enabled: !!selectedRunId,
    refetchInterval: (query) => (query.state.data?.status === 'running' ? RUNNING_REFETCH_MS : false),
  });

  const selectedRun = selectedRunQuery.data || null;
  const isRunning = selectedRun?.status === 'running';

  const progressQuery = useQuery({
    queryKey: migrationQueryKeys.progress(selectedRunId),
    queryFn: async () => normalizeData(await migrationService.progress(selectedRunId)),
    enabled: !!selectedRunId,
    refetchInterval: isRunning ? RUNNING_REFETCH_MS : false,
  });

  const reportQuery = useQuery({
    queryKey: migrationQueryKeys.report(selectedRunId),
    queryFn: async () => normalizeData(await migrationService.validationReport(selectedRunId)),
    enabled: !!selectedRunId,
    refetchInterval: isRunning ? RUNNING_REFETCH_MS : false,
  });

  const errorsQuery = useQuery({
    queryKey: migrationQueryKeys.errors(selectedRunId, errorParams),
    queryFn: async () => normalizeData(await migrationService.errors(selectedRunId, errorParams)),
    enabled: !!selectedRunId,
    refetchInterval: isRunning ? RUNNING_REFETCH_MS : false,
  });

  const refreshAll = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: migrationQueryKeys.all });
  }, [queryClient]);

  const createRunMutation = useMutation({
    mutationFn: (payload) => migrationService.createRun(payload),
    onSuccess: async (response) => {
      const run = normalizeData(response);
      if (run?._id) setSelectedRunId(run._id);
      await refreshAll();
    },
  });

  const actionMutation = useMutation({
    mutationFn: ({ type, payload }) => {
      const action = ACTIONS[type];
      if (!selectedRunId || !action) return Promise.resolve(null);
      return action(selectedRunId, payload);
    },
    onSuccess: refreshAll,
  });

  const exportErrorsMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRunId) return null;
      const response = await migrationService.exportErrors(selectedRunId, errorParams);
      downloadBlob(response.data, `migration-errors-${selectedRunId}.csv`, 'text/csv;charset=utf-8');
      return true;
    },
  });

  const summary = useMemo(() => ({
    total: runs.length,
    running: runs.filter((run) => run.status === 'running').length,
    completed: runs.filter((run) => run.status === 'completed').length,
    attention: runs.filter((run) => ['failed', 'paused'].includes(run.status)).length,
  }), [runs]);

  return {
    runs,
    selectedRun,
    selectedRunId,
    setSelectedRunId,
    progress: progressQuery.data || null,
    report: reportQuery.data || null,
    errors: normalizeList(errorsQuery.data),
    errorsPagination: errorsQuery.data?.pagination || null,
    summary,
    isInitialLoading: runsQuery.isLoading,
    isRefreshing: runsQuery.isFetching || selectedRunQuery.isFetching || progressQuery.isFetching || reportQuery.isFetching || errorsQuery.isFetching,
    isError: runsQuery.isError,
    error: runsQuery.error,
    busy: createRunMutation.isPending || actionMutation.isPending || exportErrorsMutation.isPending,
    refreshAll,
    createRun: createRunMutation.mutateAsync,
    runAction: actionMutation.mutateAsync,
    exportErrors: exportErrorsMutation.mutateAsync,
  };
}
