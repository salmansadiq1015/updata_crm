// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { inboundCallsTranslations } from '@/lib/i18n/inbound-calls-translations';
import type { InboundCallDetail, InboundSettings, LiveCall } from '../types/inbound-call-types';

const lang = vi.hoisted(() => ({ locale: 'en' }));
vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => {
    const dict = (inboundCallsTranslations as Record<string, Record<string, string>>)[lang.locale];
    const t = (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const v = vars ?? (typeof fallback === 'object' ? fallback : undefined);
      const raw = dict[key] ?? (typeof fallback === 'string' ? fallback : key);
      return raw.replace(/\{(\w+)\}/g, (_m: string, k: string) => (v?.[k] != null ? String(v[k]) : `{${k}}`));
    };
    return { t, locale: lang.locale, isRTL: lang.locale === 'ar', dir: lang.locale === 'ar' ? 'rtl' : 'ltr' };
  },
  useOptionalLanguage: () => null,
}));
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock('@/lib/toast', () => ({ showError: vi.fn(), showSuccess: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: vi.fn() }));
vi.mock('@/lib/socket/client', () => ({ onSocketConnect: () => () => {} }));
vi.mock('@/modules/aiCalling/hooks/use-calling-agents', () => ({
  useAllCallingAgents: () => ({ data: [{ _id: 'agent1', name: 'Mia', availability: 'active' }], isLoading: false }),
}));
const api = vi.hoisted(() => ({
  list: vi.fn(), stats: vi.fn(), analytics: vi.fn(), live: vi.fn(), exportCsv: vi.fn(), devices: vi.fn(), settings: vi.fn(), updateSettings: vi.fn(),
  saveRule: vi.fn(), deleteRule: vi.fn(), testRules: vi.fn(), get: vi.fn(), addNote: vi.fn(), reviewField: vi.fn(), resolveMatch: vi.fn(), createLead: vi.fn(),
  decideRecommendation: vi.fn(), scheduleFollowUp: vi.fn(), control: vi.fn(), forLead: vi.fn(),
}));
vi.mock('../services/inbound-calls-api', () => ({ inboundCallsApi: api }));

const { LiveMonitorTab } = await import('../ui/live-monitor-tab');
const { HistoryTab } = await import('../ui/history-tab');
const { SettingsTab } = await import('../ui/settings-tab');
const { CallDetailDrawer } = await import('../ui/call-detail-drawer');
const { RulesTab } = await import('../ui/rules-tab');

function wrap(ui: ReactNode) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
}

const live = (over: Partial<LiveCall> = {}): LiveCall => ({
  id: '0123456789abcdef01234567', callId: 'in_1', caller: { name: 'Hans Meier', number: '+41791234567', presentation: 'available' }, callerType: 'existing',
  lead: { id: 'lead1', name: 'Meier AG', number: 'L-7', created: false }, status: 'AI_ACTIVE', aiStatus: 'connecting', audioStatus: 'connected', handling: 'ai', answeredBy: 'ai',
  outcome: null, agent: { id: 'agent1', name: 'Mia' }, rule: null, aiBlockedBy: null, sim: { slot: 0, label: null }, device: { id: 'd1', name: 'Office phone' },
  durationSeconds: 0, ringSeconds: 3, primaryInquiry: null, qualification: null, callbackRequested: false, humanRequested: false,
  detectedAt: new Date().toISOString(), answeredAt: new Date().toISOString(), endedAt: null,
  agentActivity: null, audio: null, pendingCommand: null, language: 'de', handoff: null,
  lastTurns: [{ role: 'assistant', text: 'Grüezi, wie kann ich helfen?', at: null }, { role: 'caller', text: 'Was kostet das?', at: null }],
  collected: [{ key: 'full_name', value: 'Hans Meier', explicit: true }, { key: 'budget', value: '5k', explicit: false }], questionCount: 1, ...over,
});

beforeEach(() => {
  cleanup();
  lang.locale = 'en';
  Object.values(api).forEach((fn) => fn.mockReset());
  api.devices.mockResolvedValue([]);
});

