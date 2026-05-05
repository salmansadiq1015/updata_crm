'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { timeService } from '@/modules/mobile/services/time-service';
import { queryKeys } from '@/lib/query/keys';
import { showSuccess, showError } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';

export function useFieldOpsTimeMutations({
  onRelease, onOverride, onCreate, onUpdate, onDelete, onBulkDelete,
} = {}) {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.mobile.timeEntries.all() });
  };

  const createEntry = useMutation({
    retry: 0,
    mutationFn: ({ orderId, payload }) => timeService.createTimeEntry(orderId, payload),
    onSuccess: (res) => {
      invalidate();
      showSuccess(t('fieldOps.time.created', 'Time entry created.'));
      onCreate?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const updateEntry = useMutation({
    retry: 0,
    mutationFn: ({ id, data }) => timeService.updateTimeEntry(id, data),
    onSuccess: (res) => {
      invalidate();
      showSuccess(t('fieldOps.time.updated', 'Time entry updated.'));
      onUpdate?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const deleteEntry = useMutation({
    mutationFn: (entryId) => timeService.deleteTimeEntry(entryId),
    onSuccess: (res) => {
      invalidate();
      showSuccess(t('fieldOps.time.deleted', 'Time entry deleted.'));
      onDelete?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const bulkDelete = useMutation({
    mutationFn: async (entryIds) => {
      const results = [];
      for (const id of entryIds) {
        try {
          await timeService.deleteTimeEntry(id);
          results.push({ id, ok: true });
        } catch (e) {
          results.push({ id, ok: false, error: e.message });
        }
      }
      return results;
    },
    onSuccess: (results) => {
      invalidate();
      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        showError(`${failed.length} ${t('fieldOps.time.bulkDeleteFailed', 'entries could not be deleted.')}`);
      } else {
        showSuccess(t('fieldOps.time.bulkDeleted', 'Time entries deleted.'));
        onBulkDelete?.(results);
      }
    },
    onError: (err) => showError(err.message),
  });

  const release = useMutation({
    mutationFn: (entryId) => timeService.releaseTimeEntry(entryId),
    onSuccess: (res, entryId) => {
      invalidate();
      if (res?.released === false) {
        showError(res?.message || t('fieldOps.time.releaseFailed', 'Cannot release: work report not submitted.'));
      } else {
        showSuccess(t('fieldOps.time.released', 'Time entry released.'));
        onRelease?.(res);
      }
    },
    onError: (err) => showError(err.message),
  });

  const releaseBatch = useMutation({
    mutationFn: async (entryIds) => {
      const results = [];
      for (const id of entryIds) {
        const res = await timeService.releaseTimeEntry(id);
        results.push({ id, res });
      }
      return results;
    },
    onSuccess: (results) => {
      invalidate();
      const failed = results.filter((r) => r.res?.released === false);
      if (failed.length > 0) {
        showError(`${failed.length} ${t('fieldOps.time.releaseFailed', 'entries could not be released (report not submitted).')}`);
      } else {
        showSuccess(t('fieldOps.time.released', 'Time entries released.'));
        onRelease?.(results);
      }
    },
    onError: (err) => showError(err.message),
  });

  const override = useMutation({
    mutationFn: ({ id, justification }) => timeService.overrideTimeEntry(id, justification),
    onSuccess: (res) => {
      invalidate();
      showSuccess(t('fieldOps.time.overrideSuccess', 'Time entry manually released.'));
      onOverride?.(res);
    },
    onError: (err) => showError(err.message),
  });

  return { createEntry, updateEntry, deleteEntry, bulkDelete, release, releaseBatch, override };
}
