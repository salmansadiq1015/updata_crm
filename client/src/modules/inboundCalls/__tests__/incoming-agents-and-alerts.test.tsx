// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';
import { inboundCallsTranslations } from '@/lib/i18n/inbound-calls-translations';
import type { InboundSettings } from '../types/inbound-call-types';

vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => {
    const dict = inboundCallsTranslations.en as Record<string, string>;
    const t = (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const v = vars ?? (typeof fallback === 'object' ? fallback : undefined);
      const raw = dict[key] ?? (typeof fallback === 'string' ? fallback : key);
      return raw.replace(/\{(\w+)\}/g, (_m: string, k: string) => (v?.[k] != null ? String(v[k]) : `{${k}}`));
    };
    return { t, locale: 'en', isRTL: false };
  },
  useOptionalLanguage: () => null,
}));
vi.mock('next/link', () => ({ default: ({ href, children, onClick, ...rest }: { href: string; children: ReactNode; onClick?: () => void }) => <a href={href} onClick={(e) => { e.preventDefault(); onClick?.(); }} {...rest}>{children}</a> }));
vi.mock('@/lib/toast', () => ({ showError: vi.fn(), showSuccess: vi.fn() }));
const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { custom: vi.fn(), dismiss: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: toastMock }));
const sockets = vi.hoisted(() => ({ handlers: new Map<string, (p: unknown) => void>() }));
vi.mock('@/lib/socket/client', () => ({
  onSocketConnect: (fn: (s: unknown) => void) => {
    fn({ on: (e: string, h: (p: unknown) => void) => sockets.handlers.set(e, h), off: vi.fn() });
    return () => {};
  },
}));
vi.mock('@/shared/hooks/use-permissions', () => ({ usePermissions: () => ({ hasPermission: (p: string) => p === 'inbound-calls:read', isAdmin: false }) }));
const agents = vi.hoisted(() => ({
  list: [] as unknown[], update: vi.fn(), duplicate: vi.fn(), create: vi.fn(),
}));
vi.mock('@/modules/aiCalling/hooks/use-calling-agents', () => ({
  useAllCallingAgents: () => ({ data: agents.list, isLoading: false }),
  useCallingAgents: (filters: Record<string, unknown>) => ({ data: { data: filters.usage === 'inbound' ? agents.list : [], pagination: { page: 1, limit: 24, total: agents.list.length, pages: 1 } }, isLoading: false, isError: false, refetch: vi.fn() }),
  useAgentMutations: () => ({ update: { mutateAsync: agents.update, isPending: false }, duplicate: { mutateAsync: agents.duplicate, isPending: false }, create: { mutateAsync: agents.create, isPending: false } }),
}));
const api = vi.hoisted(() => ({
  list: vi.fn(), stats: vi.fn(), analytics: vi.fn(), live: vi.fn(), exportCsv: vi.fn(), devices: vi.fn(), settings: vi.fn(), updateSettings: vi.fn(),
  saveRule: vi.fn(), deleteRule: vi.fn(), testRules: vi.fn(), get: vi.fn(), addNote: vi.fn(), reviewField: vi.fn(), resolveMatch: vi.fn(), createLead: vi.fn(),
  decideRecommendation: vi.fn(), scheduleFollowUp: vi.fn(), control: vi.fn(), forLead: vi.fn(),
}));
vi.mock('../services/inbound-calls-api', () => ({ inboundCallsApi: api }));

const { AgentsTab } = await import('../ui/agents-tab');
const { SettingsTab } = await import('../ui/settings-tab');
const { InboundHandoffAlertHost, handoffToastId } = await import('../ui/handoff-alert-host');
const { incomingAgentDraft, incomingAgentPayload } = await import('../ui/incoming-agent-editor');