describe('Live monitor', () => {
  it('never claims the AI is connected unless aiStatus says so, and confirms a take-over before sending it', async () => {
    api.live.mockResolvedValue([live()]);
    api.devices.mockResolvedValue([{ id: 'd1' }]);
    api.control.mockResolvedValue({ ok: true });
    wrap(<LiveMonitorTab onOpenCall={vi.fn()} />);
    const card = await screen.findByRole('article', { name: 'Hans Meier' });
    expect(within(card).getByText('AI: Connecting')).toBeTruthy();
    expect(within(card).getByText('The AI is not connected to the caller yet.')).toBeTruthy();
    expect(within(card).getByText(/inferred/)).toBeTruthy();
    fireEvent.click(within(card).getByRole('button', { name: /Take over/ }));
    expect(await screen.findByText('Take over this call?')).toBeTruthy();
    expect(api.control).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Take over' }));
    await waitFor(() => expect(api.control).toHaveBeenCalledWith('0123456789abcdef01234567', 'takeover'));
  });

  it('shows the handoff banner and a pending command', async () => {
    api.live.mockResolvedValue([live({ aiStatus: 'connected', handoff: { status: 'waiting', reason: 'wants the boss', requestedAt: null }, pendingCommand: 'takeover' })]);
    wrap(<LiveMonitorTab onOpenCall={vi.fn()} />);
    expect(await screen.findByText('The caller asked to speak to a person.')).toBeTruthy();
    expect(screen.getByText('Waiting for the phone: Take over')).toBeTruthy();
    expect(screen.getByText('AI: Connected')).toBeTruthy();
  });

  it('points to the paired-phone setup when no phone is connected', async () => {
    api.live.mockResolvedValue([]);
    api.devices.mockResolvedValue([]);
    wrap(<LiveMonitorTab onOpenCall={vi.fn()} />);
    expect(await screen.findByText('No phone connected yet')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open AI Calling connections' }).getAttribute('href')).toBe('/ai-calling?tab=connections');
  });
});

describe('History', () => {
  it('lists only the SIMs phones reported and maps the choice to its slot', async () => {
    api.list.mockResolvedValue({ data: [], pagination: { page: 1, limit: 25, total: 0, pages: 0 } });
    api.devices.mockResolvedValue([{ id: 'd1', name: 'Office phone', sims: [{ slot: 0, label: '', carrier: 'Swisscom' }, { slot: 1, label: 'Business', carrier: 'Salt' }] }]);
    wrap(<HistoryTab onOpenCall={vi.fn()} />);
    await waitFor(() => expect(api.list).toHaveBeenCalled());
    const sim = await screen.findByRole('combobox', { name: 'SIM' });
    expect(within(sim).getAllByRole('option').map((o) => o.textContent)).toEqual(['All SIMs', 'Swisscom', 'Business']);
    fireEvent.change(sim, { target: { value: '1' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Answered by' }), { target: { value: 'human' } });
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ simSlot: 1, handledBy: 'human', page: 1, limit: 25, sort: 'newest' })));
    expect(await screen.findByText('No calls match these filters')).toBeTruthy();
  });
});

const settings = (over: Partial<InboundSettings> = {}): InboundSettings => ({
  enabled: false, organizationName: '', defaultRegion: 'CH', defaultAgentId: null, deviceAgents: [], answerDelaySeconds: 4, ringTimeoutSeconds: 45, maxConcurrentAiSessions: 1,
  fallbackAction: 'human', businessHours: { enabled: false, timezone: 'UTC', days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' }, outsideHoursAction: 'ai_answer',
  blockedNumbers: [], blockedAction: 'human', rules: [], leadCreation: 'ai_answered', qualification: { required: ['full_name'], anyOf: [], promoteLeadStatus: true },
  automation: { createFollowUps: true, followUpFor: [], returnMissedCalls: true, notifyMissed: true, notifyHandoff: true, notifyQualified: true, autoSendSms: false, autoSendEmail: false },
  handoffWaitSeconds: 30, aiDisclosure: true, transcriptRetentionDays: 365, version: 3, ...over,
});

describe('History without reported SIMs', () => {
  it('hides the SIM filter and flags a call that rang during another call', async () => {
    api.devices.mockResolvedValue([{ id: 'd1', name: 'Office phone', sims: [] }]);
    api.list.mockResolvedValue({ data: [live({ status: 'MISSED', outcome: 'missed', aiBlockedBy: 'call_waiting' })], pagination: { page: 1, limit: 25, total: 1, pages: 1 } });
    wrap(<HistoryTab onOpenCall={vi.fn()} />);
    expect(await screen.findByText('Call waiting')).toBeTruthy();
    expect(screen.getByTitle('Rang while the phone was in another call')).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'SIM' })).toBeNull();
  });
});

