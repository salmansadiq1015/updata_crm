'use client';

import { queryKeys } from '@/lib/query/keys';
import { timeService } from '../services/time-service';
import { db } from '../db/mobile-db';
import { useOfflineQuery } from './use-offline-query';

export function useOrderTimeEntries(orderId) {
  return useOfflineQuery({
    queryKey: queryKeys.mobile.timeEntries.byOrder(orderId),
    queryFn: () => timeService.getTimeEntries({ orderId }),
    offlineFn: () => db.timeEntries.where('order_id').equals(orderId).toArray(),
    onServerData: async (res) => {
      const items = Array.isArray(res) ? res : res?.data || [];
      for (const entry of items) {
        await db.timeEntries.put({ ...entry, last_synced_at: new Date().toISOString() });
      }
    },
    enabled: !!orderId,
    staleTime: 5 * 60 * 1000,
  });
}
