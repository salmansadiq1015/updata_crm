/** Workflow Automation — client types mirroring server/src/modules/workflowAutomation. */

export type NodeCategory = 'trigger' | 'ai' | 'communication' | 'crm' | 'logic' | 'timing' | 'integration' | 'end';
export type WorkflowStatus = 'draft' | 'published' | 'paused' | 'archived';
export type RunStatus = 'pending' | 'queued' | 'running' | 'waiting' | 'paused' | 'completed' | 'failed' | 'cancelled' | 'skipped';
export type CampaignStatus = 'draft' | 'running' | 'paused' | 'stopped' | 'completed';
export type EndOutcome = 'qualified' | 'not_qualified' | 'interested' | 'not_interested' | 'converted' | 'unreachable' | 'callback_scheduled' | 'follow_up_required' | 'opted_out' | 'completed' | 'failed' | 'stopped';

export type NodeConfig = Record<string, unknown>;

export interface WorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: { label?: string; config: NodeConfig };
}
export interface WorkflowEdge { id: string; source: string; target: string; sourceHandle: string }
export interface WorkflowGraph { nodes: WorkflowNode[]; edges: WorkflowEdge[] }

export interface ValidationIssue { nodeId?: string | null; edgeId?: string | null; field?: string; code: string; ports?: string[]; severity?: 'info' }
export interface ValidationResult { valid: boolean; errors: ValidationIssue[]; warnings: ValidationIssue[] }

export interface PersonRef { _id: string; firstName?: string; lastName?: string }

export interface WorkflowStats {
  total: number; active: number; completed: number; failed: number; successRate: number | null; lastRunAt: string | null;
  [status: string]: number | string | null;
}

export interface WorkflowSettings { reentry: 'never' | 'after_completion' | 'always'; stopOnOptOut: boolean }

export interface WorkflowVersionSummary {
  _id: string; workflowId: string; version: number; triggerType: string; notes: string; publishedAt: string;
  publishedBy?: PersonRef | null; rolledBackFrom?: number | null; checksum?: string;
}
export interface WorkflowVersion extends WorkflowVersionSummary { graph: WorkflowGraph }

export interface Workflow {
  _id: string;
  name: string;
  description: string;
  status: WorkflowStatus;
  draft: WorkflowGraph;
  draftRevision: number;
  draftUpdatedAt: string;
  publishedVersionId: string | null;
  publishedVersion: number | null;
  latestVersion: number;
  publishedAt: string | null;
  triggerType: string | null;
  triggerConfig: NodeConfig | null;
  settings: WorkflowSettings;
  templateKey: string | null;
  isTemplate: boolean;
  createdBy?: PersonRef | null;
  updatedBy?: PersonRef | null;
  createdAt: string;
  updatedAt: string;
  stats: WorkflowStats;
  versions?: WorkflowVersionSummary[];
}
export type WorkflowListItem = Omit<Workflow, 'draft'>;

export interface NodeCatalogEntry {
  type: string; category: NodeCategory; outputs: string[]; sideEffect?: boolean; waits?: boolean; channel?: string; event?: string | null;
  defaults: NodeConfig;
}
export interface TemplateMeta { key: string; category: string; icon: string; nodes: number }
export interface WorkflowCatalog {
  nodes: NodeCatalogEntry[];
  waitableEvents: string[];
  operators: string[];
  conditionFields: string[];
  qualificationKeys: string[];
  endOutcomes: EndOutcome[];
  leadStatuses: string[];
  callOutcomeFilters: string[];
  limits: Record<string, number>;
  templates: TemplateMeta[];
}
export interface WorkflowTemplate extends TemplateMeta { graph: WorkflowGraph }

export interface Pagination { page: number; limit: number; total: number; pages: number }
export interface Paged<T> { data: T[]; pagination: Pagination }

export interface ListFilters {
  search?: string; status?: WorkflowStatus | ''; sortBy?: 'updatedAt' | 'createdAt' | 'name' | 'publishedAt'; sortOrder?: 'asc' | 'desc';
  page?: number; limit?: number; templates?: boolean;
}

export interface RunStep {
  _id: string; nodeId: string; type: string; label: string; visit: number; attempt: number;
  status: 'running' | 'waiting' | 'completed' | 'failed' | 'skipped';
  port: string | null; actionKey: string; startedAt: string; endedAt: string | null;
  output?: Record<string, unknown> | null; error?: { code?: string; message?: string } | null; manual?: string | null;
}
export interface RunWait {
  kind: 'timer' | 'event' | 'ai_call' | 'analysis' | 'callback' | 'retry' | null;
  nodeId: string | null; until: string | null; events?: string[]; startedAt: string | null; data?: Record<string, unknown> | null;
}
export interface LeadRef { _id: string; name?: string; leadNumber?: string; status?: string; phone?: string; mobile?: string; email?: string }

