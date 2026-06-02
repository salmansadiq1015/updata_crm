'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { queryKeys } from '@/lib/query/keys';
import { installationService } from '../services/installation-service';
import { useOfflineQuery } from './use-offline-query';
import { db, upsertCrmAddressBook } from '../db/mobile-db';

/**
 * Read a single CRM site directly from the offline Dexie cache (crmSites).
 * Site data — including `access_instructions` — is synced via the address-book
 * sync, so the offline cache is the source of truth here and works online too.
 */
export function useSite(siteId) {
  const site = useLiveQuery(
    () => (siteId ? db.crmSites.get(siteId) : undefined),
    [siteId],
  );

  return {
    data: site || null,
    isLoading: siteId ? site === undefined : false,
  };
}

export function useInstallations(siteId) {
  return useOfflineQuery({
    queryKey: queryKeys.mobile.installations.bySite(siteId),
    queryFn: () => installationService.getInstallations(siteId),
    offlineFn: () => db.crmInstallations.where('site_id').equals(siteId).toArray(),
    onServerData: async (installations) => {
      await upsertCrmAddressBook(
        { installations: installations.map((item) => ({ ...item, site_id: item.site_id || siteId })) },
        new Date().toISOString(),
      );
    },
    enabled: !!siteId,
    staleTime: 30 * 60 * 1000,
  });
}

export function useInstallationDetail(id) {
  return useOfflineQuery({
    queryKey: queryKeys.mobile.installations.detail(id),
    queryFn: () => installationService.getInstallationById(id),
    offlineFn: () => db.crmInstallations.get(id),
    onServerData: async (installation) => {
      if (!installation) return;
      await upsertCrmAddressBook({ installations: [installation] }, new Date().toISOString());
    },
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
