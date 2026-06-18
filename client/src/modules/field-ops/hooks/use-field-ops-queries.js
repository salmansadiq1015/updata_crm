'use client';

import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { orderService } from '@/modules/mobile/services/order-service';
import { reportService } from '@/modules/mobile/services/report-service';
import { timeService } from '@/modules/mobile/services/time-service';
import { photoService } from '@/modules/mobile/services/photo-service';
import { installationService } from '@/modules/mobile/services/installation-service';
import { catalogService } from '@/modules/mobile/services/catalog-service';
import { notificationService } from '@/modules/mobile/services/notification-service';

export function useFieldOpsOrders(filters = {}) {
  return useQuery({
    queryKey: ['field-ops', 'orders', 'all', filters],
    queryFn: () => orderService.getAllOrdersPage(filters),
    staleTime: 30_000,
  });
}

export function useFieldOpsOrderDetail(id) {
  return useQuery({
    queryKey: queryKeys.mobile.orders.detail(id),
    queryFn: () => orderService.getOrderById(id),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useFieldOpsOrderHistory(id) {
  return useQuery({
    queryKey: queryKeys.mobile.orders.history(id),
    queryFn: () => orderService.getOrderHistory(id),
    enabled: !!id,
    staleTime: 30_000,
    select: (data) => (Array.isArray(data) ? data : (data?.data ?? [])),
  });
}

export function useFieldOpsOrderReports(orderId) {
  return useQuery({
    queryKey: queryKeys.mobile.reports.byOrder(orderId),
    queryFn: () => reportService.getReportsByOrder(orderId),
    enabled: !!orderId,
    staleTime: 30_000,
  });
}

export function useFieldOpsAllReports(filters = {}) {
  return useQuery({
    queryKey: queryKeys.mobile.reports.list(filters),
    queryFn: () => reportService.getAllReports(filters),
    staleTime: 30_000,
  });
}

export function useFieldOpsReportSummary(filters = {}) {
  return useQuery({
    queryKey: ['mobile', 'reports', 'summary', filters],
    queryFn: () => reportService.getReportSummary(filters),
    staleTime: 30_000,
  });
}

export function useFieldOpsReportDetail(reportId) {
  return useQuery({
    queryKey: queryKeys.mobile.reports.detail(reportId),
    queryFn: () => reportService.getReport(reportId),
    enabled: !!reportId,
    staleTime: 30_000,
  });
}

export function useFieldOpsReportHistory(reportId) {
  return useQuery({
    queryKey: ['mobile', 'reports', 'history', reportId],
    queryFn: () => reportService.getReportHistory(reportId),
    enabled: !!reportId,
    staleTime: 30_000,
  });
}

export function useFieldOpsTimeEntries(filters = {}) {
  return useQuery({
    queryKey: queryKeys.mobile.timeEntries.list(filters),
    queryFn: () => timeService.getTimeEntries(filters),
    staleTime: 30_000,
  });
}

export function useFieldOpsOrderTimeEntries(orderId) {
  return useQuery({
    queryKey: queryKeys.mobile.timeEntries.byOrder(orderId),
    queryFn: () => timeService.getTimeEntriesByOrder(orderId),
    enabled: !!orderId,
    staleTime: 30_000,
  });
}

export function useFieldOpsOrderPhotos(orderId) {
  return useQuery({
    queryKey: queryKeys.mobile.photos.byOrder(orderId),
    queryFn: () => photoService.getPhotos(orderId),
    enabled: !!orderId,
    staleTime: 60_000,
  });
}

export function useFieldOpsInstallations(siteId) {
  return useQuery({
    queryKey: queryKeys.mobile.installations.bySite(siteId),
    queryFn: () => installationService.getInstallations(siteId),
    enabled: !!siteId,
    staleTime: 60_000,
  });
}

export function useFieldOpsInstallationDetail(id) {
  return useQuery({
    queryKey: queryKeys.mobile.installations.detail(id),
    queryFn: () => installationService.getInstallationById(id),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useFieldOpsNotifications(params = {}) {
  return useInfiniteQuery({
    queryKey: queryKeys.mobile.notifications.list(),
    queryFn: ({ pageParam }) =>
      notificationService.getNotifications({ ...params, cursor: pageParam ?? undefined }),
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? null,
    staleTime: 60_000,
  });
}

export function useFieldOpsOrderQuotation(orderId) {
  return useQuery({
    queryKey: queryKeys.mobile.quotation.byOrder(orderId),
    queryFn: () => orderService.getQuotation(orderId),
    enabled: !!orderId,
    staleTime: 120_000,
  });
}

export function useFieldOpsCatalogSearch(query, source = 'ALL') {
  return useQuery({
    queryKey: queryKeys.mobile.catalog.search(query),
    queryFn: () => catalogService.search(query, source),
    enabled: !!query && query.length >= 2,
    staleTime: 120_000,
  });
}
