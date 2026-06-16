'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { assignmentService } from '../services/assignment-service';
import { queryKeys } from '@/lib/query/keys';
import { showSuccess, showError } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';

export function useAssignmentMutations({ onCreate, onUpdate, onDelete, onMove, onResize, onConflict } = {}) {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  const invalidateCalendar = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.deploy.calendar.all() });
    queryClient.invalidateQueries({ queryKey: queryKeys.deploy.dashboard.all() });
    queryClient.invalidateQueries({ queryKey: queryKeys.deploy.conflicts.all() });
  };

  const handleError = (err, variables) => {
    const handled = onConflict?.(err, variables);
    if (!handled) showError(err);
  };

  const create = useMutation({
    mutationFn: (data) => assignmentService.createAssignment(data),
    onSuccess: (res) => {
      invalidateCalendar();
      showSuccess(t('deploy.assignments.created', 'Einsatz erstellt'));
      onCreate?.(res);
    },
    onError: handleError,
  });

  const update = useMutation({
    mutationFn: ({ id, data }) => assignmentService.updateAssignment(id, data),
    onSuccess: (res) => {
      invalidateCalendar();
      queryClient.invalidateQueries({ queryKey: queryKeys.deploy.assignments.detail(res._id) });
      showSuccess(t('deploy.assignments.updated', 'Einsatz aktualisiert'));
      onUpdate?.(res);
    },
    onError: handleError,
  });

  const remove = useMutation({
    mutationFn: (id) => assignmentService.deleteAssignment(id),
    onSuccess: () => {
      invalidateCalendar();
      showSuccess(t('deploy.assignments.deleted', 'Einsatz gelöscht'));
      onDelete?.();
    },
    onError: handleError,
  });

  const move = useMutation({
    mutationFn: ({ id, data }) => assignmentService.moveAssignment(id, data),
    onSuccess: (res) => {
      invalidateCalendar();
      showSuccess(t('deploy.assignments.moved', 'Einsatz verschoben'));
      onMove?.(res);
    },
    onError: handleError,
  });

  const resize = useMutation({
    mutationFn: ({ id, data }) => assignmentService.resizeAssignment(id, data),
    onSuccess: (res) => {
      invalidateCalendar();
      showSuccess(t('deploy.assignments.resized', 'Dauer geändert'));
      onResize?.(res);
    },
    onError: handleError,
  });

  return { create, update, remove, move, resize };
}
