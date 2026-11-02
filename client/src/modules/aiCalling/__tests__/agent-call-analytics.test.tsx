// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AgentCallAnalytics, AnalyzedCall } from '../types/ai-calling-types';

const mocks = vi.hoisted(() => ({ callAnalytics: vi.fn(), callAnalyticsCsv: vi.fn(), download: vi.fn() }));
vi.mock('../services/calling-agent-api', () => ({ callingAgentApi: mocks }));
vi.mock('@/lib/api/download', () => ({ downloadBlob: mocks.download }));
vi.mock('@/lib/toast', () => ({ showError: vi.fn(), showSuccess: vi.fn() }));
vi.mock('../ui/call-detail-drawer', () => ({ CallDetailDrawer: ({ callId }: { callId: string }) => <div>Conversation {callId}</div> }));

const { AgentCallAnalytics: Analytics, rangeParams } = await import('../ui/agent-call-analytics');

const tokens = { inputAudio: 10000, inputCachedAudio: 4000, inputText: 2000, inputCachedText: 0, outputAudio: 2500, outputText: 500, input: 12000, output: 3000, total: 15000 };
const call: AnalyzedCall = {
  id: 'c1', internalCallId: 'call_1', attemptNumber: 1, leadId: 'l1', leadName: 'Bilal Traders', leadPhone: '+923001234567',
  campaignId: 'k1', campaignName: 'Aria · 2026-10-28', isTest: false, provider: 'livekit_sip', at: '2026-10-28T10:00:00Z',
  answeredAt: '2026-10-28T10:00:05Z', endedAt: '2026-10-28T10:01:35Z', durationSeconds: 90, state: 'completed',
  disposition: 'answered_completed', qualification: 'qualified', reviewRequired: false, failure: null,
  summary: 'Owner is interested in a demo next week.', description: 'Intro call', blockers: ['Budget approval needed'], notesSource: 'ai_agent',
  behavior: { outcome: 'engaged', tone: 'positive', toneEvidence: 'That sounds great', participation: { leadTurns: 6, agentTurns: 7, interruptions: 1 }, answers: { valid: 3, total: 3 } },
  cost: { amount: 0.3696, currency: 'USD', source: 'token_usage', estimate: true, model: 'gpt-realtime', pricedAs: 'gpt-realtime', unpriced: false, tokens, rates: null,
    components: { model: 0.3696, telephony: 0, platform: 0, modelDetail: { audioIn: 0.1936, audioOut: 0.16, textIn: 0.008, textOut: 0.008 } }, billedMinutes: 2 },
};
const analytics: AgentCallAnalytics = {
  agent: { id: 'a1', name: 'Aria' }, currency: 'USD',
  totals: { calls: 2, connected: 1, completed: 1, qualified: 1, leads: 1, totalCost: 0.3696, totalSeconds: 90, avgCostPerCall: 0.1848,
    avgCostPerConnectedCall: 0.3696, avgCostPerLead: 0.3696, costPerQualifiedLead: 0.3696, costPerMinute: 0.2464, avgDurationSeconds: 90, connectRate: 0.5,
    tokens, avgTokensPerCall: 15000, components: { model: 0.3696, telephony: 0, platform: 0, other: 0 },
    modelDetail: { audioIn: 0.1936, audioOut: 0.16, textIn: 0.008, textOut: 0.008 }, callsWithUsage: 1, callsWithoutCost: 0 },
  testing: { calls: 3, totalCost: 0.5, seconds: 120, tokens: 9000 },
  pricing: { telephonyRatePerMinute: 0, platformRatePerMinute: 0, model: 'gpt-realtime' },
  tone: { positive: 1, neutral: 0, hesitant: 0, negative: 0, unrecorded: 0 }, outcomes: { engaged: 1, not_reached: 1 },
  byDay: [{ date: '2026-10-28', calls: 2, connected: 1, cost: 0.3696, seconds: 90, tokens: 15000 }],
  leads: [{ leadId: 'l1', name: 'Bilal Traders', phone: '+923001234567', status: 'qualified', calls: 2, connected: 1, seconds: 90, cost: 0.3696, tokens: 15000,
    avgCostPerCall: 0.1848, lastCallAt: call.at, lastCallId: 'c1', lastDisposition: 'answered_completed', lastQualification: 'qualified', lastTone: 'positive', lastSummary: call.summary }],
  calls: [call], truncated: false,
};
const renderIt = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Analytics agentId="a1" /></QueryClientProvider>);

beforeEach(() => { vi.clearAllMocks(); mocks.callAnalytics.mockResolvedValue(analytics); });