describe('Settings', () => {
  it('sends only the change with the version, and offers a reload on a 409', async () => {
    api.settings.mockResolvedValue(settings());
    api.updateSettings.mockRejectedValue({ statusCode: 409, message: 'changed elsewhere' });
    wrap(<SettingsTab />);
    fireEvent.click(await screen.findByRole('switch', { name: 'AI answers incoming calls' }));
    expect(screen.getByRole('switch', { name: 'Send SMS automatically' }).getAttribute('aria-checked')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(api.updateSettings).toHaveBeenCalledWith({ enabled: true, version: 3 }));
    expect(await screen.findByRole('button', { name: 'Reload settings' })).toBeTruthy();
  });
});

describe('Rules', () => {
  it('runs the rule tester and explains the decision', async () => {
    api.settings.mockResolvedValue(settings());
    api.testRules.mockResolvedValue({ caller: { e164: '+41791234567', presentation: 'available' }, match: { status: 'new', leadIds: [] }, decision: { action: 'human', agentId: null, ruleId: null, ruleName: 'AI answering off', reason: 'ai_answering_disabled', callerType: 'unknown_number', inBusinessHours: true, answerAfterMs: 4000 } });
    wrap(<RulesTab />);
    fireEvent.change(await screen.findByLabelText('Caller number'), { target: { value: '079 123 45 67' } });
    fireEvent.click(screen.getByRole('button', { name: 'Test' }));
    await waitFor(() => expect(api.testRules).toHaveBeenCalledWith({ number: '079 123 45 67', deviceId: null, simSlot: null, at: null }));
    expect(await screen.findByText('AI answering is off')).toBeTruthy();
    expect(screen.getByText('Let it ring for a person')).toBeTruthy();
  });
});

const detail = (over: Partial<InboundCallDetail> = {}): InboundCallDetail => ({
  ...live({ status: 'COMPLETED', aiStatus: 'ended', outcome: 'missed', answeredBy: null, lead: null, callerType: 'new' }),
  createdBy: 'u1', leadDetail: null, match: { status: 'new', candidates: [] }, handlingDetail: null, language: null,
  transcript: [], events: [], fields: [], qa: { aiQuestions: [], callerQuestions: [], unanswered: [], missingInformation: [] }, intentsDetail: null, summary: null,
  qualificationDetail: null, recommendations: [{ id: 'RETURN_MISSED_CALL', action: 'RETURN_MISSED_CALL', reason: 'The caller did not reach anyone.', status: 'pending', followUpId: null, decidedBy: null, decidedAt: null, automatic: false }],
  followUpIds: [], callback: null, handoff: null, doNotContact: false, notes: [], audio: null, codec: null,
  pendingCommand: null, error: null, processedAt: null, endReason: 'ended', transcriptStats: { turns: 0, callerTurns: 0 }, ...over,
} as InboundCallDetail);

describe('Call details', () => {
  it('shows no recording UI, offers Create lead, and asks for a lead before executing without one', async () => {
    api.get.mockResolvedValue(detail());
    api.createLead.mockResolvedValue(detail({ lead: { id: 'lead9', name: 'Hans Meier', number: 'L-9', created: true } }));
    wrap(<CallDetailDrawer callId="0123456789abcdef01234567" onClose={vi.fn()} />);
    expect(await screen.findByRole('button', { name: 'Create lead' })).toBeTruthy();
    expect(screen.queryByText(/recording|not recorded/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }));
    expect(await screen.findByText('Link this call to a lead')).toBeTruthy();
    expect(api.decideRecommendation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create lead' }));
    await waitFor(() => expect(api.createLead).toHaveBeenCalledWith('0123456789abcdef01234567', false));
    expect(await screen.findByText('Lead created from this call:')).toBeTruthy();
  });

  it('lets a person link an ambiguous caller to one candidate', async () => {
    api.get.mockResolvedValue(detail({ callerType: 'ambiguous', match: { status: 'ambiguous', candidates: [{ id: 'l1', name: 'Meier AG', number: 'L-1' }, { id: 'l2', name: 'Meier GmbH', number: 'L-2' }] } }));
    api.resolveMatch.mockResolvedValue(detail());
    wrap(<CallDetailDrawer callId="0123456789abcdef01234567" onClose={vi.fn()} />);
    const buttons = await screen.findAllByRole('button', { name: 'Link to this lead' });
    fireEvent.click(buttons[1]);
    await waitFor(() => expect(api.resolveMatch).toHaveBeenCalledWith('0123456789abcdef01234567', 'l2'));
  });

  it('renders in Arabic', async () => {
    lang.locale = 'ar';
    api.get.mockResolvedValue(detail());
    wrap(<CallDetailDrawer callId="0123456789abcdef01234567" onClose={vi.fn()} />);
    expect(await screen.findByRole('button', { name: 'إنشاء عميل محتمل' })).toBeTruthy();
  });
});
