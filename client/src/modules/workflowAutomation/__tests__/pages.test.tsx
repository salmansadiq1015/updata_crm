// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';

/**
 * Workflow Automation screens: list rows / empty state, execution inspector (timeline, allowed
 * manual controls, audited run action), analytics KPIs. Data hooks are mocked; the components,
 * permissions logic and formatting are real.
 */
const runAction = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
const state = vi.hoisted(() => ({
  workflows: { data: undefined as unknown, isLoading: false, isError: false, refetch: vi.fn() },
  run: { data: undefined as unknown, isError: false, refetch: vi.fn() },
  analytics: { data: undefined as unknown, isError: false, refetch: vi.fn() },
  permissions: new Set<string>(['workflow:read', 'workflow:write', 'workflow:publish', 'workflow:execute']),
}));

vi.mock('@/lib/i18n/language-context', () => {
  const t = (key: string, fallback?: string | null, vars?: Record<string, unknown>) => {
    const text = fallback || key;
    return vars ? text.replace(/\{(\w+)\}/g, (_, name) => (vars[name] != null ? String(vars[name]) : `{${name}}`)) : text;
  };
  const value = { locale: 'en', language: 'en', dir: 'ltr', isRTL: false, t };
  return { useLanguage: () => value, useOptionalLanguage: () => value, LanguageProvider: ({ children }: { children: ReactNode }) => children };
});
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: { href: string; children: ReactNode }) => <a href={href} {...props}>{children}</a> }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/automation', useSearchParams: () => new URLSearchParams() }));
vi.mock('@/shared/hooks/use-permissions', () => ({
  usePermissions: () => ({ hasPermission: (p: string) => state.permissions.has(p), hasAnyPermission: () => true, hasAllPermissions: () => true, isAdmin: false, permissions: [] }),
}));
vi.mock('../ui/shared/workflow-diagram', () => ({ WorkflowDiagram: () => <div data-testid="diagram" /> }));
vi.mock('../hooks/use-workflows', () => ({
  useWorkflows: () => state.workflows,
  useWorkflowRun: () => state.run,
  useWorkflowAnalytics: () => state.analytics,
  useWorkflowCatalog: () => ({ data: { nodes: [{ type: 'ai.call', category: 'ai', outputs: ['answered', 'unanswered', 'failed', 'blocked'], defaults: {} }] } }),
  useRunAction: () => runAction,
  useWorkflowMutations: () => ({ duplicate: { mutate: vi.fn(), isPending: false }, setStatus: { mutate: vi.fn(), isPending: false } }),
}));

const { WorkflowsListPage } = await import('../ui/pages/workflows-list-page');
const { ExecutionInspectorPage, allowedActions } = await import('../ui/pages/execution-inspector-page');
const { AnalyticsPage } = await import('../ui/pages/analytics-page');

const stats = { total: 12, active: 2, completed: 9, failed: 1, successRate: 90, lastRunAt: null };
const workflowRow = (over: Record<string, unknown> = {}) => ({
  _id: 'wf1', name: 'Qualify new leads', description: '', status: 'published', publishedVersion: 3, latestVersion: 3, triggerType: 'trigger.lead_created',
  updatedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedBy: { _id: 'u1', firstName: 'Anna', lastName: 'Keller' }, stats, ...over,
});

beforeEach(() => {
  runAction.mutate.mockClear();
  state.permissions = new Set(['workflow:read', 'workflow:write', 'workflow:publish', 'workflow:execute']);
});

