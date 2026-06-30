import { describe, expect, it } from 'vitest';
import { buildTaskDashboardAnalytics } from '../utils/task-dashboard-analytics';
import type { Task, TaskDashboard } from '../types/task-types';

type DashboardWithSample = TaskDashboard & {
  activeSample?: Task[];
  activeSampleLimit?: number;
  hasMoreActiveSample?: boolean;
};

const BASE_TASK: Task = {
  id: 'task-1',
  title: 'Base task',
  description: null,
  status: 'OPEN',
  priority: 'NONE',
  listId: 'list-1',
  assigneeId: null,
  createdBy: null,
  updatedBy: null,
  parentTaskId: null,
  projectId: null,
  orderId: null,
  startDate: null,
  dueDate: null,
  sortOrder: 0,
  depth: 0,
  subtaskCount: 0,
  noteCount: 0,
  attachmentCount: 0,
  version: 1,
  createdAt: '2026-06-30T08:00:00.000Z',
  updatedAt: '2026-06-30T08:00:00.000Z',
  completedAt: null,
  completedBy: null,
  cancelledAt: null,
};

const makeTask = (patch: Partial<Task>): Task => ({ ...BASE_TASK, ...patch });

const makeDashboard = (patch: Partial<DashboardWithSample>): DashboardWithSample => ({
  overdue: [],
  dueToday: [],
  upcoming: [],
  recentlyCompleted: [],
  stats: {
    totalOpen: 0,
    completedThisWeek: 0,
    overdueCount: 0,
    totalTasks: 0,
  },
  ...patch,
});

describe('buildTaskDashboardAnalytics', () => {
  it('deduplicates active tasks across dashboard lanes', () => {
    const duplicated = makeTask({
      id: 'shared',
      title: 'Shared task',
      priority: 'HIGH',
      dueDate: '2026-06-30T09:00:00.000Z',
    });

    const analytics = buildTaskDashboardAnalytics(
      makeDashboard({
        overdue: [duplicated],
        dueToday: [duplicated],
        stats: {
          totalOpen: 1,
          completedThisWeek: 1,
          overdueCount: 1,
          totalTasks: 2,
        },
      }),
      7,
      new Date('2026-06-30T00:00:00.000Z'),
    );

    expect(analytics.totalVisibleActive).toBe(1);
    expect(analytics.priorityMix).toEqual([{ priority: 'HIGH', value: 1 }]);
    expect(analytics.weeklyCloseRate).toBe(50);
    expect(analytics.overdueRate).toBe(100);
  });

  it('uses active samples when due-date lanes are empty', () => {
    const analytics = buildTaskDashboardAnalytics(
      makeDashboard({
        activeSample: [
          makeTask({ id: 'open-1', title: 'Open without due date', priority: 'MEDIUM', dueDate: null }),
          makeTask({ id: 'open-2', title: 'High without due date', priority: 'HIGH', dueDate: null }),
        ],
        activeSampleLimit: 120,
        hasMoreActiveSample: false,
        stats: {
          totalOpen: 2,
          completedThisWeek: 0,
          overdueCount: 0,
          totalTasks: 2,
        },
      }),
      7,
      new Date('2026-06-30T00:00:00.000Z'),
    );

    expect(analytics.totalVisibleActive).toBe(2);
    expect(analytics.dueDateCoverage).toBe(0);
    expect(analytics.priorityMix).toEqual([
      { priority: 'HIGH', value: 1 },
      { priority: 'MEDIUM', value: 1 },
    ]);
    expect(analytics.workload[0]).toEqual({ key: 'active', value: 2 });
    expect(analytics.riskQueue.map((task) => task.id)).toEqual(['open-2', 'open-1']);
  });

  it('builds a safe due trend and ignores invalid dates', () => {
    const analytics = buildTaskDashboardAnalytics(
      makeDashboard({
        dueToday: [
          makeTask({ id: 'today', dueDate: '2026-06-30T12:00:00.000Z' }),
          makeTask({ id: 'invalid', dueDate: 'not-a-date' }),
        ],
        upcoming: [
          makeTask({ id: 'tomorrow', dueDate: '2026-07-01T12:00:00.000Z' }),
        ],
      }),
      3,
      new Date('2026-06-30T00:00:00.000Z'),
    );

    expect(analytics.dueTrend.map((item) => item.value)).toEqual([1, 1, 0]);
    expect(analytics.dueDateCoverage).toBe(67);
  });

  it('sorts the risk queue by priority and due date', () => {
    const urgentLater = makeTask({
      id: 'urgent-later',
      priority: 'URGENT',
      dueDate: '2026-07-03T10:00:00.000Z',
    });
    const urgentSooner = makeTask({
      id: 'urgent-sooner',
      priority: 'URGENT',
      dueDate: '2026-07-01T10:00:00.000Z',
    });
    const highSoon = makeTask({
      id: 'high-soon',
      priority: 'HIGH',
      dueDate: '2026-06-30T10:00:00.000Z',
    });

    const analytics = buildTaskDashboardAnalytics(
      makeDashboard({
        upcoming: [highSoon, urgentLater, urgentSooner],
      }),
      7,
      new Date('2026-06-30T00:00:00.000Z'),
    );

    expect(analytics.riskQueue.map((task) => task.id)).toEqual(['urgent-sooner', 'urgent-later', 'high-soon']);
  });

  it('returns zero percentages for empty dashboards', () => {
    const analytics = buildTaskDashboardAnalytics(undefined, 7, new Date('2026-06-30T00:00:00.000Z'));

    expect(analytics.weeklyCloseRate).toBe(0);
    expect(analytics.overdueRate).toBe(0);
    expect(analytics.dueDateCoverage).toBe(0);
    expect(analytics.dueTrend).toHaveLength(7);
  });
});
