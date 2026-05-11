'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { reportService } from '../services/report-service';
import { db } from '../db/mobile-db';
import { useNetworkStatus } from './use-network-status';
import { useOfflineMutation } from './use-offline-mutation';
import { SYNC_STATUS, SYNC_ENTITY_TYPE, REPORT_STATUS } from '../constants/mobile-constants';
import { encryptSensitiveFields } from '../lib/crypto';
import { generateId } from '@/lib/utils/ids';
import toast from 'react-hot-toast';

export function useReportMutations(orderId) {
  const isOnline = useNetworkStatus();
  const queryClient = useQueryClient();

  const keys = [
    queryKeys.mobile.reports.byOrder(orderId),
    queryKeys.mobile.orders.detail(orderId),
  ];

  const createReport = useOfflineMutation({
    mutationFn: (data) => reportService.createReport(orderId, data),
    entityType: SYNC_ENTITY_TYPE.WORK_REPORT,
    invalidateKeys: keys,
    onOfflineWrite: async (data) => {
      const id = generateId();
      const report = await encryptSensitiveFields({
        id,
        order_id: orderId,
        ...data,
        status: REPORT_STATUS.DRAFT,
        sync_status: SYNC_STATUS.PENDING_SYNC,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      await db.workReports.add(report);
      return { entityId: id, operation: 'CREATE', payload: { order_id: orderId, data }, ...report };
    },
    onSuccess: () => toast.success('Bericht erstellt'),
    onError: (err) => toast.error(err.message),
  });

  const updateReport = useOfflineMutation({
    mutationFn: ({ reportId, data }) => reportService.updateReport(reportId, data),
    entityType: SYNC_ENTITY_TYPE.WORK_REPORT,
    invalidateKeys: keys,
    onOfflineWrite: async ({ reportId, data }) => {
      const encrypted = await encryptSensitiveFields({
        ...data,
        sync_status: SYNC_STATUS.PENDING_SYNC,
        updated_at: new Date().toISOString(),
      });
      await db.workReports.update(reportId, encrypted);
      const updated = await db.workReports.get(reportId);
      return { entityId: reportId, operation: 'UPDATE', payload: { data }, ...updated };
    },
    onSuccess: () => toast.success('Entwurf gespeichert'),
    onError: (err) => toast.error(err.message),
  });

  const submitReport = useMutation({
    mutationFn: async (reportId) => {
      if (!isOnline) {
        toast.error('Einreichen nur online möglich');
        throw new Error('Cannot submit while offline');
      }
      return reportService.submitReport(reportId);
    },
    onSuccess: () => {
      keys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
      queryClient.invalidateQueries({ queryKey: queryKeys.mobile.timeEntries.byOrder(orderId) });
      toast.success('Bericht eingereicht');
    },
    onError: (err) => toast.error(err.message),
  });

  return { createReport, updateReport, submitReport };
}