describe('agent call analytics', () => {
  it('shows response usage and cache estimates from recorded evidence', async () => {
    mocks.callAnalytics.mockResolvedValue({ ...analytics, calls: [{ ...call, costDiagnostics: {
      cacheHitPercent: 52.6, cachedInputTokens: 4000, estimatedCacheSavings: 0.05, estimatedCostPerMinute: 0.12,
      responseCount: 1, averageOutputTokens: 500, droppedResponses: 0, compactions: 0, configuration: null,
      responses: [{ responseId: 'response-real-id', cancelled: true, tokens: call.cost.tokens, inputCachedTokens: 4000, estimatedCost: 0.03, ttftMs: 210, cacheObservation: 'cache_hit' }],
    } }] });
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: /Bilal Traders/ }));
    const panel = screen.getByRole('region', { name: 'Cost diagnostics' });
    expect(within(panel).getByText('52.6%')).toBeTruthy();
    expect(within(panel).getByText('1 (cancelled)')).toBeTruthy();
    expect(within(panel).getByText('210')).toBeTruthy();
    expect(within(panel).getByText('$0.0300')).toBeTruthy();
  });
  it('shows spend, per-call/per-lead averages, tokens and the excluded test spend', async () => {
    renderIt();
    expect(await screen.findByText('Estimated call total')).toBeTruthy();
    expect(screen.getAllByText('$0.3696').length).toBeGreaterThan(1);
    expect(screen.getAllByText('$0.1848').length).toBeGreaterThan(0); // avg per call (also a trend axis label)
    const leadAttempt = screen.getByText('Cost / lead attempt').parentElement!;
    expect(within(leadAttempt).getByText('$0.1848')).toBeTruthy();
    expect(within(leadAttempt).getByText('2 call attempts')).toBeTruthy();
    expect(screen.getAllByText('15,000').length).toBeGreaterThan(0);
    expect(screen.getByText(/3 test call\(s\) \(\$0\.5000\) are excluded/)).toBeTruthy();
    expect(screen.getByText(/Telephony minutes are not included/)).toBeTruthy();
    expect(mocks.callAnalytics).toHaveBeenCalledWith('a1', { from: expect.any(String), to: expect.any(String) });
    expect(screen.getByRole('region', { name: 'Billing comparison' })).toHaveTextContent(/not reconciled with (OpenAI|provider) billing/);
    // Cost-per-minute figure and total minutes are surfaced in the hero.
    expect(screen.getAllByText('Cost per minute').length).toBeGreaterThan(0);
    expect(screen.getByText('Total minutes')).toBeTruthy();
    expect(screen.getByText('Cost over time')).toBeTruthy();
  });

  it('switches the trend chart between cost, cost/min and calls', async () => {
    renderIt();
    await screen.findByText('Cost over time');
    const trend = screen.getByRole('radiogroup', { name: 'Trend metric' });
    expect(within(trend).getByRole('radio', { name: 'Daily cost' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(within(trend).getByRole('radio', { name: 'Cost / min' }));
    expect(within(trend).getByRole('radio', { name: 'Cost / min' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(within(trend).getByRole('radio', { name: 'Calls' }));
    expect(within(trend).getByRole('radio', { name: 'Calls' }).getAttribute('aria-checked')).toBe('true');
  });

  it('expands a call into summary, behavior, blockers and its cost/token breakdown, and opens the transcript', async () => {
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: /Bilal Traders/ }));
    expect(screen.getByText('Owner is interested in a demo next week.')).toBeTruthy();
    expect(screen.getByText('Budget approval needed')).toBeTruthy();
    expect(screen.getByText('“That sounds great”')).toBeTruthy();
    expect(screen.getByText('6 / 7')).toBeTruthy();
    expect(screen.getByText(/Estimated from gpt-realtime token usage at list prices. Input caching is discounted/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Open conversation/ }));
    expect(screen.getByText('Conversation c1')).toBeTruthy();
  });

  it('lists per-lead totals and refetches for another date range', async () => {
    renderIt();
    fireEvent.mouseDown(await screen.findByRole('tab', { name: /Per lead/ }), { button: 0, ctrlKey: false });
    const row = screen.getByRole('row', { name: /Bilal Traders/ });
    expect(within(row).getByText('$0.1848')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'All time' }));
    await vi.waitFor(() => expect(mocks.callAnalytics).toHaveBeenLastCalledWith('a1', {}));
  });

  it('exports the CSV and shows an empty state with no calls', async () => {
    mocks.callAnalyticsCsv.mockResolvedValue(new Blob(['x']));
    renderIt();
    await screen.findByText('Estimated call total');
    fireEvent.click(screen.getByRole('button', { name: /Export CSV/ }));
    await vi.waitFor(() => expect(mocks.download).toHaveBeenCalled());
    mocks.callAnalytics.mockResolvedValue({ ...analytics, totals: { ...analytics.totals, calls: 0 } });
    fireEvent.click(screen.getByRole('radio', { name: '90 days' }));
    expect(await screen.findByText('No campaign calls in this period')).toBeTruthy();
  });

  it('uses complete UTC days independent of the browser timezone', () => {
    expect(rangeParams('7', new Date('2026-10-29T23:30:00-05:00'))).toEqual({ from: '2026-10-24T00:00:00.000Z', to: '2026-10-31T00:00:00.000Z' });
    expect(rangeParams('all')).toEqual({});
  });

  it('contains the SVG inside a bounded plot with explicit width and handles a single data point', async () => {
    renderIt();
    const plot = await screen.findByTestId('cost-trend-plot');
    expect(plot.querySelector('svg')).toHaveAttribute('width', '100%');
    expect(plot.querySelector('svg')).toHaveClass('w-full');
    expect(plot.querySelector('circle')).toBeTruthy();
  });

  it('does not label unavailable pricing as a free call', async () => {
    mocks.callAnalytics.mockResolvedValue({ ...analytics, calls: [{ ...call, cost: { ...call.cost, amount: 0, unpriced: true } }] });
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: /Bilal Traders/ }));
    expect(screen.getAllByText('Not recorded').length).toBeGreaterThan(0);
    expect(screen.getByText(/this is not a zero-cost call/)).toBeTruthy();
  });

  it('does not present a zero-dollar total or flat cost trend when all historical calls lack model identity', async () => {
    mocks.callAnalytics.mockResolvedValue({ ...analytics, totals: { ...analytics.totals, totalCost: 0 }, billing: { unpricedCalls: 1, foreignCurrencyCalls: 0, modelEstimate: 0, additionalEstimate: 0 }, calls: [{ ...call, cost: { ...call.cost, amount: 0, unpriced: true } }] });
    renderIt();
    await screen.findByText('Estimated call total');
    expect(screen.getAllByText('Not recorded').length).toBeGreaterThan(1);
    expect(screen.getByText(/Cost trend is unavailable/)).toBeTruthy();
  });
});
