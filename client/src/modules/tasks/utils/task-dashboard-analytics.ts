import type { Task, TaskDashboard, TaskDashboardStats, TaskPriority, TaskStatus } from '../types/task-types';

export type TaskDashboardSectionKey = 'active' | 'overdue' | 'today' | 'upcoming' | 'completed';

export type WorkloadDatum = {
  key: TaskDashboardSectionKey;
  value: number;
};

export type PriorityDatum = {
  priority: TaskPriority;
  value: number;
};

export type DueTrendDatum = {
  key: string;
  date: string;
  value: number;
};

export type TaskDashboardAnalytics = {
  stats: TaskDashboardStats;
  activeTasks: Task[];
  activeSampleLimit: number;
  hasMoreActiveSample: boolean;
  totalVisibleActive: number;
  weeklyCloseRate: number;
  overdueRate: number;
  dueDateCoverage: number;
  workload: WorkloadDatum[];
  priorityMix: PriorityDatum[];
  dueTrend: DueTrendDatum[];
  statusMix: Array<{ status: TaskStatus; value: number }>;
  riskQueue: Task[];
};

const EMPTY_STATS: TaskDashboardStats = {
  totalOpen: 0,
  completedThisWeek: 0,
  overdueCount: 0,
  totalTasks: 0,
};

const PRIORITY_ORDER: TaskPriority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE'];
const STATUS_ORDER: TaskStatus[] = ['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];

const RISK_QUEUE_LIMIT = 6;

const isActiveTask = (task: Task): boolean => task.status !== 'COMPLETED' && task.status !== 'CANCELLED';

const parseDate = (value: string | null): Date | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const dateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDays = (date: Date, days: number): Date => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() + days);
  return copy;
};

const percent = (value: number, total: number): number => {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
};

const dedupeTasks = (tasks: Task[]): Task[] => {
  const seen = new Set<string>();
  return tasks.filter((task) => {
    if (seen.has(task.id)) return false;
    seen.add(task.id);
    return true;
  });
};

const sortRiskTasks = (tasks: Task[]): Task[] =>
  [...tasks].sort((left, right) => {
    const priorityDelta = PRIORITY_ORDER.indexOf(left.priority) - PRIORITY_ORDER.indexOf(right.priority);
    if (priorityDelta !== 0) return priorityDelta;

    const leftDue = parseDate(left.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const rightDue = parseDate(right.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return leftDue - rightDue;
  });

export function buildTaskDashboardAnalytics(
  dashboard: (TaskDashboard & { activeSample?: Task[]; activeSampleLimit?: number; hasMoreActiveSample?: boolean }) | undefined,
  upcomingDays: number,
  now = new Date(),
): TaskDashboardAnalytics {
  const stats = dashboard?.stats ?? EMPTY_STATS;
  const overdue = dashboard?.overdue ?? [];
  const dueToday = dashboard?.dueToday ?? [];
  const upcoming = dashboard?.upcoming ?? [];
  const recentlyCompleted = dashboard?.recentlyCompleted ?? [];
  const activeSample = dashboard?.activeSample ?? [];
  const activeTasks = dedupeTasks([...activeSample, ...overdue, ...dueToday, ...upcoming].filter(isActiveTask));
  const safeUpcomingDays = Math.max(1, Math.floor(upcomingDays));

  const dueCounts = new Map<string, number>();
  for (const task of dedupeTasks([...dueToday, ...upcoming])) {
    const dueDate = parseDate(task.dueDate);
    if (!dueDate) continue;
    const key = dateKey(dueDate);
    dueCounts.set(key, (dueCounts.get(key) ?? 0) + 1);
  }

  const dueTrend = Array.from({ length: safeUpcomingDays }, (_, index) => {
    const date = addDays(now, index);
    const key = dateKey(date);
    return {
      key,
      date: date.toISOString(),
      value: dueCounts.get(key) ?? 0,
    };
  });

  const priorityMix = PRIORITY_ORDER.map((priority) => ({
    priority,
    value: activeTasks.filter((task) => task.priority === priority).length,
  })).filter((item) => item.value > 0);

  const statusMix = STATUS_ORDER.map((status) => ({
    status,
    value: activeTasks.filter((task) => task.status === status).length,
  })).filter((item) => item.value > 0);

  const totalWithRecentCompletions = stats.totalOpen + stats.completedThisWeek;
  const activeWithDueDate = activeTasks.filter((task) => parseDate(task.dueDate)).length;

  return {
    stats,
    activeTasks,
    activeSampleLimit: dashboard?.activeSampleLimit ?? activeTasks.length,
    hasMoreActiveSample: dashboard?.hasMoreActiveSample ?? false,
    totalVisibleActive: activeTasks.length,
    weeklyCloseRate: percent(stats.completedThisWeek, totalWithRecentCompletions),
    overdueRate: percent(stats.overdueCount, stats.totalOpen),
    dueDateCoverage: percent(activeWithDueDate, activeTasks.length),
    workload: [
      { key: 'active', value: stats.totalOpen || activeTasks.length },
      { key: 'overdue', value: overdue.length },
      { key: 'today', value: dueToday.length },
      { key: 'upcoming', value: upcoming.length },
      { key: 'completed', value: recentlyCompleted.length },
    ],
    priorityMix,
    dueTrend,
    statusMix,
    riskQueue: sortRiskTasks(activeTasks).slice(0, RISK_QUEUE_LIMIT),
  };
}
