'use client';

import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket, onSocketConnect } from '@/lib/socket/client';
import { leadKeys } from './use-leads';

/**
 * Live progress of an import originating from the Lead Finder Chrome extension,
 * streamed over the existing Socket.IO personal room. When a run finishes, the
 * new leads are already in the CRM, so the leads list + map queries are
 * invalidated to surface them without a manual refresh.
 */
export type ExtensionImportProgress = {
  importId: string;
  total: number;
  processed: number;
  created: number;
  existing: number;
  failed: number;
  status: 'running' | 'completed' | 'partial' | 'failed';
  errorSummary: string | null;
  startedAt?: string;
  completedAt?: string | null;
};

const EVENT = 'extension:import:progress';

export function useExtensionImportProgress(enabled: boolean) {
  const [progress, setProgress] = useState<ExtensionImportProgress | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return undefined;

    const handler = (payload: ExtensionImportProgress) => {
      if (!payload?.importId) return;
      setProgress(payload);
      if (payload.status !== 'running') {
        queryClient.invalidateQueries({ queryKey: leadKeys.lists() });
        queryClient.invalidateQueries({ queryKey: leadKeys.maps() });
      }
    };

    const register = (socket: Socket | null = getSocket() as Socket | null) => {
      socket?.off(EVENT, handler);
      socket?.on(EVENT, handler);
    };

    const offConnect = onSocketConnect((socket: Socket) => register(socket));
    register();

    return () => {
      offConnect();
      getSocket()?.off(EVENT, handler);
    };
  }, [enabled, queryClient]);

  return { progress, dismiss: () => setProgress(null) };
}
