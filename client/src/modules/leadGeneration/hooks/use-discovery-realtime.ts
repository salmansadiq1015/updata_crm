'use client';

import { useEffect, useState } from 'react';
import { type InfiniteData, useQueryClient } from '@tanstack/react-query';
import type { Socket } from 'socket.io-client';
import { getSocket, onSocketConnect } from '@/lib/socket/client';
import { discoveryKeys } from './use-discovery';
import { discoveryResultSchema } from '../schemas/discovery-schemas';
import {
  DISCOVERY_EVENTS,
  DISCOVERY_SUBSCRIBE,
  DISCOVERY_UNSUBSCRIBE,
  type CursorPage,
  type DiscoveryCompletedEvent,
  type DiscoveryProgressEvent,
  type DiscoveryResult,
  type DiscoveryResultEvent,
  type DiscoverySession,
} from '../types/discovery-types';

type ResultPage = CursorPage<DiscoveryResult>;

/**
 * Newer-or-equal wins, compared by `updatedAt` timestamp. When the current
 * value has no timestamp (or is absent) the incoming event is always applied.
 */
const isNewer = (incoming: string | undefined, current: string | undefined): boolean => {
  if (!current) return true;
  if (!incoming) return false;
  return new Date(incoming).getTime() >= new Date(current).getTime();
};

const normalizeResult = (value: unknown): DiscoveryResult | null => {
  try {
    return discoveryResultSchema.parse(value);
  } catch {
    return null;
  }
};

const upsertResultInPages = (
  oldData: InfiniteData<ResultPage> | undefined,
  result: DiscoveryResult,
): InfiniteData<ResultPage> | undefined => {
  if (!oldData) return oldData;

  let patched = false;
  const pages = oldData.pages.map((page) => ({
    ...page,
    data: page.data.map((existing) => {
      if (existing.id !== result.id) return existing;
      patched = true;
      return isNewer(result.updatedAt, existing.updatedAt) ? result : existing;
    }),
  }));

  if (patched) return { ...oldData, pages };

  const [firstPage, ...rest] = pages;
  if (!firstPage) return { ...oldData, pages };
  return {
    ...oldData,
    pages: [
      { ...firstPage, data: [result, ...firstPage.data].slice(0, firstPage.pagination.limit) },
      ...rest,
    ],
  };
};

/**
 * Subscribe to `discovery:session:<id>` and merge live progress / new-result /
 * completion events into the session + results query caches (updatedAt-guarded).
 * Mirrors `use-task-realtime.ts`.
 */
