// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { inboundCallsTranslations } from '@/lib/i18n/inbound-calls-translations';
import type { AgentCallAnalytics, AnalyzedCall } from '@/modules/aiCalling/types/ai-calling-types';

const lang = vi.hoisted(() => ({ locale: 'en' }));
vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => {
    const dict = (inboundCallsTranslations as Record<string, Record<string, string>>)[lang.locale];
    const t = (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const v = vars ?? (typeof fallback === 'object' ? fallback : undefined);
      const raw = dict[key] ?? (typeof fallback === 'string' ? fallback : key);
      return raw.replace(/\{(\w+)\}/g, (_m: string, k: string) => (v?.[k] != null ? String(v[k]) : `{${k}}`));
    };
    return { t, locale: lang.locale, isRTL: lang.locale === 'ar' };
  },
  useOptionalLanguage: () => null,
}));
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock('@/lib/toast', () => ({ showError: vi.fn(), showSuccess: vi.fn() }));
const download = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/download', () => ({ downloadBlob: download }));
const agentApi = vi.hoisted(() => ({ callAnalytics: vi.fn(), callAnalyticsCsv: vi.fn() }));
vi.mock('@/modules/aiCalling/services/calling-agent-api', () => ({ callingAgentApi: agentApi }));
vi.mock('@/modules/aiCalling/ui/call-detail-drawer', () => ({ CallDetailDrawer: ({ callId }: { callId: string }) => <div>Outbound drawer {callId}</div> }));
vi.mock('next/dynamic', () => ({ default: () => ({ callId }: { callId: string }) => <div>Incoming drawer {callId}</div> }));
const api = vi.hoisted(() => ({ costs: vi.fn(), costsCsv: vi.fn() }));
vi.mock('@/modules/inboundCalls/services/inbound-calls-api', () => ({ inboundCallsApi: api }));

const { AgentCallAnalytics: Analytics } = await import('@/modules/aiCalling/ui/agent-call-analytics');
const { CostBlock } = await import('../ui/call-detail-drawer');

const tokens = { inputAudio: 9000, inputCachedAudio: 3000, inputText: 1500, inputCachedText: 0, outputAudio: 2600, outputText: 400, input: 10500, output: 3000, total: 13500 };
const cost = { amount: 0.1228, currency: 'USD', source: 'token_usage' as const, estimate: true, model: 'gpt-realtime-2.1-mini', pricedAs: 'gpt-realtime-2.1-mini', unpriced: false, tokens, rates: null,
  components: { model: 0.1228, telephony: 0, platform: 0, modelDetail: { audioIn: 0.05, audioOut: 0.07, textIn: 0.0014, textOut: 0.0014 } }, billedMinutes: null };
