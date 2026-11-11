import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import type { CreateSimCallCampaignInput, SimCallCampaign, SimCallEvent, SimCallStats, SimCallTask } from '../types/sim-call-types';

// apiClient's response interceptor unwraps the envelope to { data, pagination }.
const unwrap = <T,>(res: unknown): T => ((res as { data?: T }).data ?? res) as T;
export interface Paged<T> { data: T[]; pagination: { page: number; limit: number; total: number; pages: number } }
function paged<T>(res: unknown): Paged<T> {
  const r = res as { data?: T[]; pagination?: Paged<T>['pagination'] };
  return { data: r.data ?? [], pagination: r.pagination ?? { page: 1, limit: 25, total: 0, pages: 0 } };
}
const E = ENDPOINTS.SIM_CALLS;

export const simCallsApi = {
  async stats() {
    return unwrap<SimCallStats>(await apiClient.get(E.CAMPAIGN_STATS));
  },
  async list(params: { page?: number; limit?: number; status?: string; q?: string } = {}) {
    return paged<SimCallCampaign>(await apiClient.get(E.CAMPAIGNS, { params }));
  },
  async get(id: string) {
    return unwrap<SimCallCampaign>(await apiClient.get(E.CAMPAIGN(id)));
  },
  async create(input: CreateSimCallCampaignInput) {
    return unwrap<SimCallCampaign>(await apiClient.post(E.CAMPAIGNS, input));
  },
  async update(id: string, input: Partial<CreateSimCallCampaignInput>) {
    return unwrap<SimCallCampaign>(await apiClient.patch(E.CAMPAIGN(id), input));
  },
  async action(id: string, action: 'start' | 'resume' | 'pause' | 'cancel') {
    return unwrap<SimCallCampaign>(await apiClient.post(E.ACTION(id, action)));
  },
  async retry(id: string, taskIds: string[] = []) {
    return unwrap<{ retried: number; campaign: SimCallCampaign }>(await apiClient.post(E.ACTION(id, 'retry'), { taskIds }));
  },
  async tasks(id: string, params: { page?: number; limit?: number; state?: string; outcome?: string; q?: string } = {}) {
    return paged<SimCallTask>(await apiClient.get(E.TASKS(id), { params }));
  },
  async events(id: string, params: { page?: number; limit?: number } = {}) {
    return paged<SimCallEvent>(await apiClient.get(E.EVENTS(id), { params }));
  },
  async retrySync(taskId: string) {
    return unwrap<SimCallTask>(await apiClient.post(E.TASK_SYNC(taskId)));
  },
  async reschedule(taskId: string, body: { at: string; timezone: string; reason?: string }) {
    return unwrap<SimCallTask>(await apiClient.patch(E.CALLBACK(taskId), body));
  },
  async cancelCallback(taskId: string) {
    return unwrap<SimCallTask>(await apiClient.delete(E.CALLBACK(taskId)));
  },
  async callbacks(params: { status?: 'pending' | 'overdue' | 'done' | 'cancelled'; page?: number; limit?: number } = {}) {
    return paged<SimCallTask>(await apiClient.get(E.CALLBACKS, { params }));
  },
};
