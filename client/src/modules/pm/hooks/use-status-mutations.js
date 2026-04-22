'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { statusService } from '@/modules/pm/services/status-service';
import { queryKeys } from '@/lib/query/keys';
import { showSuccess, showError } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';

export function useStatusMutations(projectId, { onTransition } = {}) {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  const transition = useMutation({
    mutationFn: (data) => statusService.transitionStatus(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pm.projects.detail(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.pm.statusHistory.byProject(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.pm.projects.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.pm.dashboard.summary() });
      showSuccess(t('pm.statusChanged', 'Status changed'));
      onTransition?.();
    },
    onError: (err) => showError(err.message),
  });

  return { transition };
}
