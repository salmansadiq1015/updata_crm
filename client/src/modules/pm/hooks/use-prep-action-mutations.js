'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { prepActionService } from '@/modules/pm/services/prep-action-service';
import { queryKeys } from '@/lib/query/keys';
import { showSuccess, showError } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';

export function usePrepActionMutations(projectId, { onCreate, onUpdate, onDelete } = {}) {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.pm.prepActions.byProject(projectId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.pm.dashboard.summary() });
  };

  const create = useMutation({
    mutationFn: (data) => prepActionService.createPrepAction(projectId, data),
    onSuccess: (res) => { invalidate(); showSuccess(t('pm.actionCreated', 'Action created')); onCreate?.(res); },
    onError: (err) => showError(err.message),
  });

  const update = useMutation({
    mutationFn: ({ actionId, data }) => prepActionService.updatePrepAction(projectId, actionId, data),
    onSuccess: (res) => { invalidate(); showSuccess(t('pm.actionUpdated', 'Action updated')); onUpdate?.(res); },
    onError: (err) => showError(err.message),
  });

  const remove = useMutation({
    mutationFn: (actionId) => prepActionService.deletePrepAction(projectId, actionId),
    onSuccess: (res) => { invalidate(); showSuccess(t('pm.actionDeleted', 'Action deleted')); onDelete?.(res); },
    onError: (err) => showError(err.message),
  });

  return { create, update, remove };
}
