'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sparePartService } from '@/modules/crm/services/spare-part-service';
import { queryKeys } from '@/lib/query/keys';
import { showSuccess, showError } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';

/**
 * Bundles all spare part write paths into a single hook so components stay lean.
 * Each mutation does its own toast + cache invalidation; pages pass callbacks
 * (`onSuccess`) only when they need to close a dialog or reset selection.
 */
export function useSparePartMutations({ onCreate, onUpdate, onDelete, onLink, onUnlink, onExport } = {}) {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.crm.spareParts.all() });
  };

  const create = useMutation({
    mutationFn: (data) => sparePartService.create(data),
    onSuccess: (res) => {
      invalidate();
      showSuccess(t('crm.sparePartCreated', 'Spare part created'));
      onCreate?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const update = useMutation({
    mutationFn: ({ id, data }) => sparePartService.update(id, data),
    onSuccess: (res) => {
      invalidate();
      showSuccess(t('crm.sparePartUpdated', 'Spare part updated'));
      onUpdate?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const remove = useMutation({
    mutationFn: (id) => sparePartService.delete(id),
    onSuccess: (res) => {
      invalidate();
      showSuccess(t('crm.sparePartDeleted', 'Spare part deleted'));
      onDelete?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const linkToInstallation = useMutation({
    mutationFn: ({ installationId, data }) => sparePartService.linkToInstallation(installationId, data),
    onSuccess: (res, { installationId }) => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: queryKeys.crm.spareParts.byInstallation(installationId) });
      showSuccess(t('crm.sparePartLinked', 'Spare part linked to installation'));
      onLink?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const unlinkFromInstallation = useMutation({
    mutationFn: ({ installationId, sparePartId }) => sparePartService.unlinkFromInstallation(installationId, sparePartId),
    onSuccess: (res, { installationId }) => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: queryKeys.crm.spareParts.byInstallation(installationId) });
      showSuccess(t('crm.sparePartUnlinked', 'Spare part unlinked from installation'));
      onUnlink?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const exportCsv = useMutation({
    mutationFn: (filters) => sparePartService.exportCsv(filters),
    onSuccess: (res) => {
      showSuccess(t('crm.exportReady', 'Export ready'));
      onExport?.(res);
    },
    onError: (err) => showError(err.message),
  });

  return { create, update, remove, linkToInstallation, unlinkFromInstallation, exportCsv };
}