describe('workflows list', () => {
  it('renders rows with status, version, trigger, executions and success rate', () => {
    state.workflows = { ...state.workflows, data: { data: [workflowRow(), workflowRow({ _id: 'wf2', name: 'Recovery', status: 'draft', publishedVersion: null, stats: { ...stats, total: 0, active: 0, successRate: null } })], pagination: { page: 1, limit: 20, total: 2, pages: 1 } } };
    render(<WorkflowsListPage />);
    const rows = screen.getAllByTestId('workflow-row');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('Qualify new leads')).toBeTruthy();
    expect(within(rows[0]).getByText('published')).toBeTruthy(); // shared badge falls back to the status key in the t() mock
    expect(within(rows[0]).getAllByText('v3').length).toBeGreaterThan(0);
    expect(within(rows[0]).getByText('trigger.lead_created')).toBeTruthy(); // node label key falls back in the mock
    expect(within(rows[0]).getByText('90 %')).toBeTruthy();
    expect(within(rows[1]).getByText('Not published yet')).toBeTruthy();
  });

  it('shows the empty state with a create action', () => {
    state.workflows = { ...state.workflows, data: { data: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } } };
    render(<WorkflowsListPage />);
    expect(screen.getByText('No workflows yet')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Create workflow' }).length).toBeGreaterThan(0);
  });

  it('hides create for users without workflow:write', () => {
    state.permissions = new Set(['workflow:read']);
    state.workflows = { ...state.workflows, data: { data: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } } };
    render(<WorkflowsListPage />);
    expect(screen.queryByRole('link', { name: 'Create workflow' })).toBeNull();
  });
});

const failedRun = () => ({
  _id: 'run1', status: 'failed', outcome: 'failed', currentNodeId: 'call', version: { _id: 'v1', version: 2, publishedAt: '2026-11-10T08:00:00Z', graph: {
    nodes: [{ id: 't', type: 'trigger.manual', position: { x: 0, y: 0 }, data: { label: '', config: {} } }, { id: 'call', type: 'ai.call', position: { x: 0, y: 150 }, data: { label: 'Qualification call', config: {} } }],
    edges: [{ id: 'e1', source: 't', target: 'call', sourceHandle: 'out' }],
  } },
  workflowId: { _id: 'wf1', name: 'Qualify new leads' }, leadId: { _id: 'l1', name: 'Müller AG', leadNumber: 'L-00042' },
  trigger: { type: 'campaign', eventId: null, data: null }, wait: { kind: null, nodeId: null, until: null, startedAt: null },
  error: { code: 'agent_unavailable', message: 'The selected AI agent no longer exists', nodeId: 'call' },
  steps: [
    { _id: 's1', nodeId: 't', type: 'trigger.manual', label: '', visit: 1, attempt: 1, status: 'completed', port: 'out', actionKey: 'k1', startedAt: '2026-11-10T09:00:00Z', endedAt: '2026-11-10T09:00:00Z' },
    { _id: 's2', nodeId: 'call', type: 'ai.call', label: 'Qualification call', visit: 1, attempt: 1, status: 'failed', port: null, actionKey: 'k2', startedAt: '2026-11-10T09:00:01Z', endedAt: '2026-11-10T09:00:02Z', error: { code: 'agent_unavailable', message: 'The selected AI agent no longer exists' } },
  ],
  events: [
    { _id: 'e1', type: 'run.enrolled', at: '2026-11-10T09:00:00Z', nodeId: null, data: null },
    { _id: 'e2', type: 'node.failed', at: '2026-11-10T09:00:02Z', nodeId: 'call', data: { code: 'agent_unavailable', message: 'The selected AI agent no longer exists' } },
    { _id: 'e3', type: 'run.failed', at: '2026-11-10T09:00:03Z', nodeId: null, data: null },
  ],
  links: [], context: {}, createdAt: '2026-11-10T09:00:00Z', updatedAt: '2026-11-10T09:00:03Z', startedAt: '2026-11-10T09:00:00Z',
});

