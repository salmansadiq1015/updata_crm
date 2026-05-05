'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { reportService } from '@/modules/mobile/services/report-service';
import { queryKeys } from '@/lib/query/keys';
import { showSuccess, showError } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';

const REPORTS_KEY = ['mobile', 'reports'];

export function useFieldOpsReportMutations({
  onApprove,
  onReject,
  onCreate,
  onDelete,
  onBulkDelete,
  onArchive,
  onUnarchive,
  onBulkArchive,
  onUpdate,
} = {}) {
  const queryClient = useQueryClient();
  const { t, locale: language } = useLanguage();
  const de = language === 'de';

  const invalidate = (orderId) => {
    queryClient.invalidateQueries({ queryKey: REPORTS_KEY });
    if (orderId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.mobile.reports.byOrder(orderId) });
    }
  };

  const createReport = useMutation({
    mutationFn: ({ orderId, payload }) => reportService.createReport(orderId, payload),
    retry: 0,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: REPORTS_KEY });
      showSuccess(de ? 'Bericht erstellt.' : 'Report created.');
      onCreate?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const approve = useMutation({
    mutationFn: ({ reportId }) =>
      reportService.updateReport(reportId, { status: 'APPROVED' }),
    onSuccess: (res, { orderId }) => {
      invalidate(orderId);
      showSuccess(de ? 'Bericht genehmigt.' : 'Report approved.');
      onApprove?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const reject = useMutation({
    mutationFn: ({ reportId, rejectionNote }) =>
      reportService.updateReport(reportId, { status: 'REJECTED', rejectionNote }),
    onSuccess: (res, { orderId }) => {
      invalidate(orderId);
      showSuccess(de ? 'Bericht abgelehnt.' : 'Report rejected.');
      onReject?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const updateReport = useMutation({
    mutationFn: ({ reportId, data }) =>
      reportService.updateReport(reportId, data),
    retry: 0,
    onSuccess: (res, { orderId }) => {
      invalidate(orderId);
      showSuccess(de ? 'Bericht aktualisiert.' : 'Report updated.');
      onUpdate?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const deleteReport = useMutation({
    mutationFn: ({ reportId }) => reportService.deleteReport(reportId),
    onSuccess: (_, { orderId }) => {
      invalidate(orderId);
      showSuccess(de ? 'Bericht gelöscht.' : 'Report deleted.');
      onDelete?.();
    },
    onError: (err) => showError(err.message),
  });

  const bulkDelete = useMutation({
    mutationFn: (ids) => reportService.bulkDeleteReports(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: REPORTS_KEY });
      showSuccess(de ? 'Berichte gelöscht.' : 'Reports deleted.');
      onBulkDelete?.();
    },
    onError: (err) => showError(err.message),
  });

  const archiveReport = useMutation({
    mutationFn: ({ reportId }) => reportService.archiveReport(reportId),
    onSuccess: (res, { orderId }) => {
      invalidate(orderId);
      showSuccess(de ? 'Bericht archiviert.' : 'Report archived.');
      onArchive?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const unarchiveReport = useMutation({
    mutationFn: ({ reportId }) => reportService.unarchiveReport(reportId),
    onSuccess: (res, { orderId }) => {
      invalidate(orderId);
      showSuccess(de ? 'Archivierung aufgehoben.' : 'Report unarchived.');
      onUnarchive?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const bulkArchive = useMutation({
    mutationFn: (ids) => reportService.bulkArchiveReports(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: REPORTS_KEY });
      showSuccess(de ? 'Berichte archiviert.' : 'Reports archived.');
      onBulkArchive?.();
    },
    onError: (err) => showError(err.message),
  });

  return {
    createReport,
    approve,
    reject,
    updateReport,
    deleteReport,
    bulkDelete,
    archiveReport,
    unarchiveReport,
    bulkArchive,
  };
}
