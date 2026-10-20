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

const leadPipelineSchema = z.object({
  total: count,
  new: count,
  contacted: count,
  qualified: count,
  unqualified: count,
  converted: count,
});

export const mobileCrmStatsSchema = z.object({
  leads: leadPipelineSchema,
  qualificationRate: z.number().min(0).max(1).nullable(),
  conversionRate: z.number().min(0).max(1).nullable(),
  activeCampaigns: count,
  callsCompletedToday: count,
  updatedAt: z.string(),
});

export type MobileCrmStats = z.infer<typeof mobileCrmStatsSchema>;

export const dashboardApi = {
  async stats(signal?: AbortSignal): Promise<DashboardStats> {
    const { data } = await api.get(ENDPOINTS.dashboard.stats, dashboardStatsSchema, { signal });
    return data;
  },
  async mobileCrm(signal?: AbortSignal): Promise<MobileCrmStats> {
    const { data } = await api.get(ENDPOINTS.dashboard.mobileCrm, mobileCrmStatsSchema, { signal });
    return data;
  },
};
