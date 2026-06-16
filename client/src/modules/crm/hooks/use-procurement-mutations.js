'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { supplierService } from '@/modules/crm/services/supplier-service';
import { purchaseOrderService } from '@/modules/crm/services/purchase-order-service';
import { showSuccess, showError } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';

export function useSupplierMutations({ onCreate, onUpdate, onDelete } = {}) {
  const qc = useQueryClient();
  const { t } = useLanguage();

  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.crm.suppliers.all() });

  const create = useMutation({
    mutationFn: (data) => supplierService.create(data),
    onSuccess: (res) => {
      invalidate();
      showSuccess(t('crm.supplierCreated'));
      onCreate?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const update = useMutation({
    mutationFn: ({ id, data }) => supplierService.update(id, data),
    onSuccess: (res) => {
      invalidate();
      showSuccess(t('crm.supplierUpdated'));
      onUpdate?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const remove = useMutation({
    mutationFn: (id) => supplierService.delete(id),
    onSuccess: () => {
      invalidate();
      showSuccess(t('crm.supplierDeleted'));
      onDelete?.();
    },
    onError: (err) => showError(err.message),
  });

  return { create, update, remove };
}

export function usePurchaseOrderMutations({ onCreate, onUpdate, onCancel, onReceive } = {}) {
  const qc = useQueryClient();
  const { t } = useLanguage();

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: queryKeys.crm.purchaseOrders.all() });
    qc.invalidateQueries({ queryKey: queryKeys.crm.spareParts.all() });
  };

  const create = useMutation({
    mutationFn: (data) => purchaseOrderService.create(data),
    onSuccess: (res) => {
      invalidateAll();
      showSuccess(t('crm.purchaseOrderCreated'));
      onCreate?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const update = useMutation({
    mutationFn: ({ id, data }) => purchaseOrderService.update(id, data),
    onSuccess: (res) => {
      invalidateAll();
      showSuccess(t('crm.purchaseOrderUpdated'));
      onUpdate?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const cancel = useMutation({
    mutationFn: (id) => purchaseOrderService.cancel(id),
    onSuccess: () => {
      invalidateAll();
      showSuccess(t('crm.purchaseOrderCancelled'));
      onCancel?.();
    },
    onError: (err) => showError(err.message),
  });

  const receive = useMutation({
    mutationFn: ({ id, data }) => purchaseOrderService.receive(id, data),
    onSuccess: (res) => {
      invalidateAll();
      qc.invalidateQueries({ queryKey: ['crm', 'spareParts', 'movements'] });
      showSuccess(t('crm.goodsReceived'));
      onReceive?.(res);
    },
    onError: (err) => showError(err.message),
  });

  return { create, update, cancel, receive };
}

export function useStockMutations({ onAdjust } = {}) {
  const qc = useQueryClient();
  const { t } = useLanguage();

  const adjust = useMutation({
    mutationFn: ({ id, data }) => purchaseOrderService.adjustStock(id, data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: queryKeys.crm.spareParts.all() });
      qc.invalidateQueries({ queryKey: ['crm', 'spareParts', 'movements'] });
      qc.invalidateQueries({ queryKey: queryKeys.crm.purchaseOrders.all() });
      showSuccess(t('crm.stockAdjusted'));
      onAdjust?.(res);
    },
    onError: (err) => showError(err.message),
  });

  return { adjust };
}

export function useDeliveryNoteOcr({ onConfirm } = {}) {
  const qc = useQueryClient();
  const { t } = useLanguage();

  const upload = useMutation({
    mutationFn: (formData) => purchaseOrderService.uploadDeliveryNote(formData),
    onError: (err) => showError(err.message),
  });

  const confirm = useMutation({
    mutationFn: ({ jobId, data }) => purchaseOrderService.confirmOcr(jobId, data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: queryKeys.crm.spareParts.all() });
      qc.invalidateQueries({ queryKey: ['crm', 'spareParts', 'movements'] });
      qc.invalidateQueries({ queryKey: queryKeys.crm.purchaseOrders.all() });
      showSuccess(t('crm.deliveryNoteConfirmed'));
      onConfirm?.(res);
    },
    onError: (err) => showError(err.message),
  });

  return { upload, confirm };
}
