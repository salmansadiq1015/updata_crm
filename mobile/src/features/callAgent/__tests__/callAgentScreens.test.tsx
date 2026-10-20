// Call Agent screens against mocked APIs: nothing reaches a backend, nothing is started.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { aiAgentApi } from '@/features/aiAgent/api/aiAgentApi';
import { AiAgentLaunchScreen } from '@/features/aiAgent/screens/AiAgentLaunchScreen';
import { callCampaignSchema, type AgentLanguage } from '@/features/aiAgent/types';
import { leadsApi } from '@/features/leads/api/leadsApi';
import type { Lead } from '@/features/leads/types';
import type { RootScreenProps, RootStackParamList } from '@/navigation/navigationTypes';
import { renderWithProviders } from '@/test/renderWithProviders';

import { callAgentApi } from '../api/callAgentApi';
import { CallAgentLeadPickerScreen } from '../screens/CallAgentLeadPickerScreen';
import { CallAgentSettingsScreen } from '../screens/CallAgentSettingsScreen';
import { CallAgentTestScreen } from '../screens/CallAgentTestScreen';
import { savedDefaultsSchema } from '../types';

jest.mock('../api/callAgentApi', () => ({
  callAgentApi: { defaults: jest.fn(), saveDefaults: jest.fn() },
}));
jest.mock('@/features/leads/api/leadsApi');
jest.mock('@/features/aiAgent/api/aiAgentApi', () => ({
  ...jest.requireActual('@/features/aiAgent/api/aiAgentApi'),
  aiAgentApi: {
    languages: jest.fn(),
    telephonyHealth: jest.fn(),
    messagingHealth: jest.fn(),
    smsTemplates: jest.fn(),
    listCallCampaigns: jest.fn(),
    listSmsCampaigns: jest.fn(),
    createCallCampaign: jest.fn(),
    updateCallCampaign: jest.fn(),
    previewCallCampaign: jest.fn(),
    callRecipients: jest.fn(),
    startCallCampaign: jest.fn(),
    startSmsCampaign: jest.fn(),
    simulate: jest.fn(),
  },
}));

const languages: AgentLanguage[] = [
  { code: 'auto', name: 'Automatic', nativeName: 'Auto', support: 'full', rtl: false },
  { code: 'en', name: 'English', nativeName: 'English', support: 'full', rtl: false },
  { code: 'de', name: 'German', nativeName: 'Deutsch', support: 'full', rtl: false },
];

const lead = (id: string, name: string): Lead => ({
  id,
  leadNumber: null,
  name,
  type: 'business',
  status: 'new',
  source: 'manual',
  address: null,
  phone: '+41 44 123 45 67',
  mobile: null,
  email: null,
  website: null,
  mapsUrl: null,
  assignedTo: null,
  notes: null,
  tags: [],
  lastContactedAt: null,
  lastContactChannel: null,
  createdAt: null,
});
const LEADS = [
  lead('64b7f0c2a1b2c3d4e5f60701', 'Acme AG'),
  lead('64b7f0c2a1b2c3d4e5f60702', 'Beta GmbH'),
  lead('64b7f0c2a1b2c3d4e5f60703', 'Gamma SA'),
];

const saved = savedDefaultsSchema.parse({
  agentConfig: {
    agentName: 'Mia',
    organizationName: 'Acme AG',
    objective: 'Maintenance',
    language: 'de',
    voice: 'coral',
    disclosure: 'Hallo, hier spricht eine KI im Auftrag von {company}.',
  },
  questions: [
    { fieldKey: 'need', label: 'Need', text: 'What do you need?', type: 'long_text', required: true },
  ],
  schedule: {
    timezone: 'Europe/Berlin',
    callWindow: { start: '08:00', end: '17:30' },
    daysOfWeek: [1, 3, 5],
    maxAttemptsPerLead: 4,
    retryDelayMinutes: 30,
    maxCallsPerDay: 80,
  },
  sms: { purpose: 'support', templateId: null },
});

const navigation = {
  navigate: jest.fn(),
  replace: jest.fn(),
  goBack: jest.fn(),
  canGoBack: () => true,
};

