'use client';

import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { orderService } from '../services/order-service';
import { db } from '../db/mobile-db';
import { useOfflineQuery } from './use-offline-query';

export function useOrderList(filters = {}) {
  return useOfflineQuery({
    queryKey: queryKeys.mobile.orders.list(filters),
    queryFn: () => orderService.getOrders(filters),
    offlineFn: () => {
      let collection = db.orders.orderBy('scheduled_start');

      if (filters.status) {
        collection = db.orders.where('status').equals(filters.status);
      }

      return collection.reverse().toArray();
    },
    onServerData: async (res) => {
      const orders = res.data || res;
      if (Array.isArray(orders)) {
        await db.orders.bulkPut(
          orders.map((o) => ({ ...o, last_synced_at: new Date().toISOString() }))
        );
      }
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useOrderDetail(id) {
  return useOfflineQuery({
    queryKey: queryKeys.mobile.orders.detail(id),
    queryFn: () => orderService.getOrderById(id),
    offlineFn: () => db.orders.get(id),
    onServerData: async (order) => {
      if (order) {
        await db.orders.put({ ...order, last_synced_at: new Date().toISOString() });
      }
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

export function useOrderQuotation(orderId) {
  return useOfflineQuery({
    queryKey: queryKeys.mobile.quotation.byOrder(orderId),
    queryFn: () => orderService.getQuotation(orderId),
    offlineFn: () => Promise.resolve(null),
    onServerData: async () => {},
    enabled: !!orderId,
    staleTime: 30 * 60 * 1000,
  });
}

export function useOrderHistory(orderId) {
  return useOfflineQuery({
    queryKey: queryKeys.mobile.orders.history(orderId),
    queryFn: () => orderService.getOrderHistory(orderId),
    offlineFn: () => Promise.resolve([]),
    onServerData: async () => {},
    enabled: !!orderId,
    staleTime: 10 * 60 * 1000,
  });
}

export function useOrderStatusMutation() {
  const queryClient = useQueryClient();

  return {
    async updateStatus(orderId, newStatus) {
      await queryClient.cancelQueries({ queryKey: queryKeys.mobile.orders.detail(orderId) });

      const previous = queryClient.getQueryData(queryKeys.mobile.orders.detail(orderId));

      queryClient.setQueryData(queryKeys.mobile.orders.detail(orderId), (old) =>
        old ? { ...old, status: newStatus } : old
      );

      try {
        const result = await orderService.updateOrderStatus(orderId, newStatus);
        queryClient.invalidateQueries({ queryKey: queryKeys.mobile.orders.all() });
        return result;
      } catch (err) {
        queryClient.setQueryData(queryKeys.mobile.orders.detail(orderId), previous);
        throw err;
      }
    },
  };
}
