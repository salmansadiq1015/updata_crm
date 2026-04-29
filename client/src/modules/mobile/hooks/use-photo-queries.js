'use client';

import { queryKeys } from '@/lib/query/keys';
import { photoService } from '../services/photo-service';
import { db } from '../db/mobile-db';
import { useOfflineQuery } from './use-offline-query';

export function useOrderPhotos(orderId) {
  return useOfflineQuery({
    queryKey: queryKeys.mobile.photos.byOrder(orderId),
    queryFn: () => photoService.getPhotos(orderId),
    offlineFn: () => db.photos.where('order_id').equals(orderId).toArray(),
    onServerData: async (res) => {
      const items = Array.isArray(res) ? res : res?.data || [];
      for (const photo of items) {
        await db.photos.put({ ...photo, last_synced_at: new Date().toISOString() });
      }
    },
    enabled: !!orderId,
    staleTime: 5 * 60 * 1000,
  });
}
