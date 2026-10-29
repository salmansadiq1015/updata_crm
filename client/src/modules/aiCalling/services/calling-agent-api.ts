import api from '@/lib/api/client';
import type { AgentCallAnalytics, AgentFilters, AgentImage, AgentLaunchInput, CallingAgent, CallingAgentInput, Campaign } from '../types/ai-calling-types';
import type { Paged } from './ai-calling-api';

const root = '/ai-calling';
const unwrap = <T,>(res: unknown): T => (res as { data: T }).data;
export interface AgentPage {
  data: CallingAgent[]; pagination: Paged<CallingAgent>['pagination'];
  summary: { agents: number; activeCampaigns: number; inProgress: number; completed: number; eligible: number };
}
export const callingAgentApi = {
  async list(params: AgentFilters = {}): Promise<AgentPage> {
    const res = await api.get(`${root}/agents`, { params }) as unknown as { data: { agents: CallingAgent[]; summary: AgentPage['summary'] }; pagination: AgentPage['pagination'] };
    if (!Array.isArray(res.data?.agents)) throw new Error('The calling agent response could not be read. Refresh and try again.');
    return { data: res.data.agents, summary: res.data.summary, pagination: res.pagination ?? { page: 1, limit: 24, total: res.data.agents.length, pages: res.data.agents.length ? 1 : 0 } };
  },
  async get(id: string) { return unwrap<CallingAgent>(await api.get(`${root}/agents/${id}`)); },
  async create(input: CallingAgentInput) { return unwrap<CallingAgent>(await api.post(`${root}/agents`, input)); },
  async update(id: string, input: Partial<CallingAgentInput> & { version: number }) { return unwrap<CallingAgent>(await api.patch(`${root}/agents/${id}`, input)); },
  async assign(id: string, leadIds: string[], version: number, mode?: 'replace' | 'add') { return unwrap<CallingAgent>(await api.put(`${root}/agents/${id}/leads`, { leadIds, version, ...(mode ? { mode } : {}) })); },
  async duplicate(id: string) { return unwrap<CallingAgent>(await api.post(`${root}/agents/${id}/duplicate`)); },
  async remove(id: string) { return unwrap<{ deleted: boolean }>(await api.delete(`${root}/agents/${id}`)); },
  async launch(id: string, input: AgentLaunchInput) { return unwrap<Campaign>(await api.post(`${root}/agents/${id}/launch`, input)); },
  async callAnalytics(id: string, params: { from?: string; to?: string } = {}) { return unwrap<AgentCallAnalytics>(await api.get(`${root}/agents/${id}/call-analytics`, { params })); },
  async callAnalyticsCsv(id: string, params: { from?: string; to?: string } = {}): Promise<Blob> {
    const res = await api.get(`${root}/agents/${id}/call-analytics/export`, { params, responseType: 'blob' }) as { _raw?: { data?: Blob }; data?: Blob };
    return (res?._raw?.data ?? res?.data) as Blob;
  },
  async presets() { return unwrap<AgentImage[]>(await api.get(`${root}/agent-avatar-presets`)); },
  async images(page = 1) {
    const res = await api.get(`${root}/agent-images`, { params: { page } }) as unknown as Paged<AgentImage>;
    return { data: res.data ?? [], pagination: res.pagination ?? { page, limit: 48, total: res.data?.length || 0, pages: res.data?.length ? 1 : 0 } };
  },
  async uploadImage(file: File, onProgress: (progress: number) => void) {
    const body = new FormData(); body.append('image', file);
    return unwrap<AgentImage>(await api.post(`${root}/agent-images`, body, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e: { loaded: number; total?: number }) => onProgress(e.total ? Math.round(e.loaded / e.total * 100) : 0),
    }));
  },
  async removeImage(id: string) { return api.delete(`${root}/agent-images/${id}`); },
};
