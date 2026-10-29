import api from '@/lib/api/client';
import type {
  BenchmarkCase, BenchmarkCaseInput, BenchmarkRun, BenchmarkSuite, Experiment, ExperimentInput, FlaggedPage, QualityFilters, QualityFlag,
  QualitySummary, RunComparison, ScriptAgentConfig, ScriptState, ScriptVersion,
} from '../types/calling-quality-types';

const root = '/ai-calling';
const unwrap = <T,>(res: unknown): T => (res as { data: T }).data;
const clean = <T extends object>(params: T) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null));

export const callingQualityApi = {
  async summary(filters: QualityFilters = {}) { return unwrap<QualitySummary>(await api.get(`${root}/quality/summary`, { params: clean(filters) })); },
  async flagged(filters: QualityFilters & { reason?: QualityFlag; page?: number; limit?: number } = {}) { return unwrap<FlaggedPage>(await api.get(`${root}/quality/flagged`, { params: clean(filters) })); },

  async suites() { return unwrap<BenchmarkSuite[]>(await api.get(`${root}/benchmarks/suites`)); },
  async suite(id: string) { return unwrap<BenchmarkSuite>(await api.get(`${root}/benchmarks/suites/${id}`)); },
  async createSuite(input: { name: string; description?: string; questionnaire?: BenchmarkSuite['questionnaire'] }) { return unwrap<BenchmarkSuite>(await api.post(`${root}/benchmarks/suites`, input)); },
  async seedSample() { return unwrap<BenchmarkSuite & { existing?: boolean }>(await api.post(`${root}/benchmarks/suites/sample`)); },
  async createCase(suiteId: string, input: BenchmarkCaseInput) { return unwrap<BenchmarkCase>(await api.post(`${root}/benchmarks/suites/${suiteId}/cases`, input)); },
  async updateCase(caseId: string, input: BenchmarkCaseInput) { return unwrap<BenchmarkCase>(await api.patch(`${root}/benchmarks/cases/${caseId}`, input)); },
  async removeCase(caseId: string) { return unwrap<{ deleted: boolean }>(await api.delete(`${root}/benchmarks/cases/${caseId}`)); },
  async reviewCase(caseId: string, body: { approved: boolean; revision: number; note?: string }) { return unwrap<BenchmarkCase>(await api.post(`${root}/benchmarks/cases/${caseId}/review`, body)); },
  async runs(suiteId: string) { return unwrap<BenchmarkRun[]>(await api.get(`${root}/benchmarks/suites/${suiteId}/runs`)); },
  async run(runId: string) { return unwrap<BenchmarkRun>(await api.get(`${root}/benchmarks/runs/${runId}`)); },
  async startRun(suiteId: string, body: { label?: string; scriptVersionId?: string | null; knowledgeVersionId?: string | null; includeExtractor?: boolean; includeAudio?: boolean }) {
    return unwrap<BenchmarkRun>(await api.post(`${root}/benchmarks/suites/${suiteId}/runs`, clean(body)));
  },
  async compare(a: string, b: string) { return unwrap<RunComparison>(await api.get(`${root}/benchmarks/runs/compare`, { params: { a, b } })); },
  async uploadAudio(file: File) {
    const body = new FormData(); body.append('audio', file);
    return unwrap<{ fileId: string; mimeType: string; size: number }>(await api.post(`${root}/benchmarks/audio`, body, { headers: { 'Content-Type': 'multipart/form-data' } }));
  },

  async versions(agentId: string) { return unwrap<ScriptVersion[]>(await api.get(`${root}/script-versions`, { params: { agentId } })); },
  async scriptState(agentId: string) { return unwrap<ScriptState>(await api.get(`${root}/script-versions/agents/${agentId}/state`)); },
  async snapshot(agentId: string, label = '') { return unwrap<ScriptVersion>(await api.post(`${root}/script-versions`, { agentId, label })); },
  async createVariant(agentId: string, basedOnVersionId: string, agentConfig: ScriptAgentConfig, label = '') {
    return unwrap<ScriptVersion>(await api.post(`${root}/script-versions`, { agentId, source: 'variant', basedOnVersionId, agentConfig, label }));
  },
  async rollback(agentId: string, reason = '') { return unwrap<{ restoredVersionId: string; experimentsPaused: number; campaignsUpdated: number }>(await api.post(`${root}/script-versions/agents/${agentId}/rollback`, { reason })); },
  async experiments(agentId: string) { return unwrap<Experiment[]>(await api.get(`${root}/experiments`, { params: { agentId } })); },
  async experiment(id: string) { return unwrap<Experiment>(await api.get(`${root}/experiments/${id}`)); },
  async createExperiment(input: ExperimentInput) { return unwrap<Experiment>(await api.post(`${root}/experiments`, input)); },
  async startExperiment(id: string) { return unwrap<Experiment>(await api.post(`${root}/experiments/${id}/start`, {})); },
  async pauseExperiment(id: string) { return unwrap<Experiment>(await api.post(`${root}/experiments/${id}/pause`, {})); },
  async promote(id: string, arm: string, reason = '') { return unwrap<{ experiment: Experiment; campaignsUpdated: number }>(await api.post(`${root}/experiments/${id}/promote`, { arm, reason })); },
};