describe('execution inspector', () => {
  it('derives the allowed manual controls from the run state', () => {
    expect(allowedActions({ status: 'failed', wait: { kind: null } } as never)).toEqual(['retry', 'skip']);
    expect(allowedActions({ status: 'waiting', wait: { kind: 'timer' } } as never)).toEqual(['pause', 'skip', 'stop']);
    expect(allowedActions({ status: 'waiting', wait: { kind: 'retry' } } as never)).toEqual(['pause', 'retry', 'skip', 'stop']);
    expect(allowedActions({ status: 'paused', wait: { kind: null } } as never)).toEqual(['resume', 'skip', 'stop']);
    expect(allowedActions({ status: 'completed', wait: { kind: null } } as never)).toEqual([]);
  });

  it('renders the failure, the chronological timeline and the step detail', () => {
    state.run = { ...state.run, data: failedRun() };
    render(<ExecutionInspectorPage id="run1" />);
    expect(screen.getByText('Müller AG')).toBeTruthy();
    expect(screen.getByText('Failed at “Qualification call”')).toBeTruthy();
    const timeline = screen.getByTestId('run-timeline');
    const items = within(timeline).getAllByRole('listitem').map((li) => li.textContent || '');
    expect(items[0]).toContain('run.enrolled');
    expect(items[1]).toContain('node.failed');
    expect(items[1]).toContain('Qualification call');
    expect(items[2]).toContain('run.failed');
    expect(screen.getAllByText(/agent_unavailable: The selected AI agent no longer exists/).length).toBeGreaterThan(0);
  });

  it('skip asks for a branch on multi-output steps and sends the audited action', async () => {
    state.run = { ...state.run, data: failedRun() };
    render(<ExecutionInspectorPage id="run1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip step' }));
    expect(await screen.findByText('Continue on branch')).toBeTruthy();
    fireEvent.click(screen.getByTestId('confirm-run-action'));
    await waitFor(() => expect(runAction.mutate).toHaveBeenCalledWith({ id: 'run1', action: 'skip', port: null }, expect.anything()));
  });

  it('retry calls the run action without a port', async () => {
    state.run = { ...state.run, data: failedRun() };
    render(<ExecutionInspectorPage id="run1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry step' }));
    fireEvent.click(await screen.findByTestId('confirm-run-action'));
    await waitFor(() => expect(runAction.mutate).toHaveBeenCalledWith({ id: 'run1', action: 'retry', port: null }, expect.anything()));
  });

  it('hides manual controls without workflow:execute', () => {
    state.permissions = new Set(['workflow:read']);
    state.run = { ...state.run, data: failedRun() };
    render(<ExecutionInspectorPage id="run1" />);
    expect(screen.queryByRole('button', { name: 'Retry step' })).toBeNull();
  });
});

describe('analytics', () => {
  it('renders the KPI grid from the analytics payload', () => {
    state.analytics = { ...state.analytics, data: {
      range: { days: 30, since: '' }, workflows: { total: 5, published: 3, draft: 2, paused: 0 },
      executions: { total: 120, completed: 90, failed: 6, running: 4, waiting: 20, paused: 0, cancelled: 0, skipped: 0, successRate: 93.8 },
      contacts: 101, calls: { initiated: 80, answered: 52, unanswered: 28, answerRate: 65 }, messages: { sent: 40, delivered: 37, blocked: 3 },
      links: { issued: 30, clicked: 12, humanClicks: 15, scannerHits: 9 }, outcomes: { qualified: 30, unreachable: 10 }, qualified: 30, conversionRate: 25,
      timeline: [], topWorkflows: [{ workflowId: 'wf1', name: 'Qualify new leads', status: 'published', runs: 100, completed: 80, failed: 5, successRate: 94.1 }], recentFailures: [],
    } };
    render(<AnalyticsPage />);
    const kpis = screen.getByTestId('analytics-kpis');
    for (const text of ['120', '93.8 %', '101', '80', 'Answer rate 65 %', '9 scanner hits filtered', 'Conversion 25 %', '3 blocked by consent/opt-out']) {
      expect(within(kpis).getByText(text)).toBeTruthy();
    }
    expect(screen.getByText('Qualify new leads')).toBeTruthy();
  });
});
