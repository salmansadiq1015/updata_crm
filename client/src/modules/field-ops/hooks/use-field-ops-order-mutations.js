'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { orderService } from '@/modules/mobile/services/order-service';
import toast from 'react-hot-toast';

const FIELD_OPS_KEY = ['field-ops', 'orders', 'all'];

export function useFieldOpsOrderMutations() {
  const queryClient = useQueryClient();

  const invalidateList = () => {
    queryClient.invalidateQueries({ queryKey: FIELD_OPS_KEY });
    queryClient.invalidateQueries({ queryKey: queryKeys.mobile.orders.list() });
  };

  const invalidateDetail = (id) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.mobile.orders.detail(id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.mobile.orders.history(id) });
  };

  const createOrder = useMutation({
    mutationFn: (data) => orderService.createOrder(data),
    onSuccess: () => {
      invalidateList();
      toast.success('Auftrag erstellt');
    },
    onError: () => toast.error('Auftrag konnte nicht erstellt werden'),
  });

  const updateOrder = useMutation({
    mutationFn: ({ id, data }) => orderService.updateOrder(id, data),
    onSuccess: (_, { id }) => {
      invalidateList();
      invalidateDetail(id);
      toast.success('Auftrag aktualisiert');
    },
    onError: () => toast.error('Aktualisierung fehlgeschlagen'),
  });

  const deleteOrder = useMutation({
    mutationFn: (id) => orderService.deleteOrder(id),
    onSuccess: () => {
      invalidateList();
      toast.success('Auftrag gelöscht');
    },
    onError: () => toast.error('Löschen fehlgeschlagen'),
  });

  const bulkDelete = useMutation({
    mutationFn: (ids) => orderService.bulkDeleteOrders(ids),
    onSuccess: (_, ids) => {
      invalidateList();
      toast.success(`${ids.length} Aufträge gelöscht`);
    },
    onError: () => toast.error('Massenlöschung fehlgeschlagen'),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }) => orderService.updateOrderStatus(id, status),
    onSuccess: (_, { id }) => {
      invalidateList();
      invalidateDetail(id);
      toast.success('Status aktualisiert');
    },
    onError: () => toast.error('Statusaktualisierung fehlgeschlagen'),
  });

  return { createOrder, updateOrder, deleteOrder, bulkDelete, updateStatus };
}