function props<T extends keyof RootStackParamList>(name: T, params: RootStackParamList[T]) {
  return {
    route: { key: name, name, params } as unknown as RootScreenProps<T>['route'],
    navigation: navigation as unknown as RootScreenProps<T>['navigation'],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(callAgentApi.defaults).mockResolvedValue(null);
  jest.mocked(aiAgentApi.languages).mockResolvedValue({ languages, defaultLanguage: 'en' });
  jest.mocked(aiAgentApi.smsTemplates).mockResolvedValue([]);
  jest
    .mocked(aiAgentApi.telephonyHealth)
    .mockResolvedValue({ configured: false, livekitReady: true, reason: 'no_sip_trunk' });
  jest.mocked(aiAgentApi.messagingHealth).mockResolvedValue({
    settings: { providers: { textbeeEnabled: false, twilioEnabled: false } },
    providers: { textbee: { eligible: false, reason: null }, twilio: { eligible: false, reason: null } },
  });
  jest.mocked(aiAgentApi.listCallCampaigns).mockResolvedValue({ items: [], total: 0 });
  jest.mocked(aiAgentApi.listSmsCampaigns).mockResolvedValue({ items: [], total: 0 });
  jest.mocked(leadsApi.list).mockResolvedValue({
    items: LEADS,
    pagination: { hasNext: false, nextCursor: null, limit: 25, total: 3 },
  });
});

describe('CallAgentSettingsScreen', () => {
  it('blocks invalid settings inline and saves a campaign-valid payload', async () => {
    jest.mocked(callAgentApi.saveDefaults).mockImplementation(async () => saved);
    await renderWithProviders(<CallAgentSettingsScreen {...props('CallAgentSettings', undefined)} />);

    const name = await screen.findByLabelText('Agent name');
    expect(name.props.value).toBe('Alex');
    await fireEvent.changeText(name, '   ');
    await fireEvent.changeText(screen.getByLabelText('Attempts per lead'), '11');
    await fireEvent.press(screen.getByRole('button', { name: 'Save settings' }));

    expect(await screen.findByText('Give the agent a name.')).toBeTruthy();
    expect(screen.getByText('Some settings need attention. Check the highlighted fields.')).toBeTruthy();
    expect(callAgentApi.saveDefaults).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Agent name'), ' Mia ');
    await fireEvent.changeText(screen.getByLabelText('Attempts per lead'), '3');
    await fireEvent.press(screen.getByRole('button', { name: 'Coral' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Support' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save settings' }));

    await waitFor(() => expect(callAgentApi.saveDefaults).toHaveBeenCalledTimes(1));
    const payload = jest.mocked(callAgentApi.saveDefaults).mock.calls[0]![0];
    expect(payload.agentConfig).toMatchObject({ agentName: 'Mia', voice: 'coral', language: 'en' });
    expect(payload.agentConfig.disclosure).toContain('AI assistant');
    expect(payload.schedule).toMatchObject({
      callWindow: { start: '09:00', end: '18:00' },
      daysOfWeek: [1, 2, 3, 4, 5],
      maxAttemptsPerLead: 3,
      retryDelayMinutes: 120,
      maxCallsPerDay: 200,
    });
    expect(payload.questions.length).toBe(5);
    expect(payload.sms).toEqual({ purpose: 'support', templateId: null });
    await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
  }, 10_000);

  it('opens with the saved defaults', async () => {
    jest.mocked(callAgentApi.defaults).mockResolvedValue(saved);
    await renderWithProviders(<CallAgentSettingsScreen {...props('CallAgentSettings', undefined)} />);
    expect((await screen.findByLabelText('Agent name')).props.value).toBe('Mia');
    expect(screen.getByLabelText('Time zone').props.value).toBe('Europe/Berlin');
    expect(screen.getByRole('button', { name: 'Coral' })).toBeSelected();
  });
});

