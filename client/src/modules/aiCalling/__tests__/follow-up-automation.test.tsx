// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LanguageProvider } from '@/lib/i18n/language-context';
import type { AgentFollowUpItem, CallingAgent, FollowUpSettings } from '../types/ai-calling-types';

const api = vi.hoisted(() => ({
  settings: vi.fn(), setSettings: vi.fn(), summary: vi.fn(), agentQueue: vi.fn(), agentTypes: vi.fn(), callNow: vi.fn(), pause: vi.fn(), resume: vi.fn(),
  setEscalationRecipients: vi.fn(), campaignSummary: vi.fn(), exportCsv: vi.fn(),
}));
const download = vi.hoisted(() => ({ downloadBlob: vi.fn() }));
vi.mock('@/lib/api/download', () => download);
vi.mock('@/modules/tasks/hooks/use-workspace-users', () => ({ useWorkspaceUsers: () => ({ isLoading: false, data: [
  { id: 'u-sup', firstName: 'Sara', lastName: 'Supervisor', email: 'sara@x.test', avatarUrl: null },
  { id: 'u-ben', firstName: 'Ben', lastName: 'Lead', email: 'ben@x.test', avatarUrl: null },
] }) }));
const agentsApi = vi.hoisted(() => ({ update: vi.fn(), listAll: vi.fn() }));
const perms = vi.hoisted(() => ({ admin: false }));
vi.mock('../services/follow-up-calling-api', () => ({ followUpCallingApi: api }));
vi.mock('../services/calling-agent-api', () => ({ callingAgentApi: agentsApi }));
vi.mock('@/shared/hooks/use-permissions', () => ({ usePermissions: () => ({ isAdmin: perms.admin, hasPermission: () => true }) }));
vi.mock('@/lib/toast', () => ({ showError: vi.fn(), showSuccess: vi.fn() }));
vi.mock('../ui/question-configuration', () => ({ QuestionEditor: () => <p>Question editor</p> }));

const { AgentFollowUpAutomation, followUpDraft } = await import('../ui/agent-follow-up-automation');
const { FollowUpAutomationSwitch } = await import('../ui/follow-up-automation-switch');

let agent: CallingAgent;
let settings: FollowUpSettings;
const item = (over: Partial<AgentFollowUpItem['automation']> = {}, status = 'open'): AgentFollowUpItem => ({
  id: 'fu-1', leadId: 'lead-1', status, dueAt: '2026-11-05T10:10:00Z', nextDueAt: '2026-11-05T10:10:00Z', timezone: 'Europe/Zurich', note: null,
  lead: { id: 'lead-1', name: 'Müller AG', leadNumber: 'L-1', status: 'contacted', phone: '+41791234567' },
  automation: { mode: 'ai', agentId: 'agent-1', state: 'scheduled', reason: 'CALLBACK_REQUESTED', outcome: null, round: 1, attempts: 0, campaignId: null, callRecordId: null, previousCallId: 'c1', notBefore: null, lastError: null, instructions: null,
    timeResolution: { kind: 'part_of_day', approximate: true, requestedText: 'tomorrow morning', shiftedFrom: null }, stateChangedAt: null, history: [], call: null, ...over },
});

function open(element: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<LanguageProvider initialLocale="en"><QueryClientProvider client={client}>{element}</QueryClientProvider></LanguageProvider>);
}

