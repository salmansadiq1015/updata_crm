// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * AI follow-up UI on the Follow-ups page: server row parsing, the state → allowed-controls
 * rules (mirroring followUpCalling.service.js guards), honest next-action wording, the row
 * badge, the agent picker, the `management` list filter, and the detail drawer actions
 * reaching the right /ai-calling/follow-ups/:id/* endpoints.
 */
const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api/client', () => ({ default: http, normalizeApiError: (e: unknown) => e }));
vi.mock('@/lib/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));
vi.mock('@/lib/i18n/language-context', () => {
  const t = (key: string, fallback?: string | null, vars?: Record<string, unknown>) => {
    const text = fallback ?? key;
    return vars ? text.replace(/\{(\w+)\}/g, (_, name) => (vars[name] != null ? String(vars[name]) : `{${name}}`)) : text;
  };
  const value = { locale: 'en', language: 'en', dir: 'ltr', isRTL: false, t };
  return { useLanguage: () => value, useOptionalLanguage: () => value, LanguageProvider: ({ children }: { children: ReactNode }) => children };
});
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: { href: string; children: ReactNode }) => <a href={href} {...props}>{children}</a> }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/leads/follow-ups', useSearchParams: () => new URLSearchParams() }));

const { leadWorkflowApi, parseFollowUp } = await import('../services/lead-workflow-api');
const { aiControlsFor, FollowUpAiSummary, AgentSelect, AgentPickerHint, MANAGEMENT_OPTIONS } = await import('../ui/follow-up-ai');
const { nextActionText, FollowUpDetailDrawer } = await import('../ui/follow-up-detail-drawer');

const t = (_key: string, fallback?: string | null, vars?: Record<string, unknown>) => {
  const text = fallback ?? _key;
  return vars ? text.replace(/\{(\w+)\}/g, (_, n) => String(vars[n] ?? `{${n}}`)) : text;
};

function serverRow(automation: Record<string, unknown> | null, extra: Record<string, unknown> = {}) {
  return {
    id: 'fu-1', leadId: 'lead-1',
    lead: { id: 'lead-1', name: 'Müller AG', leadNumber: 'L-1', status: 'contacted', email: null, phone: '+41791234567', lastContactedAt: null, lastContactChannel: null, latestCall: null, pipelineStage: 'FOLLOW_UP' },
    owner: { id: 'u-me', name: 'Me' }, createdBy: null,
    dueAt: '2026-11-06T09:00:00.000Z', nextDueAt: '2026-11-06T09:00:00.000Z', timezone: 'Europe/Zurich', channel: 'phone', note: 'The lead asked to be called back.',
    taskType: 'AI_CALL', priority: 'NORMAL', reminderMinutes: null, status: 'open', bucket: 'upcoming', snoozedUntil: null, snoozeCount: 0,
    completedAt: null, completedBy: null, completionNote: null, cancelledAt: null, cancelReason: null,
    source: { type: 'ai_call', communicationId: null, callRecordId: 'call-1', campaignId: 'camp-1', callingAgentId: 'agent-1', qualification: 'callback', recommendedAction: 'SCHEDULE_CALLBACK', contactLogId: null, requestedTimeText: null },
    suppression: { suppressed: false, reason: null, reasons: [], limited: false },
    automation, createdAt: '2026-11-05T09:00:00.000Z', ...extra,
  };
}
const ai = (over: Record<string, unknown> = {}) => ({
  mode: 'ai', agentId: 'agent-1', state: 'scheduled', reason: 'CALLBACK_REQUESTED', outcome: null, round: 1, attempts: 0,
  campaignId: null, callRecordId: null, previousCallId: 'call-1', notBefore: null, lastError: null, instructions: null,
  timeResolution: { kind: 'part_of_day', approximate: true, requestedText: 'tomorrow morning', shiftedFrom: null },
  stateChangedAt: '2026-11-05T09:00:00.000Z', history: [{ state: 'scheduled', at: '2026-11-05T09:00:00.000Z', reason: 'CALLBACK_REQUESTED' }], call: null,
  agent: { id: 'agent-1', name: 'David', title: 'Follow-up Agent', agentType: 'follow_up', avatarPresetId: null, availability: 'active' },
  ...over,
});
const fu = (automation: Record<string, unknown> | null, extra: Record<string, unknown> = {}) => parseFollowUp(serverRow(automation, extra))!;
const agentOption = (id: string, name: string, followUp: Record<string, unknown>, availability = 'active') => ({ _id: id, name, title: '', availability, agentType: 'follow_up', usage: 'outbound', followUp });
const orgOn = { enabled: true, forcedOffByEnv: false, pausedReason: '', voicePaused: false };

beforeEach(() => { vi.clearAllMocks(); });

