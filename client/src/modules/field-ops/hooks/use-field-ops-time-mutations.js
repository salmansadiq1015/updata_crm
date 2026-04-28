'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { timeService } from '@/modules/mobile/services/time-service';
import { queryKeys } from '@/lib/query/keys';
import { showSuccess, showError } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';

export function useFieldOpsTimeMutations({ onRelease, onOverride } = {}) {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.mobile.timeEntries.all() });
  };

  const release = useMutation({
    mutationFn: (entryId) => timeService.releaseTimeEntry(entryId),
    onSuccess: (res, entryId) => {
      invalidate();
      if (res?.released === false) {
        showError(res?.message || t('fieldOps.time.releaseFailed', 'Cannot release: work report not submitted.'));
      } else {
        showSuccess(t('fieldOps.time.released', 'Time entries released.'));
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
      }
      onRelease?.(results);
    },
    onError: (err) => showError(err.message),
  });

  const override = useMutation({
    mutationFn: (entryId) => timeService.releaseTimeEntry(entryId),
    onSuccess: (res) => {
      invalidate();
      showSuccess(t('fieldOps.time.overrideSuccess', 'Time entry manually released.'));
      onOverride?.(res);
    },
    onError: (err) => showError(err.message),
  });

  return { release, releaseBatch, override };
}
