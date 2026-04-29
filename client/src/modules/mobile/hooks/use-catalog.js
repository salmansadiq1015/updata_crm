'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { catalogService } from '../services/catalog-service';
import { db } from '../db/mobile-db';
import { useOfflineQuery } from './use-offline-query';

export function useCatalogSearch(query, source = 'ALL', category, limit = 50) {
  return useOfflineQuery({
    queryKey: queryKeys.mobile.catalog.search(query),
    queryFn: () => catalogService.search(query, source, category, limit),
    offlineFn: () =>
      db.catalogItems
        .filter((item) => item.description?.toLowerCase().includes(query?.toLowerCase()))
        .limit(limit)
        .toArray(),
    onServerData: async (res) => {
      const items = Array.isArray(res) ? res : res?.items || [];
      for (const item of items) {
        await db.catalogItems.put(item);
      }
    },
    enabled: !!query && query.length >= 2,
    staleTime: 30 * 60 * 1000,
  });
}

export function useCatalogFavorites() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useOfflineQuery({
    queryKey: queryKeys.mobile.catalog.favorites(),
    queryFn: () => catalogService.getFavorites(),
    offlineFn: () => db.catalogItems.filter((item) => item.is_favorite).toArray(),
    onServerData: async (res) => {
      const items = Array.isArray(res) ? res : res?.data || [];
      for (const item of items) {
        await db.catalogItems.put({ ...item, is_favorite: true });
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  const toggleFavorite = useMutation({
    mutationFn: async ({ itemId, isFavorite }) => {
      if (isFavorite) {
        return catalogService.removeFavorite(itemId);
      }
      return catalogService.addFavorite(itemId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mobile.catalog.favorites() });
    },
  });

  return { favorites: data || [], isLoading, toggleFavorite };
}

export function useCatalogRecent() {
  return useOfflineQuery({
    queryKey: queryKeys.mobile.catalog.recent(),
    queryFn: () => catalogService.getRecent(),
    offlineFn: () => db.catalogItems.orderBy('last_used_at').reverse().limit(20).toArray(),
    onServerData: async (res) => {
      const items = Array.isArray(res) ? res : res?.data || [];
      for (const item of items) {
        await db.catalogItems.put(item);
      }
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useCatalogSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (since) => {
      const data = await catalogService.syncCatalog(since);
      const items = Array.isArray(data) ? data : data?.items || [];
      for (const item of items) {
        await db.catalogItems.put(item);
      }
      return items.length;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mobile', 'catalog'] });
    },
  });
}
