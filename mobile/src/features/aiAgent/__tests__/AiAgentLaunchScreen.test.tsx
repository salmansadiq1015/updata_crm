// Launch flow against a mocked API: no request reaches a backend and nothing is started
// unless the test explicitly confirms.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import type { RootScreenProps } from '@/navigation/navigationTypes';
import { ApiError } from '@/services/api/apiErrors';
import { callAgentApi } from '@/features/callAgent/api/callAgentApi';
import { renderWithProviders } from '@/test/renderWithProviders';

import { aiAgentApi } from '../api/aiAgentApi';
import { LanguageList } from '../components/LanguagePicker';
import { AiAgentLaunchScreen } from '../screens/AiAgentLaunchScreen';
import { smsCampaignSchema, smsRecipientSchema, type AgentLanguage } from '../types';

jest.mock('../api/aiAgentApi', () => ({
  ...jest.requireActual('../api/aiAgentApi'),
  aiAgentApi: {
    languages: jest.fn(),
    telephonyHealth: jest.fn(),
    messagingHealth: jest.fn(),
    smsTemplates: jest.fn(),
    createCallCampaign: jest.fn(),
    updateCallCampaign: jest.fn(),
    previewCallCampaign: jest.fn(),
    callRecipients: jest.fn(),
    startCallCampaign: jest.fn(),
    createSmsCampaign: jest.fn(),
    getSmsCampaign: jest.fn(),
    smsRecipients: jest.fn(),
    startSmsCampaign: jest.fn(),
    cancelSmsCampaign: jest.fn(),
    simulate: jest.fn(),
  },
}));

// No saved Call Agent defaults: the flow starts from the app's standard values.
jest.mock('@/features/callAgent/api/callAgentApi', () => ({
  callAgentApi: { defaults: jest.fn(), saveDefaults: jest.fn() },
}));

const LEADS = ['64b7f0c2a1b2c3d4e5f60718', '64b7f0c2a1b2c3d4e5f60719'];
const languages: AgentLanguage[] = [
  {
    code: 'auto',
    name: "Automatic (match the lead's language)",
    nativeName: 'Auto',
    support: 'full',
    rtl: false,
  },
  { code: 'en', name: 'English', nativeName: 'English', support: 'full', rtl: false },
  { code: 'de', name: 'German', nativeName: 'Deutsch', support: 'full', rtl: false },
  { code: 'fr', name: 'French', nativeName: 'Français', support: 'full', rtl: false },
];

const navigation = { goBack: jest.fn(), replace: jest.fn(), navigate: jest.fn() };

function renderLaunch() {
  const route = {
    key: 'AiAgentLaunch',
    name: 'AiAgentLaunch',
    params: { leadIds: LEADS },
  } as RootScreenProps<'AiAgentLaunch'>['route'];
  return renderWithProviders(
    <AiAgentLaunchScreen
      route={route}
      navigation={navigation as unknown as RootScreenProps<'AiAgentLaunch'>['navigation']}
    />,
  );
}

const smsCampaign = smsCampaignSchema.parse({
  _id: 'm1',
  name: 'AI SMS',
  channel: 'sms',
  status: 'draft',
  summary: { total: 2, eligible: 1 },
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(callAgentApi.defaults).mockResolvedValue(null);
  jest.mocked(aiAgentApi.languages).mockResolvedValue({ languages, defaultLanguage: 'en' });
  jest
    .mocked(aiAgentApi.telephonyHealth)
    .mockResolvedValue({ configured: false, livekitReady: true, reason: 'no_sip_trunk' });
  jest.mocked(aiAgentApi.messagingHealth).mockResolvedValue({
    settings: { providers: { textbeeEnabled: true, twilioEnabled: false } },
    providers: { textbee: { eligible: true, reason: null }, twilio: { eligible: false, reason: null } },
  });
  jest.mocked(aiAgentApi.smsTemplates).mockResolvedValue([]);
});

describe('LanguageList', () => {
  it('filters by English or native name and reports the choice', async () => {
    const onSelect = jest.fn();
    await renderWithProviders(<LanguageList languages={languages} value="en" onSelect={onSelect} />);
    expect(screen.getAllByRole('radio')).toHaveLength(4);

    await fireEvent.changeText(screen.getByLabelText('Search languages'), 'franc');
    expect(screen.getAllByRole('radio')).toHaveLength(1);
    await fireEvent.press(screen.getByRole('radio', { name: 'Français, French' }));
    expect(onSelect).toHaveBeenCalledWith('fr');

    await fireEvent.changeText(screen.getByLabelText('Search languages'), 'zzz');
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.getByText('No language matches “zzz”.')).toBeTruthy();
  });
});

