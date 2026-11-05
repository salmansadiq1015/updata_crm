import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchTaskDashboardOverview } from '../hooks/use-task-dashboard-overview';
import { taskApi } from '../services/task-api';

vi.mock('../services/task-api', () => ({ taskApi: { dashboard: vi.fn(), dashboardStats: vi.fn(), list: vi.fn() } }));
vi.mock('@/stores/auth-store', () => ({ useAuthStore: vi.fn() }));

const dashboard = { overdue: [], dueToday: [], upcoming: [], recentlyCompleted: [] };
const stats = { totalOpen: 12, completedThisWeek: 3, overdueCount: 2, totalTasks: 30 };
const page = { data: [], pagination: { hasNext: false, nextCursor: null, limit: 40 } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(taskApi.dashboard).mockResolvedValue(dashboard);
  vi.mocked(taskApi.dashboardStats).mockResolvedValue(stats);
  vi.mocked(taskApi.list).mockResolvedValue(page);
});

describe('dashboard request isolation', () => {
  it('keeps personal totals and lanes available when an optional sample fails', async () => {
    vi.mocked(taskApi.list).mockRejectedValueOnce(new Error('Sample unavailable'));
    const result = await fetchTaskDashboardOverview(7, 'current-user');
    expect(result.stats).toEqual(stats);
    expect(result.overdue).toEqual([]);
    expect(result.sampleUnavailable).toBe(true);
    expect(taskApi.list).toHaveBeenCalledTimes(3);
    for (const [params] of vi.mocked(taskApi.list).mock.calls) expect(params.assigneeId).toBe('current-user');
  });

  it('reports complete sampling and pagination accurately', async () => {
    vi.mocked(taskApi.list).mockResolvedValueOnce({ ...page, pagination: { ...page.pagination, hasNext: true } });
    const result = await fetchTaskDashboardOverview(14, 'current-user');
    expect(taskApi.dashboard).toHaveBeenCalledWith({ upcomingDays: 14 });
    expect(result.sampleUnavailable).toBe(false);
    expect(result.hasMoreActiveSample).toBe(true);
  });

  it('surfaces a failed authoritative request instead of fabricating zero totals', async () => {
    vi.mocked(taskApi.dashboardStats).mockRejectedValueOnce(new Error('Stats unavailable'));
    await expect(fetchTaskDashboardOverview(7, 'current-user')).rejects.toThrow('Stats unavailable');
  });
});
