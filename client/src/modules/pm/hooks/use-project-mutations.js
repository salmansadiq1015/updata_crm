'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { projectService } from '@/modules/pm/services/project-service';
import { queryKeys } from '@/lib/query/keys';
import { showSuccess, showError } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';

export function useProjectMutations({ onCreate, onUpdate, onDelete, onArchive, onRestore, onDuplicate, onBulkUpdate, onBulkDelete, onExport } = {}) {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.pm.projects.all() });
    queryClient.invalidateQueries({ queryKey: queryKeys.pm.dashboard.summary() });
  };

  const create = useMutation({
    mutationFn: (data) => projectService.createProject(data),
    onSuccess: (res) => {
      invalidate();
      showSuccess(t('pm.projectCreated', 'Project created'));
      onCreate?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const update = useMutation({
    mutationFn: ({ id, data }) => projectService.updateProject(id, data),
    onSuccess: (res) => {
      invalidate();
      showSuccess(t('pm.projectUpdated', 'Project updated'));
      onUpdate?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const remove = useMutation({
    mutationFn: (id) => projectService.deleteProject(id),
    onSuccess: (res) => {
      invalidate();
      showSuccess(t('pm.projectDeleted', 'Project deleted'));
      onDelete?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const archive = useMutation({
    mutationFn: (id) => projectService.archiveProject(id),
    onSuccess: (res) => {
      invalidate();
      showSuccess(t('pm.projectArchived', 'Project archived'));
      onArchive?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const restore = useMutation({
    mutationFn: (id) => projectService.restoreProject(id),
    onSuccess: (res) => {
      invalidate();
      showSuccess(t('pm.projectRestored', 'Project restored'));
      onRestore?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const createFromTemplate = useMutation({
    mutationFn: (data) => projectService.createFromTemplate(data),
    onSuccess: (res) => {
      invalidate();
      showSuccess(t('pm.projectCreated', 'Project created'));
      onCreate?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const duplicate = useMutation({
    mutationFn: (id) => projectService.duplicateProject(id),
    onSuccess: (res) => {
      invalidate();
      showSuccess(t('pm.projectDuplicated', 'Project duplicated'));
      onDuplicate?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const bulkUpdate = useMutation({
    mutationFn: ({ ids, data }) => projectService.bulkUpdate(ids, data),
    onSuccess: (res) => {
      invalidate();
      showSuccess(t('pm.projectUpdated', 'Projects updated'));
      onBulkUpdate?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const bulkDelete = useMutation({
    mutationFn: (ids) => projectService.bulkDelete(ids),
    onSuccess: (res) => {
      invalidate();
      showSuccess(t('pm.projectDeleted', 'Projects archived'));
      onBulkDelete?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const exportCsv = useMutation({
    mutationFn: (filters) => projectService.exportCsv(filters),
    onSuccess: (res) => {
      showSuccess(t('pm.exportReady', 'Export ready') + (res?.filename ? ` — ${res.filename}` : ''));
      onExport?.(res);
    },
    onError: (err) => showError(err.message),
  });

  return { create, createFromTemplate, update, remove, archive, restore, duplicate, bulkUpdate, bulkDelete, exportCsv };
}