describe('parsing', () => {
  it('keeps the AI automation block and the AI source fields from the server row', () => {
    const item = fu(ai({ state: 'calling', call: { state: 'in_progress', disposition: null, qualification: null, durationSeconds: 12, answeredAt: null, endedAt: null, summary: 'Talking now' } }));
    expect(item.automation).toMatchObject({ mode: 'ai', state: 'calling', reason: 'CALLBACK_REQUESTED', agentId: 'agent-1', agent: { name: 'David' }, call: { summary: 'Talking now' } });
    expect(item.source).toMatchObject({ campaignId: 'camp-1', callingAgentId: 'agent-1', qualification: 'callback', recommendedAction: 'SCHEDULE_CALLBACK' });
  });
  it('an ordinary human task has no automation', () => {
    expect(fu(null).automation).toBeNull();
  });
});

describe('allowed AI controls per state (mirrors the server guards)', () => {
  it('scheduled: call now, pause, change agent, reschedule — but no resume', () => {
    expect(aiControlsFor(fu(ai()))).toMatchObject({ callNow: true, pause: true, resume: false, changeAgent: true, reschedule: true, assignHuman: true });
  });
  it('a call on the line: no call now / change agent / reschedule; pause still allowed', () => {
    for (const state of ['queued', 'calling', 'retry_scheduled']) {
      expect(aiControlsFor(fu(ai({ state })))).toMatchObject({ active: true, callNow: false, changeAgent: false, reschedule: false, pause: true });
    }
  });
  it('paused: resume, not pause', () => {
    expect(aiControlsFor(fu(ai({ state: 'paused' })))).toMatchObject({ resume: true, pause: false, callNow: true });
  });
  it('closed follow-ups offer nothing', () => {
    expect(aiControlsFor(fu(ai({ state: 'completed' }), { status: 'done' }))).toMatchObject({ open: false, callNow: false, pause: false, resume: false, complete: false, cancel: false });
  });
  it('a follow-up handed to a person can be given (back) to an AI agent but has no AI call controls', () => {
    expect(aiControlsFor(fu(ai({ mode: 'human', state: 'requires_human' })))).toMatchObject({ ai: false, callNow: false, pause: false, changeAgent: true });
  });
  it('flags an agent whose manual "Call now" is off', () => {
    expect(aiControlsFor(fu(ai()), { id: 'agent-1', name: 'David', availability: 'active', followUp: { enabled: true, autoCall: true, manualCall: false } } as never).manualCallOff).toBe(true);
  });
});

describe('next action wording is honest', () => {
  const opts = { agent: null, locale: 'en', tz: 'Europe/Zurich', t };
  it('explains a waiting call when the organisation switch is off, voice is paused, or the agent is manual-only', () => {
    expect(nextActionText(fu(ai()), { ...opts, settings: { ...orgOn, enabled: false } })).toMatch(/Automatic follow-up calls are off/);
    expect(nextActionText(fu(ai()), { ...opts, settings: { ...orgOn, voicePaused: true } })).toMatch(/voice calling is paused/);
    expect(nextActionText(fu(ai()), { ...opts, settings: orgOn, agent: { id: 'agent-1', name: 'David', availability: 'active', followUp: { enabled: true, autoCall: false, manualCall: true } } as never })).toMatch(/does not call automatically/);
  });
  it('states what happens next for live and finished states', () => {
    expect(nextActionText(fu(ai()), { ...opts, settings: orgOn })).toMatch(/calls at .* within its calling window/);
    expect(nextActionText(fu(ai({ state: 'calling' })), { ...opts, settings: orgOn })).toMatch(/on the call now/);
    expect(nextActionText(fu(ai({ state: 'completed' }), { status: 'done' }), { ...opts, settings: orgOn })).toMatch(/Closed/);
  });
});

describe('row badge and agent picker', () => {
  it('shows agent, state, reason, round/attempts and the lead\'s own words for an approximate time', () => {
    render(<FollowUpAiSummary item={fu(ai({ round: 2, attempts: 1 }))} t={t} />);
    expect(screen.getByText('AI · David')).toBeTruthy();
    expect(document.querySelector('[data-state="scheduled"]')).toBeTruthy();
    expect(screen.getByText('Round 2 · 1 attempts')).toBeTruthy();
    expect(screen.getByText(/lead said “tomorrow morning”/)).toBeTruthy();
  });
  it('an escalated follow-up says it was handed to a person', () => {
    render(<FollowUpAiSummary item={fu(ai({ mode: 'human', state: 'requires_human' }))} t={t} />);
    expect(screen.getByText('Handed to a person')).toBeTruthy();
  });
  it('only agents with follow-up calling on can be picked; the hint explains why none can', () => {
    const agents = [
      { id: 'a1', name: 'David', availability: 'active', followUp: { enabled: true, autoCall: true, manualCall: true } },
      { id: 'a2', name: 'Alex', availability: 'active', followUp: { enabled: false, autoCall: false, manualCall: true } },
    ] as never[];
    render(<><AgentSelect id="pick" agents={agents} value="" onChange={vi.fn()} t={t} /><AgentPickerHint id="hint" agents={[agents[1]]} t={t} /></>);
    expect((screen.getByRole('option', { name: 'David' }) as HTMLOptionElement).disabled).toBe(false);
    expect((screen.getByRole('option', { name: /Alex \(follow-up calling off\)/ }) as HTMLOptionElement).disabled).toBe(true);
    expect(screen.getByText(/None of your AI agents has follow-up calling turned on/)).toBeTruthy();
  });
  it('offers every management view', () => {
    expect(MANAGEMENT_OPTIONS.map((o) => o.value)).toEqual(['', 'ai', 'human', 'ai_scheduled', 'ai_active', 'ai_completed', 'ai_failed', 'attention']);
  });
});

