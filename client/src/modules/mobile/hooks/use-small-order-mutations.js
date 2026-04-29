'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { smallOrderService } from '../services/small-order-service';
import { useOfflineMutation } from './use-offline-mutation';
import { db } from '../db/mobile-db';
import { SYNC_STATUS, SYNC_ENTITY_TYPE } from '../constants/mobile-constants';
import toast from 'react-hot-toast';

export function useSmallOrderMutations(projectId) {
  const queryClient = useQueryClient();
  const keys = [queryKeys.mobile.smallOrders.byProject(projectId)];

  const createOrder = useOfflineMutation({
    mutationFn: (data) => smallOrderService.create(projectId, data),
    entityType: SYNC_ENTITY_TYPE.SMALL_ORDER,
    invalidateKeys: keys,
    onOfflineWrite: async (data) => {
      const id = crypto.randomUUID();
      const order = {
        id,
        project_id: projectId,
        ...data,
        status: 'DRAFT',
        sync_status: SYNC_STATUS.PENDING_SYNC,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await db.orders.add(order);
      return {
        entityId: id,
        operation: 'CREATE',
        payload: { project_id: projectId, data },
        ...order,
      };
    },
    onSuccess: () => toast.success('Kleinauftrag erstellt'),
    onError: (err) => toast.error(err.message),
  });

  const updateOrder = useOfflineMutation({
    mutationFn: ({ id, data }) => smallOrderService.update(projectId, id, data),
    entityType: SYNC_ENTITY_TYPE.SMALL_ORDER,
    invalidateKeys: keys,
    onOfflineWrite: async ({ id, data }) => {
      await db.orders.update(id, {
        ...data,
        sync_status: SYNC_STATUS.PENDING_SYNC,
        updated_at: new Date().toISOString(),
      });
      return {
        entityId: id,
        operation: 'UPDATE',
        payload: { project_id: projectId, data },
      };
    },
    onSuccess: () => toast.success('Kleinauftrag aktualisiert'),
    onError: (err) => toast.error(err.message),
  });

  const cancelOrder = useMutation({
    mutationFn: (id) => smallOrderService.cancel(projectId, id),
    onSuccess: () => {
      keys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
      toast.success('Kleinauftrag storniert');
    },
    onError: (err) => toast.error(err.message),
  });

  return { createOrder, updateOrder, cancelOrder };
}
