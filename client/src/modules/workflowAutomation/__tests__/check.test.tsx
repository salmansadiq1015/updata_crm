// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

/** Test → "Full check": verdict, channels, per-step problems with fixes, paths, AI repair prompts. */
vi.mock('@/lib/i18n/language-context', () => {
  const t = (key: string, fallback?: string | null, vars?: Record<string, unknown>) => {
    const text = fallback || key;
    return vars ? text.replace(/\{(\w+)\}/g, (_, n) => (vars[n] != null ? String(vars[n]) : `{${n}}`)) : text;
  };
  const value = { locale: 'en', language: 'en', dir: 'ltr', isRTL: false, t };
  return { useLanguage: () => value, LanguageProvider: ({ children }: { children: ReactNode }) => children };
});
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }));
vi.mock('@/lib/toast', () => ({ showError: vi.fn(), showSuccess: vi.fn() }));
vi.mock('../hooks/use-lookups', () => ({ useLeadSearch: () => ({ data: [{ _id: 'l1', name: 'Müller AG', leadNumber: 'L-1', status: 'new' }], isFetching: false }) }));
const analyze = vi.hoisted(() => vi.fn());
vi.mock('../services/workflow-api', () => ({ workflowApi: { analyze, test: vi.fn(), createCampaign: vi.fn(), campaignAction: vi.fn() } }));

const { TestRunDialog } = await import('../ui/builder/test-run-dialog');
const { fixPrompt, issueText, pathAsResult } = await import('../ui/builder/workflow-check');

const t = (k: string, f?: string | null, v?: Record<string, unknown>) => (f || k).replace(/\{(\w+)\}/g, (_, n) => String(v?.[n] ?? ''));
const report = {
  checkedAt: '2026-11-11T10:00:00Z', status: 'blocked', lead: null,
  counts: { steps: 4, stepsOk: 2, errors: 2, warnings: 1, paths: 3, openPaths: 1, endingPaths: 2 },
  general: [],
  nodes: [
    { nodeId: 't', type: 'trigger.manual', label: 'Campaign start', status: 'ok', issues: [], dryRun: { status: 'ok', port: 'out' } },
    { nodeId: 'call', type: 'ai.call', label: 'AI Call', status: 'warning', issues: [{ nodeId: 'call', code: 'branch_unconnected', severity: 'warning', ports: ['failed', 'blocked'] }], dryRun: { status: 'ok', port: 'answered' } },
    { nodeId: 'sms', type: 'msg.sms', label: 'Email to Admin', status: 'error', issues: [{ nodeId: 'sms', code: 'required', severity: 'error', field: 'body' }, { nodeId: 'sms', code: 'channel_unavailable', severity: 'error', channel: 'sms', reason: 'not_configured' }], dryRun: { status: 'ok', port: 'sent' } },
    { nodeId: 'end', type: 'end', label: 'End Qualified', status: 'ok', issues: [], dryRun: { status: 'ok' } },
  ],
  channels: { voice: { nodes: ['call'], ready: true, reason: null }, sms: { nodes: ['sms'], ready: false, reason: 'not_configured' } },
  paths: { total: 3, truncated: false, byStatus: { ends: 2, open: 1 }, paths: [
    { steps: [{ nodeId: 't', port: 'out' }, { nodeId: 'call', port: 'answered' }, { nodeId: 'end' }], status: 'ends', end: 'qualified' },
    { steps: [{ nodeId: 't', port: 'out' }, { nodeId: 'call', port: 'failed' }], status: 'open', end: null },
  ] },
};
const graph = { nodes: [], edges: [] };
const props = () => ({ open: true, onOpenChange: vi.fn(), workflowId: 'wf1', graph, onResult: vi.fn(), onFocusNode: vi.fn(), onAskAi: vi.fn() });

beforeEach(() => { analyze.mockReset(); analyze.mockResolvedValue(report); });