const wrap = (ui: ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

const settings = (over: Partial<InboundSettings> = {}): InboundSettings => ({
  enabled: true, organizationName: 'Updata', defaultRegion: 'CH', defaultAgentId: 'nova', deviceAgents: [{ deviceId: 'd1', simSlot: 1, agentId: 'lia', aiEnabled: true }], answerDelaySeconds: 4,
  ringTimeoutSeconds: 45, maxConcurrentAiSessions: 1, fallbackAction: 'human', businessHours: { enabled: false, timezone: 'UTC', days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' },
  outsideHoursAction: 'ai_answer', blockedNumbers: [], blockedAction: 'human', rules: [], leadCreation: 'ai_answered', qualification: { required: ['full_name'], anyOf: [], promoteLeadStatus: true },
  automation: { createFollowUps: true, followUpFor: [], returnMissedCalls: true, notifyMissed: true, notifyHandoff: true, notifyQualified: true, autoSendSms: false, autoSendEmail: false },
  handoffWaitSeconds: 30, aiDisclosure: true, transcriptRetentionDays: 365, version: 5, ...over,
});
const agent = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  _id: id, name, title: 'Receptionist', description: '', availability: 'active', usage: 'inbound', version: 2, avatarUrl: null, inbound: { greeting: 'Hello' },
  readiness: { ready: true, missing: [] }, assignedLeadIds: [], metrics: {}, ...over,
});

beforeEach(() => {
  cleanup();
  Object.values(api).forEach((fn) => fn.mockReset());
  toastMock.custom.mockReset(); toastMock.dismiss.mockReset();
  sockets.handlers.clear();
  agents.update.mockReset();
  agents.list = [agent('nova', 'Nova Reception'), agent('lia', 'Lia', { readiness: { ready: false, missing: ['Company name'] } })];
  api.devices.mockResolvedValue([{ id: 'd1', name: 'Office phone', sims: [{ slot: 0, label: '', carrier: 'Swisscom' }, { slot: 1, label: 'Business', carrier: 'Salt' }], simAgents: [], aiAnswering: { ready: true, reasons: [] }, last24h: { calls: 0, answeredByAi: 0 } }]);
  api.analytics.mockResolvedValue({ summary: {}, series: [], byInquiry: [], byOutcome: [], byQualification: [], byDevice: [], bySim: [], byAgent: [{ key: 'nova', label: 'Nova Reception', count: 12, answered: 10 }], byLanguage: [], byHour: [], topServices: [] });
  api.settings.mockResolvedValue(settings());
});

describe('Agents tab', () => {
  it('shows receptionist cards with default badge, phone/SIM assignments, calls handled and readiness', async () => {
    wrap(<AgentsTab onOpenAgent={vi.fn()} />);
    const nova = await screen.findByRole('article', { name: 'Nova Reception' });
    await waitFor(() => expect(within(nova).getByText('Default agent')).toBeTruthy());
    expect(within(nova).getByText('Every phone without its own agent')).toBeTruthy();
    await waitFor(() => expect(within(nova).getByText('12')).toBeTruthy());
    const lia = screen.getByRole('article', { name: 'Lia' });
    await waitFor(() => expect(within(lia).getByText('Office phone · Business')).toBeTruthy());
    expect(within(lia).getByText('Complete: Company name')).toBeTruthy();
    expect(within(nova).queryByRole('button', { name: 'Set as default' })).toBeNull();
  });

  it('sets another agent as the default incoming agent with the settings version', async () => {
    api.updateSettings.mockResolvedValue(settings({ defaultAgentId: 'lia', version: 6 }));
    wrap(<AgentsTab onOpenAgent={vi.fn()} />);
    const lia = await screen.findByRole('article', { name: 'Lia' });
    await waitFor(() => expect(api.settings).toHaveBeenCalled());
    fireEvent.click(await within(lia).findByRole('button', { name: 'Set as default' }));
    await waitFor(() => expect(api.updateSettings).toHaveBeenCalledWith({ defaultAgentId: 'lia', version: 5 }));
  });

  it('opens an agent in the shared agent workspace', async () => {
    const open = vi.fn();
    wrap(<AgentsTab onOpenAgent={open} />);
    fireEvent.click(within(await screen.findByRole('article', { name: 'Lia' })).getByRole('button', { name: 'Open' }));
    expect(open).toHaveBeenCalledWith('lia');
  });

  it('creates incoming agents without questionnaire, optionally for campaigns too', () => {
    const draft = { ...incomingAgentDraft(), name: '  Nova  ' };
    expect(incomingAgentPayload(draft, { alsoOutbound: false, active: true })).toMatchObject({ name: 'Nova', usage: 'inbound', availability: 'active', agentConfig: { agentName: 'Nova', objective: '' }, questionnaire: { questions: [] } });
    expect(incomingAgentPayload(draft, { alsoOutbound: true, active: false })).toMatchObject({ usage: 'both', availability: 'draft' });
  });
});

