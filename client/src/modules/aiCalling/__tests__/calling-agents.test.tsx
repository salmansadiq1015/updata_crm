// @vitest-environment jsdom
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LanguageProvider } from '@/lib/i18n/language-context';
import { leadSchema } from '@/modules/leads/schemas/lead-schemas';
import { makeLeadDTO } from '@/modules/leads/__tests__/mocks/data';
import type { CallingAgent, Campaign, PairedDevice, Question, TelephonyHealth } from '../types/ai-calling-types';

const mocks = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), assign: vi.fn(), launch: vi.fn(), prepareTest: vi.fn(), start: vi.fn(), duplicate: vi.fn(), remove: vi.fn(), images: vi.fn(), uploadImage: vi.fn(), removeImage: vi.fn(), presets: vi.fn(), leadList: vi.fn(), facets: vi.fn(), write: true }));
const connections = vi.hoisted(() => ({ phones: [] as PairedDevice[], health: { configured: true, eligible: true } as Partial<TelephonyHealth> }));
vi.mock('../services/calling-agent-api', () => ({ callingAgentApi: mocks }));
vi.mock('../services/ai-calling-api', () => ({ aiCallingApi: { start: mocks.start, listCampaigns: async () => ({ data: [], pagination: { total: 0, pages: 0 } }), telephonyHealth: async () => connections.health, runStatus: async () => ({ blockers: [], waits: [] }), languages: async () => ({ languages: [{ code: 'en', name: 'English', nativeName: 'English' }, { code: 'ur', name: 'Urdu', nativeName: 'اردو' }] }) } }));
vi.mock('../hooks/use-paired-phone', () => ({ usePairedDevices: () => ({ data: connections.phones, refetch: vi.fn() }) }));
vi.mock('../hooks/use-ai-calling-realtime', () => ({ useAiCallingRealtime() {} }));
vi.mock('@/shared/hooks/use-permissions', () => ({ usePermissions: () => ({ isAdmin: false, hasPermission: () => mocks.write }) }));
vi.mock('@/modules/leads/services/lead-api', () => ({ leadApi: { listLeads: mocks.leadList, getFilterOptions: mocks.facets } }));
vi.mock('@/lib/toast', () => ({ showError: vi.fn(), showSuccess: vi.fn() }));
vi.mock('../ui/campaign-detail-drawer', () => ({ CampaignDetailDrawer: ({ campaignId }: { campaignId: string }) => <div>Monitoring {campaignId}</div> }));
vi.mock('../ui/paired-phones-panel', () => ({ PairedPhonesPanel: () => <p>Paired phones</p> }));
vi.mock('../ui/voice-kill-switch', () => ({ VoiceKillSwitch: () => null }));
vi.mock('../ui/link-kill-switch', () => ({ LinkKillSwitch: () => null }));
vi.mock('../ui/call-history-panel', () => ({ CallHistoryPanel: () => <p>Production call records</p> }));
vi.mock('../ui/analytics-panel', () => ({ AnalyticsPanel: () => <p>Actual analytics</p> }));
vi.mock('../ui/agent-test-studio', () => ({ AgentTestLauncher: () => null, AgentTestStudio: () => <div role="dialog" aria-label="Saved agent browser test">Browser voice test</div> }));
vi.mock('../ui/campaign-wizard', () => ({ CampaignWizard: () => null }));

const { CallingAgentPlatform } = await import('../ui/calling-agent-platform');
const { CallingAgentWorkspace, agentStartBlocker } = await import('../ui/calling-agent-workspace');
const { launchLeadBlocker } = await import('../ui/agent-launch-dialog');
const { AssignLeadsToAgentDialog } = await import('../ui/assign-leads-to-agent-dialog');
const { AgentLaunchDialog } = await import('../ui/agent-launch-dialog');
const { AgentImageGallery } = await import('../ui/agent-image-gallery');
const { AgentVoiceFields } = await import('../ui/agent-settings-fields');
const { QuestionEditor } = await import('../ui/question-configuration');

