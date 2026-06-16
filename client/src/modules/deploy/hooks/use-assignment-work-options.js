'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { orderService } from '@/modules/qop/services/order-service';
import { projectService } from '@/modules/pm/services/project-service';

const ASSIGNABLE_ORDER_STATUSES = new Set(['CONFIRMED', 'IN_PROGRESS']);
const ASSIGNABLE_PROJECT_STATUSES = new Set([
  'DRAFT',
  'PLANNING',
  'SCHEDULED',
  'WAITING_FOR_MATERIAL',
  'IN_PROGRESS',
  'AWAITING_CUSTOMER_APPROVAL',
  'AWAITING_QUOTATION_APPROVAL',
  'ON_HOLD',
]);

function normalizeId(value) {
  return value?._id || value?.id || value || '';
}

function normalizeCursorItems(response) {
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.items)) return response.items;
  if (Array.isArray(response)) return response;
  return [];
}

function compactParams(params) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  );
}

export function projectLabel(project) {
  return [project?.projectNumber, project?.name].filter(Boolean).join(' - ') || normalizeId(project);
}

export function orderLabel(order) {
  return [order?.orderNumber, order?.title || order?.customerName || order?.customerId?.name]
    .filter(Boolean)
    .join(' - ') || normalizeId(order);
}

export function normalizeProjectOption(project) {
  if (!project) return null;
  const customer = project.customerId;
  const site = project.siteId;
  return {
    ...project,
    _id: normalizeId(project),
    label: projectLabel(project),
    customerId: normalizeId(customer),
    customerName: customer?.name || project.customerName || '',
    siteId: normalizeId(site),
    siteName: site?.name || '',
  };
}

export function normalizeOrderOption(order) {
  if (!order) return null;
  const customer = order.customerId;
  const project = order.projectId;
  return {
    ...order,
    _id: normalizeId(order),
    label: orderLabel(order),
    customerId: normalizeId(customer),
    customerName: order.customerName || customer?.name || '',
    projectId: normalizeId(project),
    projectName: project?.name || '',
    projectNumber: project?.projectNumber || '',
  };
}

export function useAssignmentProjectOptions({ enabled = true, search = '', limit = 30 } = {}) {
  const trimmedSearch = search.trim();
  const params = useMemo(() => compactParams({
    search: trimmedSearch,
    limit,
    sortBy: 'plannedStartDate',
    sortOrder: 'asc',
  }), [trimmedSearch, limit]);

  return useQuery({
    queryKey: queryKeys.pm.projects.list(params),
    queryFn: () => projectService.getProjects(params),
    enabled,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
    select: (response) => normalizeCursorItems(response)
      .map(normalizeProjectOption)
      .filter((project) => project && ASSIGNABLE_PROJECT_STATUSES.has(project.status)),
  });
}

export function useAssignmentOrderOptions({ enabled = true, search = '', projectId = '', limit = 30 } = {}) {
  const trimmedSearch = search.trim();
  const params = useMemo(() => compactParams({
    search: trimmedSearch,
    projectId,
    limit,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  }), [trimmedSearch, projectId, limit]);

  return useQuery({
    queryKey: queryKeys.qop.orders(params),
    queryFn: () => orderService.list(params),
    enabled,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
    select: (response) => normalizeCursorItems(response)
      .map(normalizeOrderOption)
      .filter((order) => order && ASSIGNABLE_ORDER_STATUSES.has(order.status)),
  });
}
