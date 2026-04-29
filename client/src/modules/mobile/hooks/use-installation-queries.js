'use client';

import { queryKeys } from '@/lib/query/keys';
import { installationService } from '../services/installation-service';
import { useOfflineQuery } from './use-offline-query';

export function useInstallations(siteId) {
  return useOfflineQuery({
    queryKey: queryKeys.mobile.installations.bySite(siteId),
    queryFn: () => installationService.getInstallations(siteId),
    offlineFn: () => Promise.resolve([]),
    onServerData: async () => {},
    enabled: !!siteId,
    staleTime: 30 * 60 * 1000,
  });
}

export function useInstallationDetail(id) {
  return useOfflineQuery({
    queryKey: queryKeys.mobile.installations.detail(id),
    queryFn: () => installationService.getInstallationById(id),
    offlineFn: () => Promise.resolve(null),
    onServerData: async () => {},
    enabled: !!id,
    staleTime: 30 * 60 * 1000,
  });
}

export function useInstallationHistory(id) {
  return useOfflineQuery({
    queryKey: queryKeys.mobile.installations.history(id),
    queryFn: () => installationService.getInstallationHistory(id),
    offlineFn: () => Promise.resolve([]),
    onServerData: async () => {},
    enabled: !!id,
    staleTime: 30 * 60 * 1000,
  });
}