let agent: CallingAgent;
beforeEach(() => {
  vi.clearAllMocks(); mocks.write = true; sessionStorage.clear();
  connections.phones = []; connections.health = { configured: true, eligible: true };
  agent = {
    _id: 'agent-1', name: 'Sarah Sales', title: 'Qualification Agent', description: 'Qualify leads', availability: 'active', version: 1,
    agentConfig: { agentName: 'Sarah Sales', organizationName: 'Updata', voice: 'coral', language: 'en', objective: 'Qualify interest', disclosure: 'I am an AI assistant.' },
    questionnaire: { questions: [{ fieldKey: 'interest', label: 'Interest', text: 'Interested?', type: 'boolean', order: 1 }] }, statusRules: [],
    schedule: { timezone: 'Asia/Karachi', callWindow: { start: '09:00', end: '17:00' }, daysOfWeek: [1, 2, 3, 4, 5] },
    assignedLeadIds: ['lead-1'], avatarUrl: null, readiness: { ready: true, missing: [] },
    eligibility: { total: 1, found: 1, unavailable: 0, eligible: 1, reasonCounts: {}, leads: [{ leadId: 'lead-1', name: 'Customer', phone: '+923001234567', status: 'new', eligible: true, reasons: [] }] },
    metrics: { campaigns: 0, activeCampaigns: 0, completed: 0, answered: 0, inProgress: 0, failed: 0, qualified: 0, noAnswer: 0, totalCallSeconds: 0 },
    latestCampaign: null, lastActiveAt: null, createdAt: '2026-10-28T09:00:00Z', updatedAt: '2026-10-28T09:00:00Z',
  };
  mocks.list.mockImplementation(async () => ({ data: [agent], pagination: { page: 1, limit: 24, total: 1, pages: 1 }, summary: { agents: 1, activeCampaigns: 0, inProgress: 0, completed: 0, eligible: 1 } }));
  mocks.get.mockImplementation(async () => agent);
  mocks.create.mockImplementation(async input => { agent = { ...agent, ...input, _id: 'new-agent' }; return agent; });
  mocks.update.mockImplementation(async (_id, input) => { agent = { ...agent, ...input, version: agent.version + 1 }; return agent; });
  mocks.assign.mockImplementation(async (_id, leadIds, _version, mode) => { agent = { ...agent, assignedLeadIds: mode === 'add' ? [...new Set([...agent.assignedLeadIds, ...leadIds])] : leadIds, version: agent.version + 1 }; return agent; });
  mocks.leadList.mockResolvedValue({ data: [], pagination: { hasNext: false, nextCursor: null, total: 0 } });
  mocks.facets.mockResolvedValue({ countries: [{ id: 'country:CH', value: 'Switzerland' }], cities: [], areas: [], businessTypes: [], types: [] });
  mocks.launch.mockResolvedValue({ _id: 'campaign-1', status: 'running' });
  mocks.start.mockResolvedValue({ _id: 'existing-campaign', status: 'running', runMode: 'immediate' });
  mocks.presets.mockResolvedValue([{ _id: 'preset:aria', presetId: 'aria', name: 'Aria', category: 'people', description: 'Warm, confident', url: '/avatars/agents/aria-v1.webp' }, { _id: 'preset:orbit', presetId: 'orbit', name: 'Orbit', category: 'ai', url: '/avatars/agents/orbit-v1.webp' }]);
  mocks.images.mockResolvedValue({ data: [], pagination: { page: 1, total: 0, pages: 0 } });
});
function open(element: React.ReactNode, client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })) {
  return render(<LanguageProvider initialLocale="en"><QueryClientProvider client={client}>{element}</QueryClientProvider></LanguageProvider>);
}