const row: AnalyzedCall = {
  id: 'ic1', internalCallId: 'in_1', attemptNumber: 1, leadId: 'caller:+41791234567', leadName: '+41791234567', leadPhone: '+41791234567',
  campaignId: 'nova', campaignName: 'Nova Reception', isTest: false, provider: 'paired_phone', at: '2026-11-03T09:00:00Z', answeredAt: '2026-11-03T09:00:04Z', endedAt: '2026-11-03T09:03:42Z',
  durationSeconds: 218, state: 'COMPLETED', disposition: 'handled_by_ai', qualification: 'review', reviewRequired: false, failure: null,
  summary: 'Asked about pricing for a website.', description: 'Pricing', blockers: [], notesSource: 'ai_agent',
  behavior: { outcome: 'handled_by_ai' as never, tone: 'positive', toneEvidence: null, participation: { leadTurns: 8, agentTurns: 9, interruptions: 2 }, answers: { valid: 4, total: 4 }, questions: 2, callbackRequested: true, humanRequested: false },
  cost, outcome: 'handled_by_ai', answeredBy: 'ai', qualificationResult: 'PARTIALLY_QUALIFIED', inquiry: 'PRICING_INQUIRY', agentId: 'nova', agentName: 'Nova Reception', device: 'Office phone', sim: 'Business', leadCreated: false, matchStatus: 'ambiguous',
};
const inbound: AgentCallAnalytics = {
  scope: 'inbound', agent: null, currency: 'USD',
  totals: { calls: 3, connected: 2, completed: 2, qualified: 0, leads: 2, totalCost: 0.1228, totalSeconds: 300, avgCostPerCall: 0.0409, avgCostPerConnectedCall: 0.0614,
    avgCostPerLead: 0.0614, costPerQualifiedLead: null, costPerMinute: 0.0338, avgDurationSeconds: 150, connectRate: 0.667, tokens, avgTokensPerCall: 13500,
    components: { model: 0.1228, telephony: 0, platform: 0, other: 0 }, modelDetail: { audioIn: 0.05, audioOut: 0.07, textIn: 0.0014, textOut: 0.0014 }, callsWithUsage: 1, callsWithoutCost: 0,
    answeredByAi: 1, missed: 1, leadsCreated: 1, aiSeconds: 218, avgCostPerAiCall: 0.1228, costPerNewLead: 0.1228 },
  testing: { calls: 0, totalCost: 0, seconds: 0, tokens: 0 },
  pricing: { telephonyRatePerMinute: 0, platformRatePerMinute: 0, model: 'gpt-realtime-2.1-mini' },
  billing: { status: 'not_reconciled', timezone: 'UTC', currency: 'USD', from: null, to: null, modelEstimate: 0.1228, additionalEstimate: 0, unpricedCalls: 0, foreignCurrencyCalls: 0, excludes: ['sim_airtime'] },
  tone: { positive: 1, neutral: 0, hesitant: 0, negative: 0, unrecorded: 0 }, outcomes: { handled_by_ai: 1, missed: 1, handled_by_human: 1 } as never,
  byDay: [{ date: '2026-11-03', calls: 3, connected: 2, cost: 0.1228, seconds: 300, tokens: 13500 }],
  byAgent: [{ agentId: 'nova', name: 'Nova Reception', calls: 1, seconds: 218, cost: 0.1228, tokens: 13500, avgCostPerCall: 0.1228 }],
  leads: [
    { leadId: null as unknown as string, callerKey: 'caller:+41791234567', name: '+41791234567', phone: '+41791234567', status: null, calls: 1, connected: 1, seconds: 218, cost: 0.1228, tokens: 13500, avgCostPerCall: 0.1228, lastCallAt: row.at, lastCallId: 'ic1', lastDisposition: 'handled_by_ai', lastQualification: 'review', lastTone: 'positive', lastSummary: row.summary },
    { leadId: 'lead7', callerKey: 'lead7', name: 'Meier AG', phone: '+41790000000', status: 'new', calls: 2, connected: 1, seconds: 82, cost: 0, tokens: 0, avgCostPerCall: 0, lastCallAt: row.at, lastCallId: 'ic2', lastDisposition: 'missed', lastQualification: null, lastTone: null, lastSummary: '' },
  ],
  calls: [row], truncated: false,
};
const wrap = (ui: ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

beforeEach(() => { cleanup(); vi.clearAllMocks(); lang.locale = 'en'; api.costs.mockResolvedValue(inbound); });

describe('cost analytics: the inbound source', () => {
  it('queries /inbound-calls/costs (never the agent endpoint) and shows incoming-call metrics', async () => {
    wrap(<Analytics source={{ kind: 'inbound', agentId: null }} />);
    expect(await screen.findByText('Avg / AI-answered call')).toBeTruthy();
    expect(screen.getByText('Cost, duration, outcome and caller behaviour for every incoming call.')).toBeTruthy();
    expect(api.costs).toHaveBeenCalledWith(expect.objectContaining({ from: expect.any(String), to: expect.any(String) }));
    expect(api.costs.mock.calls[0][0]).not.toHaveProperty('agentId');
    expect(agentApi.callAnalytics).not.toHaveBeenCalled();
    for (const label of ['Avg / AI-answered call', 'Cost / caller', 'Cost / new lead', 'Cost / qualified', 'Cost / minute (AI talk time)', 'Answer rate']) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.queryByText('Connect rate')).toBeNull();
    expect(screen.getByText('SIM airtime is not included: incoming calls use your own phone plan, billed by your carrier.')).toBeTruthy();
    expect(screen.getByText('3 calls · 1 answered by AI · 2 callers')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Cost optimization comparison' })).toBeNull();
  });

  it('labels outcomes with the inbound enum and lists cost by agent', async () => {
    wrap(<Analytics source={{ kind: 'inbound' }} />);
    const outcomes = (await screen.findByText('How incoming calls ended')).closest('section')!;
    expect(within(outcomes).getByText('Handled by AI')).toBeTruthy();
    expect(within(outcomes).getByText('Missed')).toBeTruthy();
    expect(within(outcomes).getByText('Handled by a person')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Cost by agent' })).getByText('Nova Reception')).toBeTruthy();
  });

  it('passes the agent filter and hides the by-agent table for one agent', async () => {
    wrap(<Analytics source={{ kind: 'inbound', agentId: 'nova' }} />);
    await screen.findByText('Call costs');
    expect(api.costs).toHaveBeenCalledWith(expect.objectContaining({ agentId: 'nova' }));
    expect(screen.queryByRole('region', { name: 'Cost by agent' })).toBeNull();
  });

  it('opens incoming calls in the incoming drawer, with agent/SIM, inquiry and caller behaviour', async () => {
    wrap(<Analytics source={{ kind: 'inbound' }} />);
    fireEvent.click(await screen.findByRole('button', { name: /\+41791234567/ }));
    expect(screen.getByText('Nova Reception · Business')).toBeTruthy();
    expect(screen.getByText('Callback requested')).toBeTruthy();
    expect(screen.getByText('The caller interrupted the agent 2 time(s).')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open call details & transcript' }));
    expect(await screen.findByText('Incoming drawer ic1')).toBeTruthy();
    expect(screen.queryByText(/Outbound drawer/)).toBeNull();
  });

  it('shows callers, linking only those with a lead', async () => {
    wrap(<Analytics source={{ kind: 'inbound' }} />);
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Callers (2)' }), { button: 0 }); // Radix tabs activate on mouse-down
    expect(screen.getByRole('link', { name: 'Meier AG' }).getAttribute('href')).toBe('/leads?detail=lead7');
    expect(screen.queryByRole('link', { name: '+41791234567' })).toBeNull();
    expect(screen.getByText('+41791234567 · no lead')).toBeTruthy();
  });

  it('exports through the incoming-call CSV endpoint', async () => {
    api.costsCsv.mockResolvedValue(new Blob(['x']));
    wrap(<Analytics source={{ kind: 'inbound', agentId: 'nova' }} />);
    await screen.findByText('Avg / AI-answered call');
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(api.costsCsv).toHaveBeenCalledWith(expect.objectContaining({ agentId: 'nova' })));
    expect(download.mock.calls[0][1]).toMatch(/^incoming-call-costs-/);
  });

  it('renders translated in Arabic', async () => {
    lang.locale = 'ar';
    wrap(<Analytics source={{ kind: 'inbound' }} />);
    expect(await screen.findByText('التكلفة / متصل')).toBeTruthy();
    expect(screen.getByText('تكاليف المكالمات')).toBeTruthy();
  });

  it('keeps the outbound agent view on the agent endpoint', async () => {
    agentApi.callAnalytics.mockResolvedValue({ ...inbound, scope: undefined, byAgent: undefined, outcomes: { engaged: 1 } });
    wrap(<Analytics agentId="a1" />);
    expect(await screen.findByText('Connect rate')).toBeTruthy();
    expect(screen.getByText('Cost, duration, outcome and lead behavior for every call this agent placed.')).toBeTruthy();
    expect(agentApi.callAnalytics).toHaveBeenCalledWith('a1', expect.any(Object));
    expect(api.costs).not.toHaveBeenCalled();
    expect(screen.getByText('Connect rate')).toBeTruthy();
  });
});

describe('call drawer cost section', () => {
  const t = (_k: string, fallback?: string, vars?: Record<string, unknown>) => (fallback ?? _k).replace(/\{(\w+)\}/g, (_m, k: string) => String(vars?.[k] ?? `{${k}}`));
  it('shows total, split, model, tokens, per-minute and the not-reconciled note', () => {
    render(<CostBlock call={{ cost, durationSeconds: 218, answeredBy: 'ai' }} t={t} locale="en-US" />);
    expect(screen.getAllByText('$0.1228').length).toBeGreaterThan(0);
    expect(screen.getByText('$0.0338')).toBeTruthy(); // 0.1228 / (218 / 60)
    expect(screen.getByText('gpt-realtime-2.1-mini')).toBeTruthy();
    expect(screen.getByText('9,000')).toBeTruthy();
    expect(screen.getByText('3,000')).toBeTruthy();
    expect(screen.getByText('13,500')).toBeTruthy();
    expect(screen.getByText(/Usage estimate · not reconciled with provider billing/)).toBeTruthy();
    expect(screen.getByText(/SIM airtime is not included\./)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('warns when pricing is incomplete and never shows a fake zero', () => {
    render(<CostBlock call={{ cost: { ...cost, amount: 0, unpriced: true }, durationSeconds: 60, answeredBy: 'ai' }} t={t} />);
    expect(screen.getAllByText('Not recorded').length).toBeGreaterThan(0);
    expect(screen.getByRole('alert').textContent).toMatch(/Cost is incomplete/);
  });
  it('explains a person-answered call has no AI cost', () => {
    render(<CostBlock call={{ cost: { ...cost, amount: 0, source: 'none', tokens: null, model: null }, durationSeconds: 40, answeredBy: 'human' }} t={t} />);
    expect(screen.getByText(/no AI usage, no AI cost/)).toBeTruthy();
    expect(screen.getAllByText('$0.00').length).toBeGreaterThan(0);
  });
});
