'use client';

import { useMemo } from 'react';
import {
  type InfiniteData,
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { showError, showSuccess } from '@/lib/toast';
import { discoveryApi } from '../services/discovery-api';
import type {
  CreateDiscoveryInput,
  CursorPage,
  DiscoveryResult,
  DiscoveryResultListParams,
  DiscoverySession,
  DiscoverySessionListParams,
  DiscoverySessionStatus,
  ImportMode,
  ImportSelection,
} from '../types/discovery-types';

export const DISCOVERY_PAGE_SIZE = 50;

const ACTIVE_SESSION_STATUSES = new Set<DiscoverySessionStatus>([
  'DRAFT',
  'QUEUED',
  'RUNNING',
  'FETCHING',
  'NORMALIZING',
  'DEDUPLICATING',
  'MATCHING',
]);

export const isActiveSession = (status: DiscoverySessionStatus): boolean =>
  ACTIVE_SESSION_STATUSES.has(status);

/** Local query-key factory (mirrors taskWorkspaceKeys). */
export const discoveryKeys = {
  root: ['discovery', 'workspace'] as const,
  businessTypes: () => [...discoveryKeys.root, 'businessTypes'] as const,
  usage: () => [...discoveryKeys.root, 'usage'] as const,
  sessions: () => [...discoveryKeys.root, 'sessions'] as const,
  sessionList: (params: DiscoverySessionListParams) =>
    [...discoveryKeys.sessions(), params] as const,
  session: (id: string | null) => [...discoveryKeys.root, 'session', id] as const,
  results: () => [...discoveryKeys.root, 'results'] as const,
  resultList: (sessionId: string | null, params: Omit<DiscoveryResultListParams, 'cursor'>) =>
    [...discoveryKeys.results(), sessionId, params] as const,
  result: (sessionId: string | null, resultId: string | null) =>
    [...discoveryKeys.root, 'result', sessionId, resultId] as const,
  importPreview: (sessionId: string | null, mode: ImportMode, selection: ImportSelection | null) =>
    [...discoveryKeys.root, 'importPreview', sessionId, mode, selection] as const,
  importJob: (jobId: string | null) => [...discoveryKeys.root, 'importJob', jobId] as const,
};

type ResultPage = CursorPage<DiscoveryResult>;
type SessionPage = CursorPage<DiscoverySession>;

const updateResultInPages = (
  oldData: InfiniteData<ResultPage> | undefined,
  resultId: string,
  updater: (result: DiscoveryResult) => DiscoveryResult,
): InfiniteData<ResultPage> | undefined => {
  if (!oldData) return oldData;
  return {
    ...oldData,
    pages: oldData.pages.map((page) => ({
      ...page,
      data: page.data.map((result) => (result.id === resultId ? updater(result) : result)),
    })),
  };
};

// ── Queries ─────────────────────────────────────────────────────────────────

export function useBusinessTypes() {
  return useQuery({
    queryKey: discoveryKeys.businessTypes(),
    queryFn: () => discoveryApi.getBusinessTypes(),
    staleTime: 60 * 60_000,
    gcTime: 2 * 60 * 60_000,
  });
}

export function useDiscoveryUsage() {
  return useQuery({
    queryKey: discoveryKeys.usage(),
    queryFn: () => discoveryApi.getUsage(),
    staleTime: 30_000,
  });
}

export function useDiscoverySessions(baseParams: DiscoverySessionListParams = {}) {
  return useInfiniteQuery({
    queryKey: discoveryKeys.sessionList(baseParams),
    queryFn: ({ pageParam }) => discoveryApi.listSessions({ ...baseParams, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasNext ? lastPage.pagination.nextCursor : undefined,
    staleTime: 20_000,
    placeholderData: keepPreviousData,
  });
}

export function useFlattenedSessions(data: InfiniteData<SessionPage> | undefined): DiscoverySession[] {
  return useMemo(() => dedupeById(data?.pages.flatMap((page) => page.data) ?? []), [data]);
}

export function useDiscoverySession(
  id: string | null,
  options: { poll?: boolean; pollInterval?: number } = {},
) {
  const { poll = false, pollInterval = 3000 } = options;
  return useQuery({
    queryKey: discoveryKeys.session(id),
    queryFn: () => discoveryApi.getSession(id ?? ''),
    enabled: Boolean(id),
    staleTime: 5_000,
    // Polling fallback for when the socket bridge is unavailable (§10/§12).
    refetchInterval: (query) => {
      if (!poll) return false;
      const status = query.state.data?.status;
      return status && isActiveSession(status) ? pollInterval : false;
    },
  });
}

export function useDiscoveryResults(
  sessionId: string | null,
  baseParams: Omit<DiscoveryResultListParams, 'cursor'> = {},
) {
  return useInfiniteQuery({
    queryKey: discoveryKeys.resultList(sessionId, baseParams),
    queryFn: ({ pageParam }) =>
      discoveryApi.listResults(sessionId ?? '', { ...baseParams, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasNext ? lastPage.pagination.nextCursor : undefined,
    enabled: Boolean(sessionId),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}

export function useFlattenedResults(data: InfiniteData<ResultPage> | undefined): DiscoveryResult[] {
  return useMemo(() => dedupeById(data?.pages.flatMap((page) => page.data) ?? []), [data]);
}

export function useDiscoveryResult(sessionId: string | null, resultId: string | null) {
  return useQuery({
    queryKey: discoveryKeys.result(sessionId, resultId),
    queryFn: () => discoveryApi.getResult(sessionId ?? '', resultId ?? ''),
    enabled: Boolean(sessionId && resultId),
    staleTime: 15_000,
  });
}

export function useImportPreview(
  sessionId: string | null,
  mode: ImportMode,
  selection: ImportSelection | null,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: discoveryKeys.importPreview(sessionId, mode, selection),
    queryFn: () => discoveryApi.importPreview(sessionId ?? '', mode, selection ?? undefined),
    enabled: Boolean(sessionId) && (options.enabled ?? true),
    staleTime: 5_000,
  });
}

export function useImportJob(jobId: string | null, options: { poll?: boolean } = {}) {
  const { poll = true } = options;
  return useQuery({
    queryKey: discoveryKeys.importJob(jobId),
    queryFn: () => discoveryApi.getImportJob(jobId ?? ''),
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      if (!poll) return false;
      const status = query.state.data?.status;
      return status === 'QUEUED' || status === 'RUNNING' ? 2000 : false;
    },
  });
}

// ── Mutations ───────────────────────────────────────────────────────────────

export function useCreateDiscovery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDiscoveryInput) => discoveryApi.createSession(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: discoveryKeys.sessions() });
      showSuccess('Analyse gestartet');
    },
    onError: (error) => showError(error),
  });
}