describe('agent-first calling UI', () => {
  it('opens the requested agent directly and returns to the gallery', async () => {
    open(<CallingAgentPlatform initialAgentId="agent-1" />);
    expect(await screen.findByRole('heading', { name: 'Sarah Sales' })).toBeVisible();
    expect(mocks.get).toHaveBeenCalledWith('agent-1');
    fireEvent.click(screen.getByRole('button', { name: 'Back to Calling Agents' }));
    expect(await screen.findByRole('button', { name: 'Open Sarah Sales' })).toBeVisible();
  });

  it('assigns searched and filtered leads during creation and saves them in the creation request', async () => {
    const first = leadSchema.parse(makeLeadDTO({ id: 'chosen-1', name: 'First customer' }));
    const second = leadSchema.parse(makeLeadDTO({ id: 'chosen-2', name: 'No phone customer', phone: null, mobile: null }));
    mocks.leadList.mockResolvedValue({ data: [first, second], pagination: { hasNext: false, nextCursor: null, total: 2 } });
    open(<CallingAgentPlatform />);
    fireEvent.click(screen.getByRole('button', { name: 'Create Agent' }));
    fireEvent.change(await screen.findByLabelText('Agent name *'), { target: { value: 'Intake' } });
    fireEvent.mouseDown(screen.getByRole('tab', { name: /4 · Assign leads/ }), { button: 0, ctrlKey: false });
    await screen.findByRole('option', { name: 'Switzerland' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Country' }), { target: { value: 'country:CH' } });
    fireEvent.change(screen.getByLabelText('Search leads'), { target: { value: 'customer' } });
    await waitFor(() => expect(mocks.leadList).toHaveBeenCalledWith(expect.objectContaining({ q: 'customer', countryId: 'country:CH' })));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select First customer' }));
    const noPhone = screen.getByRole('checkbox', { name: 'Select No phone customer' }); expect(noPhone).toBeEnabled(); fireEvent.click(noPhone);
    fireEvent.mouseDown(screen.getByRole('tab', { name: /1 · Identity/ }), { button: 0, ctrlKey: false });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Intake', assignedLeadIds: ['chosen-1', 'chosen-2'] })));
    expect(mocks.launch).not.toHaveBeenCalled();
  });

  it('opens lead assignment directly from an agent card', async () => {
    open(<CallingAgentPlatform />);
    fireEvent.click(await screen.findByRole('button', { name: 'Assign leads to Sarah Sales' }));
    expect(await screen.findByRole('heading', { name: 'Assign leads' })).toBeTruthy();
    expect(screen.getByLabelText('Search leads')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Leads' })).toHaveAttribute('data-state', 'active');
  });

  it('opens an agent active campaign instead of disabling its main action or allocating a duplicate', async () => {
    agent.metrics.activeCampaigns = 1;
    agent.latestCampaign = { _id: 'existing-campaign', status: 'running', runMode: 'immediate', waitReason: 'calling_hours' } as CallingAgent['latestCampaign'];
    open(<CallingAgentPlatform />);
    const button = await screen.findByRole('button', { name: 'Open active campaign' });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(await screen.findByText('Monitoring existing-campaign')).toBeTruthy();
    expect(mocks.launch).not.toHaveBeenCalled();
  });

  it('starts a waiting campaign directly from the workspace and prevents duplicate clicks', async () => {
    agent.metrics.activeCampaigns = 1;
    agent.latestCampaign = {
      _id: 'existing-campaign', name: 'Waiting run', status: 'running', runMode: 'immediate', waitReason: 'calling_hours',
      schedule: agent.schedule, summary: { total: 1, queued: 1, inProgress: 0 },
    } as Campaign;
    let finish: (value: Campaign) => void = () => {};
    mocks.start.mockImplementationOnce(() => new Promise<Campaign>(resolve => { finish = resolve; }));
    const onCampaign = vi.fn(); const onLaunch = vi.fn();
    open(<CallingAgentWorkspace id={agent._id} onBack={() => {}} onLaunch={onLaunch} onCampaign={onCampaign} />);
    const button = await screen.findByRole('button', { name: 'Start Now' });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() => expect(mocks.start).toHaveBeenCalledWith('existing-campaign', null, true));
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(mocks.start).toHaveBeenCalledTimes(1);
    finish({ ...agent.latestCampaign, waitReason: null } as Campaign);
    await waitFor(() => expect(onCampaign).toHaveBeenCalledWith('existing-campaign'));
    expect(onLaunch).not.toHaveBeenCalled(); expect(mocks.launch).not.toHaveBeenCalled();
  });

  it('can start a future scheduled campaign now from the agent header', async () => {
    agent.metrics.activeCampaigns = 1;
    agent.latestCampaign = {
      _id: 'existing-campaign', name: 'Future run', status: 'scheduled', runMode: 'scheduled',
      scheduledAt: '2030-11-04T04:00:00.000Z', schedule: agent.schedule, summary: { total: 1, inProgress: 0 },
    } as Campaign;
    const onCampaign = vi.fn();
    open(<CallingAgentWorkspace id={agent._id} onBack={() => {}} onLaunch={vi.fn()} onCampaign={onCampaign} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start Now' }));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledWith('existing-campaign', null, true));
    expect(onCampaign).toHaveBeenCalledWith('existing-campaign');
  });

  it('keeps a running call accessible without starting another attempt', async () => {
    agent.metrics.activeCampaigns = 1; agent.metrics.inProgress = 1;
    agent.latestCampaign = {
      _id: 'existing-campaign', name: 'Current call', status: 'running', runMode: 'immediate',
      schedule: agent.schedule, summary: { total: 1, inProgress: 1 },
    } as Campaign;
    const onCampaign = vi.fn();
    open(<CallingAgentWorkspace id={agent._id} onBack={() => {}} onLaunch={vi.fn()} onCampaign={onCampaign} />);
    const button = await screen.findByRole('button', { name: 'Calling now' });
    expect(button).toBeEnabled(); fireEvent.click(button);
    expect(onCampaign).toHaveBeenCalledWith('existing-campaign');
    expect(mocks.start).not.toHaveBeenCalled(); expect(mocks.launch).not.toHaveBeenCalled();
  });

  it('adds selected CRM leads to a specific agent, preserves prior assignments, and retries failures without launching', async () => {
    const assigned = vi.fn(); open(<AssignLeadsToAgentDialog leadIds={['lead-new', 'lead-new']} onClose={() => {}} onAssigned={assigned} />);
    fireEvent.click(await screen.findByRole('radio', { name: 'Select Sarah Sales' }));
    expect(await screen.findByText('1 new · 0 already assigned · 2 total after assignment')).toBeTruthy();
    mocks.assign.mockRejectedValueOnce(new Error('Reload and retry'));
    fireEvent.click(screen.getByRole('button', { name: 'Assign 1 lead' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Reload and retry');
    expect(assigned).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Assign 1 lead' }));
    await waitFor(() => expect(assigned).toHaveBeenCalledOnce());
    expect(mocks.assign).toHaveBeenCalledWith('agent-1', ['lead-new'], 1, 'add');
    expect(agent.assignedLeadIds).toEqual(['lead-1', 'lead-new']); expect(mocks.launch).not.toHaveBeenCalled();
  });

  it('shows premium avatars in an empty library, filters them and preserves private uploads separately', async () => {
    const select = vi.fn(); open(<AgentImageGallery onClose={() => {}} onSelect={select} />);
    expect(await screen.findByRole('button', { name: 'Preview Aria' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'AI companions' }));
    expect(screen.queryByRole('button', { name: 'Preview Aria' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Preview Orbit' }));
    expect(select).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Use as avatar' }));
    expect(select).toHaveBeenCalledWith(expect.objectContaining({ presetId: 'orbit' }));
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'My uploads' }), { button: 0, ctrlKey: false });
    expect(await screen.findByText('Upload your first image to build your avatar gallery.')).toBeTruthy();
  });

  it('uses the agent gallery as the landing screen and separates call history and infrastructure into tabs', async () => {
    open(<CallingAgentPlatform />);
    expect(await screen.findByRole('button', { name: 'Open Sarah Sales' })).toBeTruthy();
    expect(screen.queryByText('Paired phones')).toBeNull();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Call History' }), { button: 0, ctrlKey: false });
    expect(await screen.findByText('Production call records')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open Sarah Sales' })).toBeNull();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Connections' }), { button: 0, ctrlKey: false });
    expect(await screen.findByText('Paired phones')).toBeTruthy();
  });

  it('creates an independent draft and opens its tabbed workspace without launching or requiring leads', async () => {
    open(<CallingAgentPlatform />);
    fireEvent.click(screen.getByRole('button', { name: 'Create Agent' }));
    fireEvent.change(await screen.findByLabelText('Agent name *'), { target: { value: 'Follow-up agent' } });
    fireEvent.change(screen.getByLabelText('Title / role'), { target: { value: 'Follow-up specialist' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Follow-up agent', availability: 'draft', questionnaire: { questions: [] } })));
    expect(await screen.findByRole('tab', { name: 'Questions' })).toBeTruthy();
    expect(mocks.launch).not.toHaveBeenCalled();
  });

  it('saves the conversation language from identity settings and shares it with voice settings', async () => {
    open(<CallingAgentPlatform initialAgentId="agent-1" />);
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Settings' }), { button: 0, ctrlKey: false });
    const picker = await screen.findByRole('button', { name: 'Conversation language' });
    await waitFor(() => expect(picker).toBeEnabled());
    expect(picker).toHaveTextContent('English');
    fireEvent.click(picker);
    fireEvent.click(await screen.findByRole('button', { name: /Urdu/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith('agent-1', expect.objectContaining({
      agentConfig: expect.objectContaining({ language: 'ur', voice: 'coral', objective: 'Qualify interest' }),
    })));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled());
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Voice & instructions' }), { button: 0, ctrlKey: false });
    expect(screen.getByRole('button', { name: 'Conversation language' })).toHaveTextContent('Urdu');
  });

  it('saves questions through the agent API and protects unsaved settings when switching tabs', async () => {
    open(<CallingAgentPlatform />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Sarah Sales' }));
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Questions' }), { button: 0, ctrlKey: false });
    fireEvent.change(screen.getByLabelText('Question 1 text'), { target: { value: 'Would you like a callback?' } });
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Settings' }), { button: 0, ctrlKey: false });
    expect(screen.getByRole('alert')).toHaveTextContent('unsaved changes');
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save questions' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith('agent-1', expect.objectContaining({ version: 1, questionnaire: { questions: [expect.objectContaining({ text: 'Would you like a callback?' })] } })));
  });

  it('can clear stale assignments after all assigned CRM leads become unavailable', async () => {
    agent.eligibility = { total: 1, found: 0, unavailable: 1, eligible: 0, reasonCounts: {}, leads: [] };
    open(<CallingAgentPlatform />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Sarah Sales' }));
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Leads' }), { button: 0, ctrlKey: false });
    const review = screen.getByRole('button', { name: 'Review 0 assignments' });
    expect(review).toBeEnabled(); fireEvent.click(review);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm assignments' }));
    await waitFor(() => expect(mocks.assign).toHaveBeenCalledWith('agent-1', [], 1));
  });

  it('prevents read-only users from creating or launching agents', async () => {
    mocks.write = false; open(<CallingAgentPlatform />);
    expect(screen.getByRole('button', { name: 'Create Agent' })).toBeDisabled();
    expect(await screen.findByRole('button', { name: 'Start Campaign' })).toBeDisabled();
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.launch).not.toHaveBeenCalled();
  });

  it('starts immediately without a launch date and keeps one stable key during request retries', async () => {
    let reject: (reason: Error) => void = () => {};
    mocks.launch.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    const onLaunched = vi.fn(); open(<AgentLaunchDialog agent={agent} onClose={() => {}} onLaunched={onLaunched} />);
    expect(screen.queryByLabelText(/Launch date and time/)).toBeNull();
    const button = screen.getByRole('button', { name: 'Start Now' }); await waitFor(() => expect(button).toBeEnabled()); fireEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled()); fireEvent.click(button);
    expect(mocks.launch).toHaveBeenCalledTimes(1);
    reject(new Error('Temporary network error'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Temporary network error');
    fireEvent.click(screen.getByRole('button', { name: 'Start Now' }));
    await waitFor(() => expect(onLaunched).toHaveBeenCalledWith('campaign-1'));
    const first = mocks.launch.mock.calls[0][1]; const second = mocks.launch.mock.calls[1][1];
    expect(first.idempotencyKey).toBe(second.idempotencyKey); expect(first.mode).toBe('now'); expect(first.scheduledAt).toBeNull();
  });

  it('converts a scheduled wall-clock launch in the selected timezone and includes continuation settings', async () => {
    open(<AgentLaunchDialog agent={agent} onClose={() => {}} onLaunched={() => {}} />);
    fireEvent.click(screen.getByRole('radio', { name: /Schedule Campaign/ }));
    fireEvent.change(screen.getByLabelText(/Launch date and time/), { target: { value: '2030-11-04T09:15' } });
    fireEvent.click(screen.getByLabelText(/Continue unfinished leads/));
    fireEvent.change(screen.getByLabelText('Last calling date (optional)'), { target: { value: '2030-11-08' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Schedule Campaign' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Schedule Campaign' }));
    await waitFor(() => expect(mocks.launch).toHaveBeenCalledWith('agent-1', expect.objectContaining({ mode: 'scheduled', scheduledAt: '2030-11-04T04:15:00.000Z', continueAcrossDays: true, executionEndsAt: '2030-11-08T12:00:00.000Z' })));
  });

  it('offers the ESP32 phone route when SIP is unavailable and launches with that explicit selection', async () => {
    connections.health = { configured: false, eligible: false, reason: 'no_sip_trunk', livekitReady: true };
    connections.phones = [{ id: 'phone-1', name: 'My phone bridge', revoked: false, online: true,
      lastHeartbeatAt: new Date().toISOString(), audioVerified: true, board: { connected: true }, state: { hfp: 'slc' },
    } as PairedDevice];
    agent.transport = 'cloud_sip';
    open(<AgentLaunchDialog agent={agent} onClose={() => {}} onLaunched={() => {}} />);
    const usePhone = await screen.findByRole('button', { name: 'Use My phone bridge' });
    expect(screen.getByRole('button', { name: 'Start Now' })).toBeDisabled();
    fireEvent.click(usePhone);
    expect(screen.getByLabelText('Paired phone')).toHaveValue('phone-1');
    expect(screen.getByRole('status', { name: 'Calling connection status' })).toHaveTextContent('Connected');
    for (const name of ['Computer connection', 'ESP32 USB connection', 'Phone Bluetooth connection']) {
      expect(screen.getByRole('group', { name })).toHaveTextContent('Connected');
    }
    fireEvent.click(screen.getByRole('button', { name: 'Start Now' }));
    await waitFor(() => expect(mocks.launch).toHaveBeenCalledWith('agent-1', expect.objectContaining({ transport: 'paired_phone', pairedDeviceId: 'phone-1' })));
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('explains an offline gateway and provides a direct way to open Connections', async () => {
    agent.transport = 'paired_phone'; agent.pairedDeviceId = 'phone-1';
    connections.phones = [{ id: 'phone-1', name: 'My phone bridge', revoked: false, online: false,
      lastHeartbeatAt: new Date().toISOString(), audioVerified: true, board: { connected: true }, state: { hfp: 'slc' },
    } as PairedDevice];
    const onConnections = vi.fn();
    open(<AgentLaunchDialog agent={agent} onClose={() => {}} onLaunched={() => {}} onConnections={onConnections} />);
    expect(await screen.findByText(/computer gateway is offline/)).toBeTruthy();
    expect(screen.getByRole('status', { name: 'Calling connection status' })).toHaveTextContent('Not connected');
    expect(screen.getByRole('group', { name: 'Computer connection' })).toHaveTextContent('Not connected');
    expect(screen.getByRole('group', { name: 'ESP32 USB connection' })).toHaveTextContent('Status unavailable');
    expect(screen.getByRole('group', { name: 'Phone Bluetooth connection' })).toHaveTextContent('Status unavailable');
    expect(screen.getByRole('button', { name: 'Start Now' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Open Connections' }));
    expect(onConnections).toHaveBeenCalledOnce(); expect(mocks.launch).not.toHaveBeenCalled();
  });

  it('validates image uploads and previews an uploaded avatar before selection', async () => {
    const image = { _id: 'image-1', name: 'Avatar', url: 'https://storage.test/avatar.webp', size: 100, createdAt: '2026-10-28' };
    mocks.uploadImage.mockResolvedValue(image); const select = vi.fn();
    open(<AgentImageGallery onClose={() => {}} onSelect={select} />);
    const input = screen.getByLabelText('Upload avatar image');
    fireEvent.change(input, { target: { files: [new File(['bad'], 'bad.svg', { type: 'image/svg+xml' })] } });
    expect(screen.getByRole('alert')).toHaveTextContent('up to 5 MB'); expect(mocks.uploadImage).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { files: [new File(['png'], 'avatar.png', { type: 'image/png' })] } });
    expect(await screen.findByAltText('Avatar preview')).toBeTruthy(); expect(select).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Use as avatar' })); expect(select).toHaveBeenCalledWith(image);
  });

  it('does not offer audio capture without a configured recording integration', () => {
    open(<AgentVoiceFields value={agent.agentConfig} onChange={() => {}} />);
    expect(screen.getByRole('checkbox', { name: /Call recording/ })).toBeDisabled();
  });

  it('reorders questions and preserves question keys and answer semantics', () => {
    function Harness() { const [questions, setQuestions] = useState<Question[]>([{ fieldKey: 'first', label: 'First', text: 'First question?', type: 'boolean', required: true }, { fieldKey: 'second', label: 'Second', text: 'Second question?', type: 'short_text' }]); return <QuestionEditor questions={questions} onChange={setQuestions} />; }
    open(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Move question 2 up' }));
    expect(screen.getByLabelText('Question 1 text')).toHaveValue('Second question?');
    expect(screen.getByLabelText('Question 2 answer type')).toHaveValue('boolean');
    expect(within(screen.getByLabelText('Question 2 text').closest('.space-y-2')!).getByLabelText('Required')).toBeChecked();
  });
});


describe('agent header browser testing', () => {
  it('prepares the saved agent snapshot without launching a calling campaign', async () => {
    mocks.prepareTest.mockResolvedValue({ _id: 'test-snapshot', agentConfig: agent.agentConfig });
    open(<CallingAgentWorkspace id={agent._id} onBack={() => {}} onLaunch={vi.fn()} onCampaign={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Test agent' }));
    expect(await screen.findByRole('dialog', { name: 'Saved agent browser test' })).toBeVisible();
    expect(mocks.prepareTest).toHaveBeenCalledWith(agent._id);
    expect(mocks.launch).not.toHaveBeenCalled(); expect(mocks.start).not.toHaveBeenCalled();
  });
  it('keeps browser testing unavailable to read-only users', async () => {
    mocks.write = false;
    open(<CallingAgentWorkspace id={agent._id} onBack={() => {}} onLaunch={vi.fn()} onCampaign={vi.fn()} />);
    await screen.findByRole('heading', { name: agent.name });
    expect(screen.queryByRole('button', { name: 'Test agent' })).toBeNull();
  });
});

describe('testing an agent without leads', () => {
  it('opens the browser test for an agent with no assigned leads and says no lead is needed', async () => {
    agent.assignedLeadIds = [];
    agent.eligibility = { total: 0, found: 0, unavailable: 0, eligible: 0, reasonCounts: {}, leads: [] };
    mocks.prepareTest.mockResolvedValue({ _id: 'test-snapshot', isTest: true, testContext: 'test_contact', name: 'Agent · browser test', channel: 'voice', summary: { total: 1 }, agentConfig: agent.agentConfig, questionnaire: agent.questionnaire });
    open(<CallingAgentWorkspace id={agent._id} onBack={() => {}} onLaunch={vi.fn()} onCampaign={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Test agent' }));
    expect(await screen.findByRole('dialog', { name: 'Saved agent browser test' })).toBeVisible();
    expect(mocks.prepareTest).toHaveBeenCalledWith(agent._id);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(mocks.launch).not.toHaveBeenCalled(); expect(mocks.start).not.toHaveBeenCalled();
  });
});

describe('start blockers explain the next step', () => {
  it('names the exact setting for a draft agent and offers the lead-free test', () => {
    expect(agentStartBlocker({ availability: 'draft', readiness: { ready: true, missing: [] } })).toMatch(/draft.*Settings → Identity.*Agent availability.*Test agent/);
    expect(agentStartBlocker({ availability: 'active', readiness: { ready: true, missing: [] } })).toBeNull();
    expect(agentStartBlocker({ availability: 'active', readiness: { ready: false, missing: ['Voice'] } })).toMatch(/Finish setup first: Voice/);
  });
  it('says why no lead can be called, consent first, and when leads are missing', () => {
    expect(launchLeadBlocker({ assignedLeadIds: [], eligibility: { total: 0, found: 0, unavailable: 0, eligible: 0, reasonCounts: {}, leads: [] } })).toMatch(/No leads are assigned yet/);
    expect(launchLeadBlocker({ assignedLeadIds: ['l1'], eligibility: { total: 1, found: 1, unavailable: 0, eligible: 0, reasonCounts: { consent_required: 1 }, leads: [] } }))
      .toMatch(/None of the 1 assigned lead can be called yet: 1 lead has no valid call consent.*record verified consent/);
    expect(launchLeadBlocker({ assignedLeadIds: ['l1'], eligibility: { total: 1, found: 1, unavailable: 0, eligible: 1, reasonCounts: {}, leads: [] } })).toBeNull();
    expect(launchLeadBlocker({ assignedLeadIds: ['l1', 'l2'], eligibility: { total: 2, found: 2, unavailable: 0, eligible: 0, reasonCounts: { consent_revoked: 1, missing_phone: 1 }, leads: [] } }))
      .toMatch(/None of the 2 assigned leads can be called yet: 1 lead has asked not to be called \(consent revoked\); 1 lead has no valid phone number/);
  });
});

describe('browser test assignment recovery', () => {
  it('clears an earlier browser-test error after saving a lead assignment', async () => {
    agent.assignedLeadIds = [];
    agent.eligibility = { total: 0, found: 0, unavailable: 0, eligible: 0, reasonCounts: {}, leads: [] };
    const selected = leadSchema.parse(makeLeadDTO({ id: 'new-test-lead', name: 'Browser test contact' }));
    mocks.leadList.mockResolvedValue({ data: [selected], pagination: { hasNext: false, nextCursor: null, total: 1 } });
    mocks.prepareTest.mockRejectedValueOnce(new Error('Add at least one question in the Questions tab before testing this agent.'));
    open(<CallingAgentWorkspace id={agent._id} onBack={() => {}} onLaunch={vi.fn()} onCampaign={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Test agent' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Add at least one question');
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Leads' }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Browser test contact' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review 1 assignments' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm assignments' }));
    await waitFor(() => expect(mocks.assign).toHaveBeenCalledWith('agent-1', ['new-test-lead'], 1));
    await waitFor(() => expect(screen.queryByText('Add at least one question in the Questions tab before testing this agent.')).toBeNull());
    expect(mocks.launch).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });
});


describe('agent workspace refresh recovery', () => {
  it('clears an obsolete test error when the saved agent version changes and can retry the browser test', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mocks.prepareTest.mockRejectedValueOnce(new Error('Add at least one question in the Questions tab before testing this agent.'));
    open(<CallingAgentWorkspace id={agent._id} onBack={vi.fn()} onLaunch={vi.fn()} onCampaign={vi.fn()} />, client);
    fireEvent.click(await screen.findByRole('button', { name: 'Test agent' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Add at least one question');
    act(() => client.setQueryData(['ai-calling', 'agent', agent._id], { ...agent }));
    expect(screen.getByRole('alert')).toHaveTextContent('Add at least one question');
    agent = { ...agent, version: 2 };
    act(() => client.setQueryData(['ai-calling', 'agent', agent._id], agent));
    await waitFor(() => expect(screen.queryByText('Add at least one question in the Questions tab before testing this agent.')).toBeNull());
    mocks.prepareTest.mockResolvedValueOnce({ _id: 'test-snapshot', agentConfig: agent.agentConfig });
    fireEvent.click(screen.getByRole('button', { name: 'Test agent' }));
    expect(await screen.findByRole('dialog', { name: 'Saved agent browser test' })).toBeVisible();
    expect(mocks.launch).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it('refreshes pristine settings when polling returns a newer agent version', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    open(<CallingAgentWorkspace id={agent._id} initialTab="settings" onBack={vi.fn()} onLaunch={vi.fn()} onCampaign={vi.fn()} />, client);
    expect(await screen.findByLabelText('Agent name *')).toHaveValue('Sarah Sales');
    agent = { ...agent, version: 2, name: 'Updated agent' };
    act(() => client.setQueryData(['ai-calling', 'agent', agent._id], agent));
    await waitFor(() => expect(screen.getByLabelText('Agent name *')).toHaveValue('Updated agent'));
    expect(screen.queryByText(/changed since you opened/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled();
  });

  it('preserves unsaved settings, blocks stale saves and lets the user explicitly load the new version', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    open(<CallingAgentWorkspace id={agent._id} initialTab="settings" onBack={vi.fn()} onLaunch={vi.fn()} onCampaign={vi.fn()} />, client);
    fireEvent.change(await screen.findByLabelText('Agent name *'), { target: { value: 'Local draft' } });
    agent = { ...agent, version: 2, name: 'Updated agent' };
    act(() => client.setQueryData(['ai-calling', 'agent', agent._id], agent));
    expect(screen.getByLabelText('Agent name *')).toHaveValue('Local draft');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled());
    expect(mocks.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Discard edits and load latest settings' }));
    expect(screen.getByLabelText('Agent name *')).toHaveValue('Updated agent');
    expect(screen.queryByText(/changed since you opened/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Agent name *'), { target: { value: 'Current draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith('agent-1', expect.objectContaining({ version: 2, name: 'Current draft' })));
  });
});
