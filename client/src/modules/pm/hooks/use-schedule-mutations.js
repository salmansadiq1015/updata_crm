'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { scheduleService } from '@/modules/pm/services/schedule-service';
import { queryKeys } from '@/lib/query/keys';
import { showSuccess, showError } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';

export function useScheduleMutations(projectId, { onAddEntry, onUpdateEntry, onDeleteEntry, onSendConfirmation, onUpdateConfirmation } = {}) {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.pm.schedule.byProject(projectId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.pm.dashboard.milestones() });
  };

  const addEntry = useMutation({
    mutationFn: (data) => scheduleService.addEntry(projectId, data),
    onSuccess: (res) => { invalidate(); showSuccess(t('pm.entryCreated', 'Entry created')); onAddEntry?.(res); },
    onError: (err) => showError(err.message),
  });

  const updateEntry = useMutation({
    mutationFn: ({ entryId, data }) => scheduleService.updateEntry(projectId, entryId, data),
    onSuccess: (res) => { invalidate(); showSuccess(t('pm.entryUpdated', 'Entry updated')); onUpdateEntry?.(res); },
    onError: (err) => showError(err.message),
  });

  const deleteEntry = useMutation({
    mutationFn: (entryId) => scheduleService.deleteEntry(projectId, entryId),
    onSuccess: (res) => { invalidate(); showSuccess(t('pm.entryDeleted', 'Entry deleted')); onDeleteEntry?.(res); },
    onError: (err) => showError(err.message),
  });

  const sendConfirmation = useMutation({
    mutationFn: ({ entryId, data }) => scheduleService.sendConfirmation(projectId, entryId, data),
    onSuccess: (res) => { invalidate(); showSuccess(t('pm.confirmationSent', 'Confirmation sent')); onSendConfirmation?.(res); },
    onError: (err) => showError(err.message),
  });

  const updateConfirmation = useMutation({
    mutationFn: ({ entryId, confId, data }) => scheduleService.updateConfirmationResponse(projectId, entryId, confId, data),
    onSuccess: (res) => { invalidate(); showSuccess(t('pm.confirmed', 'Response recorded')); onUpdateConfirmation?.(res); },
    onError: (err) => showError(err.message),
  });

  const exportSchedule = useMutation({
    mutationFn: (format) => scheduleService.exportSchedule(projectId, format),
    onSuccess: (res) => {
      showSuccess(t('pm.exportReady', 'Export ready') + (res?.filename ? ` — ${res.filename}` : ''));
    },
    onError: (err) => showError(err.message),
  });

  return { addEntry, updateEntry, deleteEntry, sendConfirmation, updateConfirmation, exportSchedule };
}