describe('Settings — SIMs come from the phones', () => {
  it('lists reported SIMs by name and only "All SIMs" plus a hint for a phone whose SIMs are unknown', async () => {
    api.devices.mockResolvedValue([
      { id: 'd1', name: 'Office phone', sims: [{ slot: 0, label: '', carrier: 'Swisscom' }, { slot: 1, label: 'Business', carrier: 'Salt' }] },
      { id: 'd2', name: 'Shop phone', sims: [] },
    ]);
    wrap(<SettingsTab />);
    expect(await screen.findByRole('combobox', { name: 'Office phone · Swisscom' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Office phone · Business' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Shop phone · All SIMs' })).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: /Shop phone · SIM/ })).toBeNull();
    expect(screen.getByText('Open the Updata app on this phone to detect its SIM cards.')).toBeTruthy();
  });
});

describe('Global "caller wants a person" alert', () => {
  it('shows one persistent toast per call with caller and reason; take over is confirmed first', async () => {
    api.get.mockResolvedValue({ caller: { name: 'Hans Meier', number: '+41791234567', presentation: 'available' }, lead: null });
    api.control.mockResolvedValue({ ok: true });
    render(<InboundHandoffAlertHost />);
    act(() => sockets.handlers.get('inbound-call:handoff')?.({ callId: 'in_1', id: 'c1', reason: 'Wants the owner', waitSeconds: 30 }));
    expect(toastMock.custom).toHaveBeenCalledTimes(1);
    const [renderToast, options] = toastMock.custom.mock.calls[0] as [(item: { visible: boolean }) => ReactElement, { id: string; duration: number }];
    expect(options).toEqual({ id: handoffToastId('c1'), duration: Infinity });
    render(renderToast({ visible: true }));
    expect(screen.getByText('A caller wants to speak to a person')).toBeTruthy();
    expect(screen.getByText('“Wants the owner”')).toBeTruthy();
    expect(await screen.findByText('Hans Meier · +41791234567')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open call' }).getAttribute('href')).toBe('/incoming-calls?call=c1');
    fireEvent.click(screen.getByRole('button', { name: 'Take over' }));
    expect(api.control).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, take over' }));
    await waitFor(() => expect(api.control).toHaveBeenCalledWith('c1', 'takeover'));
    expect(toastMock.dismiss).toHaveBeenCalledWith(handoffToastId('c1'));
  });

  it('closes the alert when the call is taken over or ends', () => {
    render(<InboundHandoffAlertHost />);
    act(() => sockets.handlers.get('inbound-call:update')?.({ id: 'c1', status: 'AI_ACTIVE' }));
    expect(toastMock.dismiss).not.toHaveBeenCalled();
    act(() => sockets.handlers.get('inbound-call:update')?.({ id: 'c1', status: 'HUMAN_ACTIVE' }));
    expect(toastMock.dismiss).toHaveBeenCalledWith(handoffToastId('c1'));
  });
});
