'use client';

import { queryKeys } from '@/lib/query/keys';
import { reportService } from '../services/report-service';
import { db } from '../db/mobile-db';
import { useOfflineQuery } from './use-offline-query';
import { decryptSensitiveFields, encryptSensitiveFields } from '../lib/crypto';

export function useOrderReports(orderId) {
  return useOfflineQuery({
    queryKey: queryKeys.mobile.reports.byOrder(orderId),
    queryFn: () => reportService.getReportsByOrder(orderId),
    offlineFn: async () => {
      const reports = await db.workReports.where('order_id').equals(orderId).toArray();
      return Promise.all(reports.map(decryptSensitiveFields));
    },
    onServerData: async (res) => {
      const reports = Array.isArray(res) ? res : res?.data || [];
      for (const r of reports) {
        const encrypted = await encryptSensitiveFields({ ...r, last_synced_at: new Date().toISOString() });
        await db.workReports.put(encrypted);
      }
    },
    enabled: !!orderId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useReportDetail(reportId) {
  return useOfflineQuery({
    queryKey: queryKeys.mobile.reports.detail(reportId),
    queryFn: () => reportService.getReport(reportId),
    offlineFn: async () => {
      const report = await db.workReports.get(reportId);
      return report ? decryptSensitiveFields(report) : null;
    },
    onServerData: async (report) => {
      if (report) {
        const encrypted = await encryptSensitiveFields({ ...report, last_synced_at: new Date().toISOString() });
        await db.workReports.put(encrypted);
      }
    },
    enabled: !!reportId,
    staleTime: 5 * 60 * 1000,
  });
}
