'use client';

import { useCallback, useMemo } from 'react';
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
  DiscoveryMarker,
  DiscoveryResultListParams,
  DiscoverySession,
  DiscoverySessionListParams,
  DiscoverySessionStatus,
  ImportMode,
  ImportSelection,
} from '../types/discovery-types';

export const DISCOVERY_PAGE_SIZE = 300;
export const DISCOVERY_PAGE_SIZE_OPTIONS = [100, 200, 300] as const;
export const DISCOVERY_MARKER_PAGE_SIZE = 300;

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
  markers: (sessionId: string | null) => [...discoveryKeys.root, 'markers', sessionId] as const,
  importPreview: (sessionId: string | null, mode: ImportMode, selection: ImportSelection | null) =>
    [...discoveryKeys.root, 'importPreview', sessionId, mode, selection] as const,
  importJob: (jobId: string | null) => [...discoveryKeys.root, 'importJob', jobId] as const,
};

type ResultPage = CursorPage<DiscoveryResult>;
type MarkerPage = CursorPage<DiscoveryMarker>;
type SessionPage = CursorPage<DiscoverySession>;

type DiscoveryQueryError = {
  statusCode?: number;
  isCanceled?: boolean;
  response?: { status?: number };
};

/** Never amplify authorization/rate-limit failures with automatic retries. */
export const shouldRetryDiscoveryQuery = (failureCount: number, error: unknown): boolean => {
  const queryError = error as DiscoveryQueryError | null;
  if (queryError?.isCanceled) return false;
  const statusCode = queryError?.statusCode ?? queryError?.response?.status ?? 0;
  if ([401, 403, 404, 429].includes(statusCode)) return false;
  return failureCount < 1;
};

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
    retry: shouldRetryDiscoveryQuery,
  });
}

export function useDiscoveryUsage() {
  return useQuery({
    queryKey: discoveryKeys.usage(),
    queryFn: () => discoveryApi.getUsage(),
    staleTime: 30_000,
    retry: shouldRetryDiscoveryQuery,
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
    retry: shouldRetryDiscoveryQuery,
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
    retry: shouldRetryDiscoveryQuery,
    // Polling fallback for when the socket bridge is unavailable (§10/§12).
    refetchInterval: (query) => {
      if (!poll) return false;
      if ((query.state.error as DiscoveryQueryError | null)?.statusCode === 429) return false;
      const status = query.state.data?.status;
      return status && isActiveSession(status) ? pollInterval : false;
    },
  });
}

export function useDiscoveryResults(
  sessionId: string | null,
  baseParams: Omit<DiscoveryResultListParams, 'cursor'> = {},
) {
  const query = useInfiniteQuery({
    queryKey: discoveryKeys.resultList(sessionId, baseParams),
    queryFn: ({ pageParam }) =>
      discoveryApi.listResults(sessionId ?? '', { ...baseParams, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasNext ? lastPage.pagination.nextCursor : undefined,
    enabled: Boolean(sessionId),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    retry: shouldRetryDiscoveryQuery,
  });
  // BusinessList requests the next cursor only when the user scrolls near the
  // end or clicks "Load more". Counts and "Add all" remain session-scoped on
  // the server, so the browser never needs to materialize every result at once.
  return query;
}

export function useFlattenedResults(data: InfiniteData<ResultPage> | undefined): DiscoveryResult[] {
  return useMemo(() => dedupeById(data?.pages.flatMap((page) => page.data) ?? []), [data]);
}

/** Load one bounded page of lightweight markers without auto-draining the set. */
export function useDiscoveryMarkers(
  sessionId: string | null,
  options: { enabled?: boolean } = {},
) {
  const enabled = Boolean(sessionId) && (options.enabled ?? true);
  const query = useInfiniteQuery({
    queryKey: discoveryKeys.markers(sessionId),
    queryFn: ({ pageParam }) =>
      discoveryApi.listMarkers(sessionId ?? '', {
        cursor: pageParam,
        limit: DISCOVERY_MARKER_PAGE_SIZE,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.pagination.hasNext ? lastPage.pagination.nextCursor : undefined,
    enabled,
    staleTime: 60_000,
    refetchOnReconnect: false,
    retry: shouldRetryDiscoveryQuery,
  });
  const nextCursor = query.data?.pages.at(-1)?.pagination.nextCursor ?? null;
  const retryFailedPage = useCallback(async () => {
    if (query.isFetchNextPageError && nextCursor) {
      return query.fetchNextPage({ cancelRefetch: false });
    }
    return query.refetch({ cancelRefetch: false });
  }, [nextCursor, query]);

  return { ...query, retryFailedPage };
}

export function useFlattenedMarkers(data: InfiniteData<MarkerPage> | undefined): DiscoveryMarker[] {
  return useMemo(() => {
    const byId = new Map<string, DiscoveryMarker>();
    for (const marker of data?.pages.flatMap((page) => page.data) ?? []) byId.set(marker.id, marker);
    return [...byId.values()];
  }, [data]);
}

export function useDiscoveryResult(sessionId: string | null, resultId: string | null) {
  return useQuery({
    queryKey: discoveryKeys.result(sessionId, resultId),
    queryFn: () => discoveryApi.getResult(sessionId ?? '', resultId ?? ''),
    enabled: Boolean(sessionId && resultId),
    staleTime: 15_000,
    retry: shouldRetryDiscoveryQuery,
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
    retry: shouldRetryDiscoveryQuery,
  });
}

export function useImportJob(jobId: string | null, options: { poll?: boolean } = {}) {
  const { poll = true } = options;
  return useQuery({
    queryKey: discoveryKeys.importJob(jobId),
    queryFn: () => discoveryApi.getImportJob(jobId ?? ''),
    enabled: Boolean(jobId),
    retry: shouldRetryDiscoveryQuery,
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

export function useLoadMoreDiscovery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => discoveryApi.loadMoreSession(id),
    onSuccess: (session) => {
      queryClient.setQueryData(discoveryKeys.session(session.id), session);
      void queryClient.invalidateQueries({ queryKey: discoveryKeys.sessions() });
      void queryClient.invalidateQueries({
        queryKey: discoveryKeys.results(),
        predicate: (query) => query.queryKey[3] === session.id,
      });
      void queryClient.invalidateQueries({ queryKey: discoveryKeys.markers(session.id) });
      showSuccess('Weitere Ergebnisse werden geladen');
    },
    onError: (error) => showError(error),
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
      void queryClient.resetQueries(
        {
          queryKey: discoveryKeys.results(),
          predicate: (query) => query.queryKey[3] === sessionId,
        },
        { cancelRefetch: true },
      );
      void queryClient.invalidateQueries({ queryKey: discoveryKeys.session(sessionId), exact: true });
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
      const currentSessionResults = {
        queryKey: discoveryKeys.results(),
        predicate: (query: { queryKey: readonly unknown[] }) => query.queryKey[3] === sessionId,
      };
      await queryClient.cancelQueries(currentSessionResults);
      const previous = queryClient.getQueriesData<InfiniteData<ResultPage>>({
        queryKey: discoveryKeys.results(),
        predicate: (query) => query.queryKey[3] === sessionId,
      });
      queryClient.setQueriesData<InfiniteData<ResultPage>>(
        currentSessionResults,
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
      void queryClient.resetQueries(
        {
          queryKey: discoveryKeys.results(),
          predicate: (query) => query.queryKey[3] === sessionId,
        },
        { cancelRefetch: true },
      );
      void queryClient.invalidateQueries({ queryKey: discoveryKeys.session(sessionId), exact: true });
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
