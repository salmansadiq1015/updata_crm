'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { timeService } from '../services/time-service';
import { db } from '../db/mobile-db';
import { useOfflineMutation } from './use-offline-mutation';
import { SYNC_STATUS, SYNC_ENTITY_TYPE, RELEASE_STATUS } from '../constants/mobile-constants';
import { generateId } from '@/lib/utils/ids';
import toast from 'react-hot-toast';

export function useTimeMutations(orderId) {
  const queryClient = useQueryClient();
  const keys = [queryKeys.mobile.timeEntries.byOrder(orderId)];

  const createEntry = useOfflineMutation({
    mutationFn: (data) => timeService.createTimeEntry(orderId, data),
    entityType: SYNC_ENTITY_TYPE.TIME_ENTRY,
    invalidateKeys: keys,
    onOfflineWrite: async (data) => {
      const id = generateId();
      const entry = {
        id,
        order_id: orderId,
        ...data,
        net_duration_min: calcNetDuration(data),
        release_status: RELEASE_STATUS.PENDING,
        sync_status: SYNC_STATUS.PENDING_SYNC,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await db.timeEntries.add(entry);
      return { entityId: id, operation: 'CREATE', payload: { order_id: orderId, data }, ...entry };
    },
    onSuccess: () => toast.success('Zeiteintrag erstellt'),
    onError: (err) => toast.error(err.message),
  });

  const updateEntry = useOfflineMutation({
    mutationFn: ({ entryId, data }) => timeService.updateTimeEntry(entryId, data),
    entityType: SYNC_ENTITY_TYPE.TIME_ENTRY,
    invalidateKeys: keys,
    onOfflineWrite: async ({ entryId, data }) => {
      await db.timeEntries.update(entryId, {
        ...data,
        net_duration_min: calcNetDuration(data),
        sync_status: SYNC_STATUS.PENDING_SYNC,
        updated_at: new Date().toISOString(),
      });
      const updated = await db.timeEntries.get(entryId);
      return { entityId: entryId, operation: 'UPDATE', payload: { data }, ...updated };
    },
    onSuccess: () => toast.success('Zeiteintrag aktualisiert'),
    onError: (err) => toast.error(err.message),
  });

  const deleteEntry = useOfflineMutation({
    mutationFn: (entryId) => timeService.deleteTimeEntry(entryId),
    entityType: SYNC_ENTITY_TYPE.TIME_ENTRY,
    invalidateKeys: keys,
    onOfflineWrite: async (entryId) => {
      await db.timeEntries.update(entryId, {
        is_deleted: true,
        sync_status: SYNC_STATUS.PENDING_SYNC,
      });
      return { entityId: entryId, operation: 'DELETE', payload: {} };
    },
    onSuccess: () => toast.success('Zeiteintrag gelöscht'),
    onError: (err) => toast.error(err.message),
  });

  const releaseEntry = useMutation({
    mutationFn: (entryId) => timeService.releaseTimeEntry(entryId),
    onSuccess: () => {
      keys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
      toast.success('Zeiteintrag freigegeben');
    },
    onError: (err) => toast.error(err.message),
  });

  return { createEntry, updateEntry, deleteEntry, releaseEntry };
}

function calcNetDuration(data) {
  if (!data.startTime || !data.endTime) return 0;
  const start = new Date(data.startTime).getTime();
  const end = new Date(data.endTime).getTime();
  const breakMin = data.breakDurationMin || 0;
  return Math.max(0, Math.round((end - start) / 60000) - breakMin);
}