beforeEach(() => {
  vi.clearAllMocks(); perms.admin = false;
  settings = { enabled: true, forcedOffByEnv: false, pausedReason: '', changedAt: null, changedBy: null, voicePaused: false };
  agent = {
    _id: 'agent-1', name: 'David', title: 'Follow-up Agent', availability: 'active', version: 3, agentType: 'follow_up', usage: 'outbound',
    agentConfig: { agentName: 'David', objective: 'Continue' }, questionnaire: { questions: [] }, statusRules: [],
    schedule: { timezone: 'Europe/Zurich' }, assignedLeadIds: [], avatarUrl: null, readiness: { ready: true, missing: [] },
    eligibility: { total: 0, found: 0, unavailable: 0, eligible: 0, reasonCounts: {}, leads: [] },
    metrics: { campaigns: 0, activeCampaigns: 0, completed: 0, answered: 0, inProgress: 0, failed: 0, qualified: 0, noAnswer: 0, totalCallSeconds: 0 },
    latestCampaign: null, lastActiveAt: null, createdAt: '', updatedAt: '',
    followUp: { enabled: true, autoCall: true, manualCall: true, triggers: ['CALLBACK_REQUESTED'] },
  } as CallingAgent;
  api.settings.mockImplementation(async () => settings);
  api.setSettings.mockImplementation(async (enabled: boolean) => { settings = { ...settings, enabled }; return settings; });
  api.summary.mockResolvedValue({ total: 3, scheduled: 2, inProgress: 1, completed: 4, requiresHuman: 1, attempts: 5, answerRate: 0.6, qualified: 2, byState: {}, byOutcome: {} });
  api.agentQueue.mockResolvedValue([item()]);
  api.agentTypes.mockResolvedValue([{ type: 'follow_up', objective: 'o', instructions: 'i', followUpInstructions: 'Continue where the last call stopped.', triggers: ['CALLBACK_REQUESTED'] }]);
  api.callNow.mockResolvedValue({}); api.pause.mockResolvedValue({}); api.resume.mockResolvedValue({});
  agentsApi.listAll.mockResolvedValue([agent, { ...agent, _id: 'agent-2', name: 'Emma', title: 'Appointment Agent', followUp: { enabled: true } }, { ...agent, _id: 'agent-3', name: 'Alex', title: '', followUp: { enabled: false } }]);
  agentsApi.update.mockImplementation(async (_id: string, input: Partial<CallingAgent>) => ({ ...agent, ...input, version: agent.version + 1 }));
});