describe('full check', () => {
  it('runs automatically when Test opens and shows verdict, channels, problem steps first and paths', async () => {
    const p = props();
    render(<TestRunDialog {...p} />);
    await waitFor(() => expect(screen.getByText('Not ready yet')).toBeInTheDocument());
    expect(analyze).toHaveBeenCalledWith('wf1', { graph, leadId: null });
    expect(screen.getByText('SMS · not ready')).toBeInTheDocument();
    expect(screen.getByText('the provider is switched on but not configured')).toBeInTheDocument();
    expect(screen.getByText('AI calling · live')).toBeInTheDocument();
    expect(screen.getByText('2/4')).toBeInTheDocument(); // steps OK
    const cards = screen.getAllByRole('listitem').filter((li) => li.querySelector('.rounded-lg'));
    expect(cards[0]).toHaveTextContent('Email to Admin'); // errors first
    expect(screen.getByText('SMS is not ready: the provider is switched on but not configured')).toBeInTheDocument();
    expect(screen.getByText('2 steps work as configured')).toBeInTheDocument();
    expect(screen.getByText('No End step')).toBeInTheDocument();
  });

  it('“Show on canvas”, “Fix with AI”, “Fix everything with AI” and “Show path” hand over to the builder', async () => {
    const p = props();
    render(<TestRunDialog {...p} />);
    await waitFor(() => expect(screen.getByText('Not ready yet')).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole('button', { name: /Show on canvas/ })[0]);
    expect(p.onFocusNode).toHaveBeenCalledWith('sms');
    expect(p.onOpenChange).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getAllByRole('button', { name: /^Fix with AI$/ })[0]);
    const one = p.onAskAi.mock.calls[0][0] as string;
    expect(one).toContain('Fix the step “Email to Admin”');
    expect(one).not.toContain('SMS is not ready'); // provider set-up is for a person, not the copilot
    expect(screen.getAllByText('Set-up outside the workflow — the AI Copilot cannot change this.')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /Fix everything with AI/ }));
    const all = p.onAskAi.mock.calls[1][0] as string;
    expect(all).toContain('“Email to Admin”');
    expect(all).toContain('“AI Call”: branch_unconnected (failed, blocked)'); // open branches are part of the fix

    fireEvent.click(screen.getAllByRole('button', { name: 'Show path' })[1]);
    expect(p.onResult).toHaveBeenCalledWith(expect.objectContaining({ outcome: null, steps: [expect.objectContaining({ nodeId: 't', port: 'out' }), expect.objectContaining({ nodeId: 'call', port: 'failed' })] }));
  });

  it('re-checks on demand, uses a picked lead, and shows API errors', async () => {
    const p = props();
    render(<TestRunDialog {...p} />);
    await waitFor(() => expect(analyze).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('tab', { name: /Simulation/ }));
    fireEvent.click(screen.getByRole('option', { name: /Müller AG/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Full check/ }));
    analyze.mockRejectedValueOnce(new Error('Workflow not found'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Check again/ })); });
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Workflow not found'));
    expect(analyze).toHaveBeenLastCalledWith('wf1', { graph, leadId: 'l1' });
  });

  it('read-only workflows get the report without repair buttons; a step test skips the full check', async () => {
    const { rerender } = render(<TestRunDialog {...props()} readOnly />);
    await waitFor(() => expect(screen.getByText('Not ready yet')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Fix with AI|Fix everything/ })).not.toBeInTheDocument();
    analyze.mockClear();
    rerender(<TestRunDialog {...props()} startNodeId="sms" />);
    expect(screen.queryByText('Not ready yet')).not.toBeInTheDocument();
  });

  it('helpers: readable issue text, repair prompts and path overlay', () => {
    expect(issueText({ code: 'branch_unconnected', severity: 'warning', ports: ['failed'] }, t)).toBe('branch_unconnected (failed)');
    expect(issueText({ code: 'dry_run_failed', severity: 'error', message: 'boom' }, t)).toBe('This step failed in the dry run: boom');
    expect(fixPrompt([report.nodes[2] as never], [], t)).toMatch(/^Fix the step “Email to Admin” so it works:\n- “Email to Admin”: /);
    expect(pathAsResult(report.paths.paths[0] as never, report.nodes as never, 'Path 1')).toMatchObject({ outcome: 'qualified', lead: { name: 'Path 1' }, steps: [{ nodeId: 't' }, { nodeId: 'call', port: 'answered' }, { nodeId: 'end' }] });
  });
});
