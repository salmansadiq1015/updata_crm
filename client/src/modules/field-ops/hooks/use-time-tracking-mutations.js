'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { showError, showSuccess } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';
import { timeTrackingService } from '@/modules/field-ops/services/time-tracking-service';

export function useTimeTrackingMutations() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.timeTracking.all() });
    queryClient.invalidateQueries({ queryKey: queryKeys.deploy.all() });
  };

  const createLeaveRequest = useMutation({
    mutationFn: (payload) => timeTrackingService.createLeaveRequest(payload),
    onSuccess: () => {
      invalidate();
      showSuccess(t('fieldOps.time.leaveCreated', 'Leave request created.'));
    },
    onError: (err) => showError(err.message),
  });

  const approveLeaveRequest = useMutation({
    mutationFn: ({ id, decisionNote }) => timeTrackingService.approveLeaveRequest(id, { decisionNote }),
    onSuccess: () => {
      invalidate();
      showSuccess(t('fieldOps.time.leaveApproved', 'Leave request approved.'));
    },
    onError: (err) => showError(err.message),
  });

  const rejectLeaveRequest = useMutation({
    mutationFn: ({ id, decisionNote }) => timeTrackingService.rejectLeaveRequest(id, decisionNote),
    onSuccess: () => {
      invalidate();
      showSuccess(t('fieldOps.time.leaveRejected', 'Leave request rejected.'));
    },
    onError: (err) => showError(err.message),
  });

  const cancelLeaveRequest = useMutation({
    mutationFn: (id) => timeTrackingService.cancelLeaveRequest(id),
    onSuccess: () => {
      invalidate();
      showSuccess(t('fieldOps.time.leaveCancelled', 'Leave request cancelled.'));
    },
    onError: (err) => showError(err.message),
  });

  const upsertVacationBalance = useMutation({
    mutationFn: ({ employeeId, year, payload }) => timeTrackingService.upsertVacationBalance(employeeId, year, payload),
    onSuccess: () => {
      invalidate();
      showSuccess(t('fieldOps.time.balanceSaved', 'Vacation balance saved.'));
    },
    onError: (err) => showError(err.message),
  });

  const exportTimeEntries = useMutation({
    mutationFn: (filters) => timeTrackingService.exportTimeEntries(filters),
    onSuccess: () => showSuccess(t('fieldOps.time.exportStarted', 'Time records export started.')),
    onError: (err) => showError(err.message),
  });

  const downloadImportTemplate = useMutation({
    mutationFn: () => timeTrackingService.downloadImportTemplate(),
    onSuccess: () => showSuccess(t('fieldOps.time.importTemplateDownloaded', 'Import template downloaded.')),
    onError: (err) => showError(err.message),
  });

  const importTimeEntries = useMutation({
    mutationFn: ({ file, dryRun }) => timeTrackingService.importTimeEntries(file, { dryRun }),
    onSuccess: (result) => {
      if (!result?.dryRun && Number(result?.created || 0) > 0) {
        invalidate();
        showSuccess(t('fieldOps.time.importComplete', 'Time entries imported.'));
        return;
      }
      showSuccess(t('fieldOps.time.importValidated', 'Import file validated.'));
    },
    onError: (err) => showError(err.message),
  });

  return {
    createLeaveRequest,
    approveLeaveRequest,
    rejectLeaveRequest,
    cancelLeaveRequest,
    upsertVacationBalance,
    exportTimeEntries,
    downloadImportTemplate,
    importTimeEntries,
  };
}