describe('agent Follow-up Automation tab', () => {
  it('states honestly when automation is live and shows real KPIs and the queue', async () => {
    open(<AgentFollowUpAutomation agent={agent} canManage onDirty={vi.fn()} />);
    expect(await screen.findByText(/due follow-ups are called automatically/i)).toBeTruthy();
    expect(await screen.findByText('Müller AG')).toBeTruthy();
    expect(screen.getByText('Callback requested')).toBeTruthy();
    expect(screen.getByText(/Lead said: "tomorrow morning"/)).toBeTruthy();
    expect(screen.getByText('60%')).toBeTruthy();
    expect(api.agentQueue).toHaveBeenCalledWith('agent-1', 'active');
  });

  it('explains why nothing is called when the organisation switch is off', async () => {
    settings.enabled = false;
    open(<AgentFollowUpAutomation agent={agent} canManage onDirty={vi.fn()} />);
    expect(await screen.findByText(/off for the organisation/i)).toBeTruthy();
  });

  it('queue actions call the follow-up API: pause a scheduled one, resume a paused one, call now', async () => {
    open(<AgentFollowUpAutomation agent={agent} canManage onDirty={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /Pause/ }));
    await waitFor(() => expect(api.pause).toHaveBeenCalledWith('fu-1', expect.anything()));
    fireEvent.click(screen.getByRole('button', { name: /Call now/ }));
    await waitFor(() => expect(api.callNow).toHaveBeenCalledWith('fu-1', expect.anything()));
  });

  it('never offers "Call now" while a call is already in progress', async () => {
    api.agentQueue.mockResolvedValue([item({ state: 'calling' })]);
    open(<AgentFollowUpAutomation agent={agent} canManage onDirty={vi.fn()} />);
    expect(await screen.findByText('Calling')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Call now/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Pause/ })).toBeTruthy();
  });

  it('configuration saves the full follow-up config with routing, and only to agents with follow-up on', async () => {
    const onDirty = vi.fn();
    open(<AgentFollowUpAutomation agent={agent} canManage onDirty={onDirty} />);
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Configuration' }), { button: 0, ctrlKey: false });
    const triggers = await screen.findByRole('region', { name: /When another call is needed/ });
    fireEvent.click(within(triggers).getByLabelText(/Temporarily unavailable/));
    fireEvent.click(screen.getByRole('button', { name: /Use .* template/ }));
    const routing = screen.getByRole('region', { name: /Specialised agents/ }).closest('section')!;
    await waitFor(() => expect(within(routing).getAllByRole('option', { name: /Emma/ }).length).toBeGreaterThan(0));
    expect((within(routing).getAllByRole('option', { name: /Alex/ })[0] as HTMLOptionElement).disabled).toBe(true);
    fireEvent.change(within(routing).getByLabelText('Callback requested'), { target: { value: 'agent-2' } });
    expect(onDirty).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: /Save follow-up automation/ }));
    await waitFor(() => expect(agentsApi.update).toHaveBeenCalled());
    const [id, payload] = agentsApi.update.mock.calls[0];
    expect(id).toBe('agent-1');
    expect(payload.version).toBe(3);
    expect(payload.followUp).toMatchObject({ enabled: true, autoCall: true, instructions: 'Continue where the last call stopped.', routes: { CALLBACK_REQUESTED: 'agent-2' } });
    expect(payload.followUp.triggers).toEqual(expect.arrayContaining(['CALLBACK_REQUESTED', 'TEMPORARILY_UNAVAILABLE']));
    expect(payload.followUp.schedule.timezone).toBe('Europe/Zurich');
  });

  it('turning follow-up calling off also turns automatic calls off', async () => {
    open(<AgentFollowUpAutomation agent={agent} canManage onDirty={vi.fn()} />);
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Configuration' }), { button: 0, ctrlKey: false });
    const enabled = screen.getAllByRole('switch')[0] as HTMLInputElement;
    fireEvent.click(enabled);
    expect((screen.getAllByRole('switch')[1] as HTMLInputElement).checked).toBe(false);
    expect((screen.getAllByRole('switch')[1] as HTMLInputElement).disabled).toBe(true);
  });

  it('legacy agents without follow-up config get safe defaults (off) and the agent timezone', () => {
    const d = followUpDraft({ ...agent, followUp: undefined });
    expect(d).toMatchObject({ enabled: false, autoCall: false, manualCall: true, triggers: ['CALLBACK_REQUESTED'], maxRounds: 3 });
    expect(d.schedule.timezone).toBe('Europe/Zurich');
  });

  it('read-only users see the configuration but cannot change it', async () => {
    open(<AgentFollowUpAutomation agent={agent} canManage={false} onDirty={vi.fn()} />);
    expect(await screen.findByText('Müller AG')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Pause/ })).toBeNull();
  });
});

