'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { reportService } from '@/modules/mobile/services/report-service';
import { queryKeys } from '@/lib/query/keys';
import { showSuccess, showError } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';

export function useFieldOpsReportMutations({ onApprove, onReject } = {}) {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  const invalidate = (orderId) => {
    queryClient.invalidateQueries({ queryKey: ['mobile', 'reports'] });
    if (orderId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.mobile.reports.byOrder(orderId) });
    }
  };

  const approve = useMutation({
    mutationFn: ({ reportId }) =>
      reportService.updateReport(reportId, { status: 'APPROVED' }),
    onSuccess: (res, { orderId }) => {
      invalidate(orderId);
      showSuccess(t('fieldOps.reports.approved', 'Report approved.'));
      onApprove?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const reject = useMutation({
    mutationFn: ({ reportId, rejectionNote }) =>
      reportService.updateReport(reportId, { status: 'REJECTED', rejectionNote }),
    onSuccess: (res, { orderId }) => {
      invalidate(orderId);
      showSuccess(t('fieldOps.reports.rejected', 'Report rejected.'));
      onReject?.(res);
    },
    onError: (err) => showError(err.message),
  });

  return { approve, reject };
}