export function useCancelDiscovery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => discoveryApi.cancelSession(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: discoveryKeys.session(id) });
      const previous = queryClient.getQueryData<DiscoverySession>(discoveryKeys.session(id));
      if (previous) {
        queryClient.setQueryData<DiscoverySession>(discoveryKeys.session(id), {
          ...previous,
          cancelRequested: true,
        });
      }
      return { previous };
    },
    onError: (error, id, context) => {
      if (context?.previous) queryClient.setQueryData(discoveryKeys.session(id), context.previous);
      showError(error);
    },
    onSuccess: (session) => {
      queryClient.setQueryData(discoveryKeys.session(session.id), session);
      queryClient.invalidateQueries({ queryKey: discoveryKeys.sessions() });
      showSuccess('Analyse abgebrochen');
    },
  });
}

export function useDeleteDiscovery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => discoveryApi.deleteSession(id),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: discoveryKeys.session(id) });
      queryClient.invalidateQueries({ queryKey: discoveryKeys.sessions() });
      showSuccess('Suche gelöscht');
    },
    onError: (error) => showError(error),
  });
}

export function useImport(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { mode: ImportMode; selection: ImportSelection; assignedTo?: string }) =>
      discoveryApi.importSession(sessionId, body),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: discoveryKeys.results() });
      queryClient.invalidateQueries({ queryKey: discoveryKeys.session(sessionId) });
      if (response.kind === 'sync') {
        const { imported, existing, skipped, failed } = response.summary;
        showSuccess(
          `Import abgeschlossen: ${imported} neu, ${existing} bestehend, ${skipped} übersprungen, ${failed} fehlgeschlagen`,
        );
      } else {
        showSuccess('Import gestartet');
      }
    },
    onError: (error) => showError(error),
  });
}

export function useImportResult(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ resultId, mode }: { resultId: string; mode?: ImportMode }) =>
      discoveryApi.importResult(resultId, mode ? { mode } : {}),
    onMutate: async ({ resultId }) => {
      await queryClient.cancelQueries({ queryKey: discoveryKeys.results() });
      const previous = queryClient.getQueriesData<InfiniteData<ResultPage>>({
        queryKey: discoveryKeys.results(),
      });
      queryClient.setQueriesData<InfiniteData<ResultPage>>(
        { queryKey: discoveryKeys.results() },
        (oldData) =>
          updateResultInPages(oldData, resultId, (result) => ({
            ...result,
            importStatus: 'QUEUED',
          })),
      );
      return { previous };
    },
    onError: (error, _variables, context) => {
      for (const [key, value] of context?.previous ?? []) queryClient.setQueryData(key, value);
      showError(error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: discoveryKeys.results() });
      queryClient.invalidateQueries({ queryKey: discoveryKeys.session(sessionId) });
      showSuccess('Zum CRM hinzugefügt');
    },
  });
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}