describe('AiAgentLaunchScreen', () => {
  it('without a phone trunk, "Call from my SIM instead" opens a SIM call campaign for the same leads', async () => {
    await renderLaunch();
    await fireEvent.press(await screen.findByRole('button', { name: 'Call from my SIM instead' }));
    expect(navigation.replace).toHaveBeenCalledWith('CallCampaignCreate', { leadIds: LEADS });
  });

  it('shows honest call readiness and keeps Start disabled without a phone trunk', async () => {
    jest.mocked(aiAgentApi.createCallCampaign).mockResolvedValue({ id: 'c1' } as never);
    jest.mocked(aiAgentApi.previewCallCampaign).mockResolvedValue({
      totalSelected: 2,
      eligible: 2,
      missingPhone: 0,
      suppressed: 0,
      ineligible: 0,
      estimatedDurationMinutes: 3,
      telephony: null,
      note: null,
    });
    jest.mocked(aiAgentApi.callRecipients).mockResolvedValue({ items: [], total: 2 });
    await renderLaunch();

    // Cloud calling is optional: no trunk is not an error, and the SIM route is offered instead.
    expect(
      await screen.findByText(
        'Cloud AI calling is optional and not set up on the server. You can call these leads from your own SIM now.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText("AI calling can't dial yet: no phone trunk is configured.")).toBeNull();
    expect(screen.getByRole('button', { name: 'Call from my SIM instead' })).toBeTruthy();
    expect(
      screen.getAllByText(
        "Calls are placed from the CRM's cloud phone number, not from this phone or its SIM.",
      ).length,
    ).toBeGreaterThan(0);

    await fireEvent.press(screen.getByRole('button', { name: 'AI call' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    // Language step, fed by the server list.
    await fireEvent.press(await screen.findByRole('radio', { name: 'Deutsch, German' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    // Configure step (default questionnaire is prefilled) → Review creates a draft.
    await fireEvent.press(await screen.findByRole('button', { name: 'Next' }));

    await waitFor(() => expect(aiAgentApi.createCallCampaign).toHaveBeenCalledTimes(1));
    const input = jest.mocked(aiAgentApi.createCallCampaign).mock.calls[0]![0];
    expect(input.selection).toEqual({ mode: 'explicit', leadIds: LEADS });
    expect(input.agentConfig.language).toBe('de');
    expect(input.questionnaire.questions.length).toBeGreaterThan(0);

    const start = await screen.findByRole('button', { name: 'Start AI calls…' });
    expect(start).toBeDisabled();
    expect(aiAgentApi.startCallCampaign).not.toHaveBeenCalled();
  });

  it('treats a forbidden telephony status as unknown and keeps calls disabled', async () => {
    jest
      .mocked(aiAgentApi.telephonyHealth)
      .mockRejectedValue(new ApiError({ kind: 'http', status: 403, message: 'Forbidden' }));
    await renderLaunch();
    expect(
      await screen.findByText(
        'AI calling status unknown: your account cannot read the telephony status. Starting calls stays disabled.',
      ),
    ).toBeTruthy();
  });

  it('requires an explicit confirmation with counts before sending SMS', async () => {
    jest.mocked(aiAgentApi.createSmsCampaign).mockResolvedValue(smsCampaign);
    jest.mocked(aiAgentApi.getSmsCampaign).mockResolvedValue(smsCampaign);
    jest.mocked(aiAgentApi.smsRecipients).mockResolvedValue({
      total: 2,
      items: [
        smsRecipientSchema.parse({
          _id: 'r1',
          status: 'draft',
          leadId: { _id: LEADS[0], name: 'Acme AG' },
          eligibility: { eligible: true, reasons: [] },
          rendered: { bodyText: 'Hello Acme AG' },
        }),
        smsRecipientSchema.parse({
          _id: 'r2',
          status: 'ineligible',
          leadId: { _id: LEADS[1], name: 'Beta' },
          eligibility: { eligible: false, reasons: ['consent_required'] },
        }),
      ],
    });
    jest.mocked(aiAgentApi.startSmsCampaign).mockResolvedValue({ ...smsCampaign, status: 'queued' });
    await renderLaunch();

    expect(await screen.findByText('SMS sending is ready.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'AI SMS' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    await fireEvent.changeText(await screen.findByLabelText('Text'), 'Hello {{businessName}}');
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => expect(aiAgentApi.createSmsCampaign).toHaveBeenCalledTimes(1));
    expect(jest.mocked(aiAgentApi.createSmsCampaign).mock.calls[0]![0]).toMatchObject({
      channel: 'sms',
      purpose: 'promotional',
      content: { bodyText: 'Hello {{businessName}}' },
      selection: { mode: 'explicit', leadIds: LEADS },
    });

    // Server-rendered preview + eligibility reasons.
    expect(await screen.findByText('Hello Acme AG')).toBeTruthy();
    expect(screen.getByText('No recorded consent · 1')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Send SMS…' }));
    expect(await screen.findByText("1 real SMS will be sent through the CRM's SMS provider.")).toBeTruthy();
    expect(screen.getByText('Estimated segments billed: 1')).toBeTruthy();
    expect(screen.getByText('1 selected lead is excluded and will not be contacted.')).toBeTruthy();

    const confirm = screen.getByRole('button', { name: 'Send SMS' });
    expect(confirm).toBeDisabled();
    await fireEvent.press(confirm);
    expect(aiAgentApi.startSmsCampaign).not.toHaveBeenCalled();

    await fireEvent.press(
      screen.getByRole('checkbox', { name: 'I understand this contacts real people and costs money.' }),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Send SMS' }));
    await waitFor(() => expect(aiAgentApi.startSmsCampaign).toHaveBeenCalledWith('m1'));
    expect(aiAgentApi.startSmsCampaign).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith('AiAgentCampaignDetail', {
        kind: 'sms',
        campaignId: 'm1',
      }),
    );
  });
});