describe('organisation follow-up switch', () => {
  it('admins can turn automatic follow-up calls off and on', async () => {
    perms.admin = true;
    open(<FollowUpAutomationSwitch />);
    fireEvent.click(await screen.findByRole('button', { name: /Turn off/ }));
    await waitFor(() => expect(api.setSettings).toHaveBeenCalledWith(false, undefined));
  });

  it('a server-forced off state cannot be overridden from the UI', async () => {
    perms.admin = true; settings = { ...settings, enabled: false, forcedOffByEnv: true };
    open(<FollowUpAutomationSwitch />);
    expect(await screen.findByText(/Turned off by a server setting/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('escalation recipients, routing rules, campaign follow-up analytics', () => {
  async function openConfig() {
    open(<AgentFollowUpAutomation agent={agent} canManage onDirty={vi.fn()} />);
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Configuration' }), { button: 0, ctrlKey: false });
    await screen.findByRole('region', { name: /When a person is needed/ });
  }

  it('saves escalation recipients, who takes over and email', async () => {
    await openConfig();
    const section = screen.getByRole('region', { name: /When a person is needed/ });
    fireEvent.change(within(section).getByLabelText('Add recipient'), { target: { value: 'u-sup' } });
    expect(within(section).getByText('Sara Supervisor')).toBeTruthy();
    fireEvent.change(within(section).getByLabelText('Who takes over the follow-up'), { target: { value: 'first_recipient' } });
    fireEvent.click(within(section).getByLabelText('Also send an email'));
    fireEvent.click(screen.getByRole('button', { name: /Save follow-up automation/ }));
    await waitFor(() => expect(agentsApi.update).toHaveBeenCalled());
    expect(agentsApi.update.mock.calls[0][1].followUp.escalation).toEqual({ userIds: ['u-sup'], assignTo: 'first_recipient', email: true });
  });

  it('adds a routing rule on lead facts; country codes are normalised and invalid ones dropped', async () => {
    await openConfig();
    fireEvent.click(await screen.findByRole('button', { name: /Add rule/ }));
    const rule = screen.getByRole('group', { name: 'Rule 1' });
    fireEvent.change(within(rule).getByLabelText('Rule name'), { target: { value: 'Moroccan leads' } });
    await waitFor(() => expect(within(rule).getAllByRole('option', { name: /Emma/ }).length).toBeGreaterThan(0));
    fireEvent.change(within(rule).getByLabelText('Next conversation by'), { target: { value: 'agent-2' } });
    fireEvent.click(within(rule).getByLabelText('Incoming call'));
    const countries = within(rule).getByLabelText(/^Country/);
    fireEvent.change(countries, { target: { value: 'ma, ch, Morocco' } });
    fireEvent.blur(countries);
    expect((countries as HTMLInputElement).value).toBe('MA, CH');
    fireEvent.click(screen.getByRole('button', { name: /Save follow-up automation/ }));
    await waitFor(() => expect(agentsApi.update).toHaveBeenCalled());
    expect(agentsApi.update.mock.calls[0][1].followUp.routingRules).toEqual([
      expect.objectContaining({ name: 'Moroccan leads', agentId: 'agent-2', enabled: true, when: { leadSources: ['incoming_call'], countries: ['MA', 'CH'] } }),
    ]);
  });

  it('exports the agent\'s follow-ups as CSV', async () => {
    api.exportCsv.mockResolvedValue(new Blob(['a,b']));
    open(<AgentFollowUpAutomation agent={agent} canManage onDirty={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /Export CSV/ }));
    await waitFor(() => expect(api.exportCsv).toHaveBeenCalledWith({ agentId: 'agent-1' }));
    expect(download.downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'ai-follow-ups-david.csv', 'text/csv;charset=utf-8');
  });

  it('campaign panel shows the campaign\'s follow-up results and exports them', async () => {
    const { CampaignFollowUpsPanel } = await import('../ui/campaign-follow-ups-panel');
    api.campaignSummary.mockResolvedValue({ total: 4, scheduled: 1, inProgress: 0, completed: 2, requiresHuman: 1, callbacks: 3, attempts: 5, answerRate: 0.8, qualified: 2,
      avgAttemptsPerLead: 1.7, totalCost: 1.25, costPerQualified: 0.63, byOutcome: { COMPLETED: 2, CALLBACK_REQUESTED: 1 }, byState: {} });
    api.exportCsv.mockResolvedValue(new Blob(['x']));
    open(<CampaignFollowUpsPanel campaignId="camp-1" />);
    expect(await screen.findByText('Follow-ups created')).toBeTruthy();
    expect(screen.getByText('80%')).toBeTruthy();
    expect(screen.getByText('$0.63')).toBeTruthy();
    expect(screen.getByText(/Callback requested/).closest('li')?.textContent).toMatch(/Callback requested · 1/);
    fireEvent.click(screen.getByRole('button', { name: /Export CSV/ }));
    await waitFor(() => expect(api.exportCsv).toHaveBeenCalledWith({ campaignId: 'camp-1' }));
  });

  it('admins manage the organisation\'s default escalation recipients', async () => {
    perms.admin = true;
    api.setEscalationRecipients.mockImplementation(async (ids: string[]) => ({ ...settings, escalationUserIds: ids }));
    open(<FollowUpAutomationSwitch />);
    expect(await screen.findByText(/escalations go to the follow-up owner/)).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: 'Add recipient' }), { target: { value: 'u-ben' } });
    await waitFor(() => expect(api.setEscalationRecipients).toHaveBeenCalledWith(['u-ben']));
  });
});
