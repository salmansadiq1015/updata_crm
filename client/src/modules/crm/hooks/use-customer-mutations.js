'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { customerService } from '@/modules/crm/services/customer-service';
import { queryKeys } from '@/lib/query/keys';
import { showSuccess, showError } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';

/**
 * Bundles all customer write paths into a single hook so components stay lean.
 * Each mutation does its own toast + cache invalidation; pages pass callbacks
 * (`onSuccess`) only when they need to close a dialog or reset selection.
 */
export function useCustomerMutations({ onCreate, onUpdate, onDeactivate, onBulkDeactivate, onMerge, onExport } = {}) {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.crm.customers.all() });
  };

  const create = useMutation({
    mutationFn: (data) => customerService.createCustomer(data),
    onSuccess: (res) => {
      invalidate();
      showSuccess(t('crm.customerCreated', 'Customer created'));
      onCreate?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const update = useMutation({
    mutationFn: ({ id, data }) => customerService.updateCustomer(id, data),
    onSuccess: (res) => {
      invalidate();
      showSuccess(t('crm.customerUpdated', 'Customer updated'));
      onUpdate?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const deactivate = useMutation({
    mutationFn: (id) => customerService.deactivateCustomer(id),
    onSuccess: (res) => {
      invalidate();
      showSuccess(t('crm.customerDeactivated', 'Kunde deaktiviert'));
      onDeactivate?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const reactivate = useMutation({
    mutationFn: (id) => customerService.reactivateCustomer(id),
    onSuccess: (res) => {
      invalidate();
      showSuccess(t('crm.customerReactivated', 'Kunde reaktiviert'));
      onDeactivate?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const bulkDeactivate = useMutation({
    mutationFn: (ids) => customerService.bulkArchive(ids),
    onSuccess: (res) => {
      invalidate();
      const n = res?.deactivatedCount ?? t('common.all', 'all');
      showSuccess(t('crm.bulkDeactivateSuccess', '{count} Kunden deaktiviert', { count: n }));
      onBulkDeactivate?.(res);
    },
    onError: (err) => showError(err.message),
  });

  // Reversing a merge touches the same entities as the merge itself.
  const undoMerge = useMutation({
    mutationFn: (mergeId) => customerService.undoMerge(mergeId),
    onSuccess: (res) => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: queryKeys.crm.contacts.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.crm.sites.all() });
      queryClient.invalidateQueries({ queryKey: ['crm', 'customers', 'merges'] });
      showSuccess(t('crm.mergeUndone', 'Zusammenführung rückgängig gemacht'));
      onMerge?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const merge = useMutation({
    mutationFn: ({ sourceId, targetId, fieldOverrides }) => customerService.mergeCustomers(sourceId, targetId, fieldOverrides),
    onSuccess: (res) => {
      invalidate();
      // Merge cascades to contacts + sites — clear those too.
      queryClient.invalidateQueries({ queryKey: queryKeys.crm.contacts.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.crm.sites.all() });
      showSuccess(t('crm.customersMerged', 'Customers merged'));
      onMerge?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const exportCsv = useMutation({
    mutationFn: (filters) => customerService.exportCsv(filters),
    onSuccess: (res) => {
      showSuccess(t('crm.exportReady', 'Export ready') + (res?.filename ? ` — ${res.filename}` : ''));
      onExport?.(res);
    },
    onError: (err) => showError(err.message),
  });

  return { create, update, deactivate, reactivate, bulkDeactivate, merge, undoMerge, exportCsv };
}