export function useDiscoveryRealtime(sessionId: string | null) {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(() => Boolean(getSocket()?.connected));

  useEffect(() => {
    if (!sessionId) return;

    const patchSession = (patch: Partial<DiscoverySession>, updatedAt: string | undefined) => {
      queryClient.setQueryData<DiscoverySession>(discoveryKeys.session(sessionId), (current) => {
        if (!current) return current;
        if (!isNewer(updatedAt, current.updatedAt)) return current;
        return {
          ...current,
          ...patch,
          counts: patch.counts ? { ...current.counts, ...patch.counts } : current.counts,
          progress: patch.progress ? { ...current.progress, ...patch.progress } : current.progress,
          usage: patch.usage ? { ...current.usage, ...patch.usage } : current.usage,
          coverage: patch.coverage ? { ...current.coverage, ...patch.coverage } : current.coverage,
          updatedAt: updatedAt ?? current.updatedAt,
        };
      });
    };

    const forEachResultCache = (
      fn: (oldData: InfiniteData<ResultPage> | undefined) => InfiniteData<ResultPage> | undefined,
    ) => {
      const caches = queryClient.getQueriesData<InfiniteData<ResultPage>>({
        queryKey: discoveryKeys.results(),
      });
      for (const [key, oldData] of caches) {
        if (key[3] !== sessionId) continue; // resultList key: [...results(), sessionId, params]
        queryClient.setQueryData(key, fn(oldData));
      }
    };

    const handleProgress = (payload: DiscoveryProgressEvent) => {
      if (payload?.sessionId !== sessionId) return;
      patchSession(
        {
          ...(payload.status ? { status: payload.status } : {}),
          ...(payload.progress ? { progress: payload.progress as DiscoverySession['progress'] } : {}),
          ...(payload.counts ? { counts: payload.counts as DiscoverySession['counts'] } : {}),
          ...(payload.usage ? { usage: payload.usage as DiscoverySession['usage'] } : {}),
        },
        payload.updatedAt,
      );
    };

    const handleResult = (payload: DiscoveryResultEvent) => {
      if (payload?.sessionId !== sessionId) return;
      const incoming = [
        ...(payload.result ? [payload.result] : []),
        ...(Array.isArray(payload.results) ? payload.results : []),
      ]
        .map(normalizeResult)
        .filter((r): r is DiscoveryResult => r !== null);

      if (incoming.length) {
        forEachResultCache((oldData) => {
          let next = oldData;
          for (const result of incoming) next = upsertResultInPages(next, result);
          return next;
        });
      }
      // Lightweight batch signals can arrive many times per second while dense
      // cells are being subdivided. Progress/count events already keep the UI
      // current; refetching result + marker pages for every batch caused a
      // request storm and 429 loop. Inline rows are merged above, and the final
      // persisted datasets are fetched exactly once on completion.
      if (payload.counts) {
        patchSession({ counts: payload.counts as DiscoverySession['counts'] }, payload.updatedAt);
      }
    };

    const handleCompleted = (payload: DiscoveryCompletedEvent) => {
      if (payload?.sessionId !== sessionId) return;
      patchSession(
        {
          status: payload.status,
          ...(payload.counts ? { counts: payload.counts as DiscoverySession['counts'] } : {}),
          ...(payload.progress ? { progress: payload.progress as DiscoverySession['progress'] } : {}),
          ...(payload.coverage ? { coverage: payload.coverage as DiscoverySession['coverage'] } : {}),
        },
        payload.updatedAt,
      );
      // Reset infinite queries to their first page instead of invalidating and
      // refetching every cached page. Results then wait for an explicit page
      // action; markers perform one fresh sequential pass from the beginning.
      void queryClient.resetQueries(
        {
          queryKey: discoveryKeys.results(),
          predicate: (query) => query.queryKey[3] === sessionId,
        },
        { cancelRefetch: true },
      );
      void queryClient.resetQueries(
        { queryKey: discoveryKeys.markers(sessionId), exact: true },
        { cancelRefetch: true },
      );
    };

    const handleDisconnect = () => setIsConnected(false);

    const bind = (socket: Socket | null) => {
      if (!socket) return;
      socket.off(DISCOVERY_EVENTS.PROGRESS, handleProgress);
      socket.off(DISCOVERY_EVENTS.RESULT, handleResult);
      socket.off(DISCOVERY_EVENTS.COMPLETED, handleCompleted);
      socket.on(DISCOVERY_EVENTS.PROGRESS, handleProgress);
      socket.on(DISCOVERY_EVENTS.RESULT, handleResult);
      socket.on(DISCOVERY_EVENTS.COMPLETED, handleCompleted);
      socket.off('disconnect', handleDisconnect);
      socket.on('disconnect', handleDisconnect);
    };

    bind(getSocket() as Socket | null);
    const offConnect = onSocketConnect((socket: Socket) => {
      setIsConnected(true);
      socket.emit(DISCOVERY_SUBSCRIBE, { sessionId });
      bind(socket);
    });

    return () => {
      offConnect();
      const socket = getSocket();
      socket?.off(DISCOVERY_EVENTS.PROGRESS, handleProgress);
      socket?.off(DISCOVERY_EVENTS.RESULT, handleResult);
      socket?.off(DISCOVERY_EVENTS.COMPLETED, handleCompleted);
      socket?.off('disconnect', handleDisconnect);
      socket?.emit(DISCOVERY_UNSUBSCRIBE, { sessionId });
    };
  }, [queryClient, sessionId]);

  return isConnected;
}
