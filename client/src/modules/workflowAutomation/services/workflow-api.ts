import api from '@/lib/api/client';
import type {
  CampaignInput, CampaignSelection, EventFilters, ListFilters, Paged, RunAction, RunFilters, TestRunOptions, TestRunResult,
  ValidationResult, Workflow, WorkflowAnalytics, WorkflowCheckReport, WorkflowCampaign, WorkflowCatalog, WorkflowEventItem, WorkflowGraph,
  WorkflowListItem, WorkflowRun, WorkflowRunDetail, WorkflowSettings, WorkflowTemplate, WorkflowVersion, WorkflowVersionSummary,
} from '../types/workflow-types';

const root = '/workflows';
type Envelope<T> = { data: T; pagination?: Paged<unknown>['pagination'] };
const unwrap = <T,>(res: unknown): T => (res as Envelope<T>).data;
const paged = <T,>(res: unknown): Paged<T> => {
  const r = res as Envelope<T[]>;
  return { data: r.data || [], pagination: r.pagination || { page: 1, limit: r.data?.length || 0, total: r.data?.length || 0, pages: 1 } };
};
const clean = <T extends object>(params: T) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== null));

export const workflowApi = {
  catalog: async () => unwrap<WorkflowCatalog>(await api.get(`${root}/catalog`)),
  templates: async () => unwrap<WorkflowTemplate[]>(await api.get(`${root}/templates`)),
  list: async (filters: ListFilters = {}) => paged<WorkflowListItem>(await api.get(root, { params: clean(filters) })),
  get: async (id: string) => unwrap<Workflow>(await api.get(`${root}/${id}`)),
  create: async (input: { name: string; description?: string; templateKey?: string; fromWorkflowId?: string; graph?: WorkflowGraph; settings?: Partial<WorkflowSettings> }) =>
    unwrap<Workflow>(await api.post(root, input)),
  update: async (id: string, input: { name?: string; description?: string; graph?: WorkflowGraph; baseRevision?: number; settings?: Partial<WorkflowSettings>; isTemplate?: boolean }) =>
    unwrap<Workflow>(await api.patch(`${root}/${id}`, input)),
  remove: async (id: string) => unwrap<{ deleted?: boolean; archived?: boolean }>(await api.delete(`${root}/${id}`)),
  validate: async (id: string, graph?: WorkflowGraph) => unwrap<ValidationResult>(await api.post(`${root}/${id}/validate`, graph ? { graph } : {})),
  analyze: async (id: string, input: { graph?: WorkflowGraph; leadId?: string | null }) => unwrap<WorkflowCheckReport>(await api.post(`${root}/${id}/analyze`, input)),
  test: async (id: string, input: { leadId: string; graph?: WorkflowGraph; options?: TestRunOptions }) => unwrap<TestRunResult>(await api.post(`${root}/${id}/test`, input)),
  publish: async (id: string, notes = '') => unwrap<Workflow>(await api.post(`${root}/${id}/publish`, { notes })),
  setStatus: async (id: string, status: 'published' | 'paused' | 'archived') => unwrap<Workflow>(await api.post(`${root}/${id}/status`, { status })),
  duplicate: async (id: string) => unwrap<Workflow>(await api.post(`${root}/${id}/duplicate`)),
  versions: async (id: string) => unwrap<WorkflowVersionSummary[]>(await api.get(`${root}/${id}/versions`)),
  version: async (id: string, version: number) => unwrap<WorkflowVersion>(await api.get(`${root}/${id}/versions/${version}`)),
  rollback: async (id: string, version: number) => unwrap<Workflow>(await api.post(`${root}/${id}/versions/${version}/rollback`)),

  campaigns: async (filters: { workflowId?: string; status?: string; page?: number; limit?: number } = {}) => paged<WorkflowCampaign>(await api.get(`${root}/campaigns`, { params: clean(filters) })),
  campaign: async (id: string) => unwrap<WorkflowCampaign>(await api.get(`${root}/campaigns/${id}`)),
  createCampaign: async (input: CampaignInput) => unwrap<WorkflowCampaign>(await api.post(`${root}/campaigns`, input)),
  previewCampaign: async (selection: CampaignSelection) => unwrap<{ count: number; capped: boolean }>(await api.post(`${root}/campaigns/preview`, { selection })),
  campaignAction: async (id: string, action: 'start' | 'pause' | 'resume' | 'stop') => unwrap<WorkflowCampaign>(await api.post(`${root}/campaigns/${id}/${action}`)),

  runs: async (filters: RunFilters = {}) => paged<WorkflowRun>(await api.get(`${root}/runs`, { params: clean(filters) })),
  run: async (id: string) => unwrap<WorkflowRunDetail>(await api.get(`${root}/runs/${id}`)),
  runAction: async (id: string, action: RunAction, port?: string | null) => unwrap<WorkflowRunDetail>(await api.post(`${root}/runs/${id}/${action}`, port ? { port } : {})),
  events: async (filters: EventFilters = {}) => paged<WorkflowEventItem>(await api.get(`${root}/events`, { params: clean(filters) })),
  analytics: async (params: { days?: number; workflowId?: string } = {}) => unwrap<WorkflowAnalytics>(await api.get(`${root}/analytics`, { params: clean(params) })),
  leadHistory: async (leadId: string) => unwrap<{ runs: WorkflowRun[]; events: WorkflowEventItem[] }>(await api.get(`${root}/leads/${leadId}/history`)),
};