describe('API', () => {
  it('the list sends the management and agent filters', async () => {
    http.get.mockResolvedValue({ data: [serverRow(ai())], pagination: { hasNext: false, nextCursor: null } });
    const page = await leadWorkflowApi.followUps({ scope: 'mine', bucket: 'open', tz: 'UTC', management: 'ai_scheduled', agentId: 'agent-1' } as never, null);
    expect(http.get).toHaveBeenCalledWith('/crm/follow-ups', { params: expect.objectContaining({ management: 'ai_scheduled', agentId: 'agent-1' }) });
    expect(page.data[0].automation?.state).toBe('scheduled');
  });
  it('agent list reads data.agents across pages and drops archived agents', async () => {
    http.get
      .mockResolvedValueOnce({ data: { agents: [agentOption('a1', 'David', { enabled: true, autoCall: true, manualCall: true })] }, pagination: { pages: 2 } })
      .mockResolvedValueOnce({ data: { agents: [agentOption('a2', 'Old', { enabled: true }, 'archived')] }, pagination: { pages: 2 } });
    const agents = await leadWorkflowApi.followUpAgents();
    expect(agents.map((a) => a.id)).toEqual(['a1']);
    expect(http.get).toHaveBeenCalledWith('/ai-calling/agents', { params: { usage: 'outbound', page: 2, limit: 100, sort: 'name' } });
  });
});

describe('detail drawer actions', () => {
  function openDrawer(item: ReturnType<typeof fu>, extra: Partial<Parameters<typeof FollowUpDetailDrawer>[0]> = {}) {
    http.get.mockImplementation(async (url: string) => {
      if (url === '/ai-calling/agents') return { data: { agents: [agentOption('agent-1', 'David', { enabled: true, autoCall: true, manualCall: true }), agentOption('agent-2', 'Emma', { enabled: true, autoCall: true, manualCall: true })] }, pagination: { pages: 1 } };
      return { data: serverRow(ai({ state: item.automation?.state })) };
    });
    http.post.mockImplementation(async () => ({ data: serverRow(ai()) }));
    const onLifecycle = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><FollowUpDetailDrawer item={item} open onOpenChange={vi.fn()} locale="en" tz="Europe/Zurich" users={[]}
      canManage canAiRead canAiWrite isMine isSupervisor={false} settings={orgOn} onLifecycle={onLifecycle} {...extra} /></QueryClientProvider>);
    return { onLifecycle };
  }

  it('shows the reason, agent, schedule and history, and "Call now" / "Pause" hit the follow-up endpoints', async () => {
    openDrawer(fu(ai()));
    expect(await screen.findAllByText(/David/)).not.toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: /Call now/ }));
    await waitFor(() => expect(http.post).toHaveBeenCalledWith('/ai-calling/follow-ups/fu-1/call-now', {}));
    fireEvent.click(screen.getByRole('button', { name: /^Pause/ }));
    await waitFor(() => expect(http.post).toHaveBeenCalledWith('/ai-calling/follow-ups/fu-1/pause', {}));
  });

  it('a paused follow-up offers Resume, not Pause', async () => {
    openDrawer(fu(ai({ state: 'paused' })));
    fireEvent.click(await screen.findByRole('button', { name: /Resume/ }));
    await waitFor(() => expect(http.post).toHaveBeenCalledWith('/ai-calling/follow-ups/fu-1/resume', {}));
    expect(screen.queryByRole('button', { name: /^Pause/ })).toBeNull();
  });

  it('while the AI is on the call there is no Call now and no Reschedule', async () => {
    openDrawer(fu(ai({ state: 'calling' })));
    expect(await screen.findByRole('button', { name: /^Pause/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Call now/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Reschedule/ })).toBeNull();
  });

  it('lifecycle actions (reschedule, mark completed, cancel) reuse the inbox dialogs', async () => {
    const { onLifecycle } = openDrawer(fu(ai()));
    fireEvent.click(await screen.findByRole('button', { name: /Reschedule/ }));
    expect(onLifecycle).toHaveBeenCalledWith('snooze', expect.objectContaining({ id: 'fu-1' }));
  });

  it('read-only AI access shows the state but no AI actions', async () => {
    openDrawer(fu(ai()), { canAiWrite: false });
    expect(await screen.findAllByText(/David/)).not.toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Call now/ })).toBeNull();
  });
});
