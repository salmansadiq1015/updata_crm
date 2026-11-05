'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { queryKeys } from '@/lib/query/keys';
import { taskApi } from '../services/task-api';
import type { Task, TaskDashboard, TaskDashboardStats, TaskStatus } from '../types/task-types';

const ACTIVE_SAMPLE_STATUSES: TaskStatus[] = ['OPEN', 'IN_PROGRESS', 'ON_HOLD'];
const ACTIVE_SAMPLE_LIMIT_PER_STATUS = 40;

export type TaskDashboardOverview = TaskDashboard & {
  stats: TaskDashboardStats;
  activeSample: Task[];
  activeSampleLimit: number;
  hasMoreActiveSample: boolean;
  sampleUnavailable: boolean;
};

// Sampling enriches charts; it must never take down the authoritative dashboard.
export async function fetchTaskDashboardOverview(upcomingDays: number, assigneeId: string): Promise<TaskDashboardOverview> {
  const [dashboard, stats, samples] = await Promise.all([
    taskApi.dashboard({ upcomingDays }),
    taskApi.dashboardStats(),
    Promise.allSettled(ACTIVE_SAMPLE_STATUSES.map((status) =>
      taskApi.list({ status, assigneeId, limit: ACTIVE_SAMPLE_LIMIT_PER_STATUS, sortBy: 'dueDate', sortOrder: 'asc' }),
    )),
  ]);
  const activePages = samples.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
  return {
    ...dashboard,
    stats,
    activeSample: activePages.flatMap((page) => page.data),
    activeSampleLimit: ACTIVE_SAMPLE_STATUSES.length * ACTIVE_SAMPLE_LIMIT_PER_STATUS,
    hasMoreActiveSample: activePages.some((page) => page.pagination.hasNext),
    sampleUnavailable: samples.some((result) => result.status === 'rejected'),
  };
}

export function useTaskDashboardOverview(upcomingDays: number): UseQueryResult<TaskDashboardOverview, Error> {
  const userId = useAuthStore((state: { user?: { _id?: string; id?: string } | null }) => state.user?._id ?? state.user?.id);
  return useQuery<TaskDashboardOverview, Error>({
    queryKey: queryKeys.tasks.dashboard({ upcomingDays, scope: 'overview', userId }),
    queryFn: () => fetchTaskDashboardOverview(upcomingDays, userId!),
    enabled: Boolean(userId),
    staleTime: 20_000,
  });
}
