'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
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
};

export function useTaskDashboardOverview(upcomingDays: number): UseQueryResult<TaskDashboardOverview, Error> {
  return useQuery<TaskDashboardOverview, Error>({
    queryKey: queryKeys.tasks.dashboard({ upcomingDays, scope: 'overview' }),
    queryFn: async () => {
      const [dashboard, stats, ...activePages] = await Promise.all([
        taskApi.dashboard({ upcomingDays }),
        taskApi.dashboardStats(),
        ...ACTIVE_SAMPLE_STATUSES.map((status) =>
          taskApi.list({
            status,
            limit: ACTIVE_SAMPLE_LIMIT_PER_STATUS,
            sortBy: 'dueDate',
            sortOrder: 'asc',
          }),
        ),
      ]);
      const activeSample = activePages.flatMap((page) => page.data);
      return {
        ...dashboard,
        stats,
        activeSample,
        activeSampleLimit: ACTIVE_SAMPLE_STATUSES.length * ACTIVE_SAMPLE_LIMIT_PER_STATUS,
        hasMoreActiveSample: activePages.some((page) => page.pagination.hasNext),
      };
    },
    staleTime: 20_000,
  });
}
