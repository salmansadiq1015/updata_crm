'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { conflictService } from '../services/conflict-service';
import { queryKeys } from '@/lib/query/keys';
import { showSuccess, showError } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';

export function useConflictList() {
  return useQuery({
    queryKey: queryKeys.deploy.conflicts.all(),
    queryFn: () => conflictService.listConflicts(),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useConflictMutations({ onResolve } = {}) {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  const resolve = useMutation({
    mutationFn: ({ id, data }) => conflictService.resolveConflict(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.deploy.conflicts.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.deploy.dashboard.alerts() });
      showSuccess(t('deploy.conflicts.resolved', 'Konflikt gelöst'));
      onResolve?.();
    },
    onError: (err) => showError(err),
  });

  return { resolve };
}