export interface WorkflowRun {
  _id: string;
  workflowId: { _id: string; name: string; status?: WorkflowStatus } | string;
  versionId: string;
  version: number;
  leadId: LeadRef | string;
  campaignId: string | null;
  status: RunStatus;
  trigger: { type: string | null; eventId: string | null; data: Record<string, unknown> | null };
  currentNodeId: string | null;
  wait: RunWait;
  nextRunAt: string | null;
  stepCount: number;
  outcome: EndOutcome | null;
  error: { code: string | null; message: string | null; nodeId: string | null };
  startedAt: string | null;
  completedAt: string | null;
  pausedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // list view
  stepTotal?: number;
  currentStep?: RunStep | null;
  // detail view
  steps?: RunStep[];
  context?: Record<string, unknown>;
  visits?: Record<string, number>;
  version_?: never;
}
export interface WorkflowEventItem {
  _id: string; type: string; at: string; nodeId: string | null; data: Record<string, unknown> | null;
  workflowId?: { _id: string; name: string } | string | null; runId?: string | null; leadId?: LeadRef | string | null;
  actor?: PersonRef | null;
}
export interface RunLink { _id: string; url: string; clicks: number; humanClicks: number; scannerHits: number; firstClickAt: string | null; nodeId: string }
export interface WorkflowRunDetail extends Omit<WorkflowRun, 'version'> {
  version: { _id: string; version: number; graph: WorkflowGraph; publishedAt: string } | null;
  events: WorkflowEventItem[];
  links: RunLink[];
  steps: RunStep[];
}
export type RunAction = 'pause' | 'resume' | 'stop' | 'retry' | 'skip';

export interface RunFilters { workflowId?: string; campaignId?: string; leadId?: string; status?: RunStatus | 'active' | ''; page?: number; limit?: number }
export interface EventFilters { workflowId?: string; leadId?: string; runId?: string; type?: string; from?: string; to?: string; page?: number; limit?: number }

export interface CampaignSelection {
  mode: 'explicit' | 'filters';
  leadIds?: string[];
  filters?: { statuses: string[]; tags: string[]; sources: string[] };
}
export interface CampaignProgress { total: number; byStatus: Partial<Record<RunStatus, number>>; byOutcome: Partial<Record<EndOutcome, number>> }
export interface WorkflowCampaign {
  _id: string; name: string; description: string;
  workflowId: { _id: string; name: string; status: WorkflowStatus; publishedVersion: number | null } | string;
  version: number | null; status: CampaignStatus;
  selection: CampaignSelection;
  counts: { selected: number; enrolled: number; skipped: number };
  skipped?: Array<{ leadId: string; reason: string }>;
  startedAt: string | null; pausedAt: string | null; stoppedAt: string | null; completedAt: string | null;
  createdBy?: PersonRef | null; createdAt: string;
  progress: CampaignProgress;
}
export interface CampaignInput { name: string; description?: string; workflowId: string; selection: CampaignSelection }

export interface TestRunStep { nodeId: string; type: string; label?: string; status: string; port?: string | null; output?: Record<string, unknown> | null; error?: { code?: string; message?: string } | null }
export interface TestRunResult { valid: boolean; validation: ValidationResult; steps: TestRunStep[]; outcome: string | null; lead: { _id: string; name: string; status: string } }
export interface TestRunOptions {
  callOutcome?: 'answered' | 'unanswered' | 'failed' | 'blocked';
  analysis?: 'qualified' | 'not_qualified' | 'callback' | 'unknown';
  messageOutcome?: 'sent' | 'blocked' | 'failed';
  eventOutcome?: 'matched' | 'timeout';
  startNodeId?: string;
  singleStep?: boolean;
}

export interface WorkflowAnalytics {
  range: { days: number; since: string };
  workflows: { total: number; published: number; draft: number; paused: number };
  executions: { total: number; completed: number; failed: number; running: number; waiting: number; paused: number; cancelled: number; skipped: number; successRate: number | null };
  contacts: number;
  calls: { initiated: number; answered: number; unanswered: number; answerRate: number | null };
  messages: { sent: number; delivered: number; blocked: number };
  links: { issued: number; clicked: number; humanClicks: number; scannerHits: number };
  outcomes: Partial<Record<EndOutcome, number>>;
  qualified: number;
  conversionRate: number | null;
  timeline: Array<{ date: string; started: number; completed: number; failed: number }>;
  topWorkflows: Array<{ workflowId: string; name: string; status: WorkflowStatus | null; runs: number; completed: number; failed: number; successRate: number | null }>;
  recentFailures: Array<{ _id: string; workflowId?: { _id: string; name: string } | null; leadId?: LeadRef | null; error: { code: string | null; message: string | null }; completedAt: string }>;
}
