import { z } from 'zod';

import { api } from '@/services/api/apiClient';
import { ENDPOINTS } from '@/services/api/endpoints';

// GET /dashboard/stats (server/src/modules/dashboard/dashboard.service.js getLegacyStats).
const count = z.number().int().nonnegative().catch(0);

export const dashboardStatsSchema = z.object({
  customers: count,
  projects: count,
  openQuotes: count,
  todayTasks: count,
});

export type DashboardStats = z.infer<typeof dashboardStatsSchema>;

export const dashboardApi = {
  async stats(signal?: AbortSignal): Promise<DashboardStats> {
    const { data } = await api.get(ENDPOINTS.dashboard.stats, dashboardStatsSchema, { signal });
    return data;
  },
};