describe('CallAgentLeadPickerScreen', () => {
  it('multi-selects leads (with select all shown) and continues to the launch flow', async () => {
    await renderWithProviders(
      <CallAgentLeadPickerScreen {...props('CallAgentLeadPicker', { purpose: 'call' })} />,
    );
    const continueButton = await screen.findByRole('button', { name: 'Continue with 0 leads' });
    expect(continueButton).toBeDisabled();

    await fireEvent.press(await screen.findByRole('checkbox', { name: 'Beta GmbH, New' }));
    expect(screen.getByText('1 lead selected')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Select all shown' }));
    expect(screen.getByText('3 leads selected')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Continue with 3 leads' }));
    expect(navigation.navigate).toHaveBeenCalledWith('AiAgentLaunch', {
      leadIds: [LEADS[1]!.id, LEADS[0]!.id, LEADS[2]!.id],
      initialChannel: 'call',
    });
  });

  it('searches on the server', async () => {
    await renderWithProviders(
      <CallAgentLeadPickerScreen {...props('CallAgentLeadPicker', { purpose: 'sms' })} />,
    );
    await screen.findByRole('checkbox', { name: 'Acme AG, New' });
    await fireEvent.changeText(screen.getByLabelText('Search leads'), 'acme');
    await waitFor(() =>
      expect(leadsApi.list).toHaveBeenCalledWith(
        expect.objectContaining({ q: 'acme' }),
        undefined,
        expect.anything(),
      ),
    );
  });

  it('picks exactly one lead for a test draft', async () => {
    await renderWithProviders(
      <CallAgentLeadPickerScreen {...props('CallAgentLeadPicker', { purpose: 'test' })} />,
    );
    await fireEvent.press(await screen.findByRole('checkbox', { name: 'Acme AG, New' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Gamma SA, New' }));
    expect(screen.getByText('1 lead selected')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Select all shown' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Use this lead for the test' }));
    expect(navigation.replace).toHaveBeenCalledWith('CallAgentTest', { leadId: LEADS[2]!.id });
  });
});

describe('CallAgentTestScreen', () => {
  it('asks for a lead first: the server only simulates an existing draft', async () => {
    await renderWithProviders(<CallAgentTestScreen {...props('CallAgentTest', undefined)} />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Choose a lead' }));
    expect(navigation.navigate).toHaveBeenCalledWith('CallAgentLeadPicker', { purpose: 'test' });
    expect(aiAgentApi.createCallCampaign).not.toHaveBeenCalled();
  });

  it('creates an isTest draft from the saved settings and never starts it', async () => {
    jest.mocked(callAgentApi.defaults).mockResolvedValue(saved);
    jest
      .mocked(aiAgentApi.createCallCampaign)
      .mockResolvedValue(
        callCampaignSchema.parse({ _id: 't1', name: 'Agent test', status: 'draft', isTest: true }),
      );
    await renderWithProviders(<CallAgentTestScreen {...props('CallAgentTest', { leadId: LEADS[0]!.id })} />);
    const create = await screen.findByRole('button', { name: 'Create test draft' });
    await waitFor(() => expect(create).toBeEnabled());
    await fireEvent.press(create);

    await waitFor(() => expect(aiAgentApi.createCallCampaign).toHaveBeenCalledTimes(1));
    expect(jest.mocked(aiAgentApi.createCallCampaign).mock.calls[0]![0]).toMatchObject({
      isTest: true,
      selection: { mode: 'explicit', leadIds: [LEADS[0]!.id] },
      agentConfig: { agentName: 'Mia', voice: 'coral', language: 'de' },
    });
    expect(await screen.findByRole('button', { name: 'Start test' })).toBeTruthy();
    expect(aiAgentApi.startCallCampaign).not.toHaveBeenCalled();
  });
});

describe('AiAgentLaunchScreen prefill from saved defaults', () => {
  it('prefills channel, language and the agent from the defaults; the user can still edit', async () => {
    jest.mocked(callAgentApi.defaults).mockResolvedValue(saved);
    jest.mocked(aiAgentApi.createCallCampaign).mockResolvedValue({ id: 'c1' } as never);
    jest.mocked(aiAgentApi.previewCallCampaign).mockResolvedValue({
      totalSelected: 1,
      eligible: 1,
      missingPhone: 0,
      suppressed: 0,
      ineligible: 0,
      estimatedDurationMinutes: 2,
      telephony: null,
      note: null,
    });
    jest.mocked(aiAgentApi.callRecipients).mockResolvedValue({ items: [], total: 1 });
    await renderWithProviders(
      <AiAgentLaunchScreen
        {...props('AiAgentLaunch', { leadIds: [LEADS[0]!.id], initialChannel: 'call' })}
      />,
    );
    await waitFor(() => expect(callAgentApi.defaults).toHaveBeenCalled());

    // Channel preselected by the hub: straight to the language step.
    await fireEvent.press(await screen.findByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('radio', { name: 'Deutsch, German' })).toBeChecked();
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));

    expect((await screen.findByLabelText('Agent name')).props.value).toBe('Mia');
    expect(screen.getByLabelText('Your organisation').props.value).toBe('Acme AG');
    expect(screen.getByLabelText('Time zone').props.value).toBe('Europe/Berlin');
    await fireEvent.changeText(screen.getByLabelText('Your organisation'), 'Beta GmbH');
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => expect(aiAgentApi.createCallCampaign).toHaveBeenCalledTimes(1));
    const input = jest.mocked(aiAgentApi.createCallCampaign).mock.calls[0]![0];
    expect(input.agentConfig).toEqual({
      agentName: 'Mia',
      organizationName: 'Beta GmbH',
      objective: 'Maintenance',
      language: 'de',
      voice: 'coral',
      disclosure: 'Hallo, hier spricht eine KI im Auftrag von {company}.',
    });
    expect(input.schedule).toEqual({
      timezone: 'Europe/Berlin',
      callWindow: { start: '08:00', end: '17:30' },
      daysOfWeek: [1, 3, 5],
      maxAttemptsPerLead: 4,
      retryDelayMinutes: 30,
      maxCallsPerDay: 80,
    });
    expect(input.questionnaire.questions.map((question) => question.fieldKey)).toEqual(['need']);
    expect(aiAgentApi.startCallCampaign).not.toHaveBeenCalled();
  });
});
