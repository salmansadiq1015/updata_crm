// The calling runner against a mocked API and a fake native telephony module. No real
// call is placed: the fake records placeCall() and the test plays the Android call-state
// callbacks. These tests are simulations, not SIM-call verification.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { useSessionStore } from '@/features/auth/store/sessionStore';
import type { RootScreenProps } from '@/navigation/navigationTypes';
import { ApiError } from '@/services/api/apiErrors';
import { __setNativeTelephonyForTests } from '@/services/telephony/telephonyService';
import type { CallStateEvent } from '@/services/telephony/types';
import { renderWithProviders } from '@/test/renderWithProviders';

import { callCampaignApi } from '../api/callCampaignApi';
import { CallCampaignRunScreen } from '../screens/CallCampaignRunScreen';
import { useCampaignOutbox } from '../store/campaignOutbox';
import { callCampaignSchema, callTaskSchema, type CallTask, type ClaimResult } from '../types';

jest.mock('../api/callCampaignApi', () => ({
  callCampaignApi: {
    campaign: jest.fn(),
    next: jest.fn(),
    dial: jest.fn(),
    skip: jest.fn(),
    saveAnswers: jest.fn(),
    complete: jest.fn(),
  },
}));

const api = jest.mocked(callCampaignApi);
let listener: ((e: CallStateEvent) => void) | null = null;
const native = {
  getCapabilities: jest.fn(),
  getActiveSims: jest.fn(async () => []),
  normalizeNumber: jest.fn(),
  placeCall: jest.fn(async () => ({ route: 'telecom_direct', subscriptionApplied: false })),
  openSmsComposer: jest.fn(),
  startCallStateMonitoring: jest.fn(async () => true),
  stopCallStateMonitoring: jest.fn(async () => undefined),
  getCallStateEvents: jest.fn(async (): Promise<CallStateEvent[]> => []),
  clearCallStateEvents: jest.fn(),
  addListener: jest.fn((_name: string, cb: (e: CallStateEvent) => void) => {
    listener = cb;
    return { remove: jest.fn() };
  }),
};

const campaign = (overrides: object = {}) =>
  callCampaignSchema.parse({
    _id: 'c1',
    name: 'Garage outreach',
    status: 'running',
    instructions: 'Say who you are.',
    questionnaire: {
      questions: [
        {
          fieldKey: 'interest',
          label: 'Interest',
          text: 'How interested are you?',
          type: 'single_choice',
          required: true,
          order: 1,
          options: ['high', 'low'],
        },
      ],
    },
    settings: { timezone: 'UTC', countdownSeconds: 3, autoDial: false, readAloud: false },
    summary: { total: 2 },
    ...overrides,
  });

const task = (overrides: Partial<CallTask> = {}): CallTask =>
  callTaskSchema.parse({
    id: 't1',
    campaignId: 'c1',
    leadId: 'l1',
    lead: { id: 'l1', name: 'Acme AG', city: 'Bern' },
    state: 'in_progress',
    destinationMasked: '•••• 1001',
    lock: { deviceId: 'd', attemptId: 'att-1', until: null },
    attempts: [{ attemptId: 'att-1' }],
    ...overrides,
  });

const claimed = (t: CallTask, resumed = false): ClaimResult => ({
  task: t,
  resumed,
  reason: null,
  nextAt: null,
});
const empty: ClaimResult = { task: null, resumed: false, reason: 'queue_empty', nextAt: null };

function renderRun() {
  const route = { key: 'CallCampaignRun', name: 'CallCampaignRun', params: { campaignId: 'c1' } };
  return renderWithProviders(
    <CallCampaignRunScreen
      {...({ route, navigation: { navigate: jest.fn() } } as unknown as RootScreenProps<'CallCampaignRun'>)}
    />,
  );
}

const emit = async (state: CallStateEvent['state'], at: number) => {
  await act(async () => listener?.({ operationId: 'att-1', state, at, source: 'telephony_callback' }));
};

beforeEach(async () => {
  jest.clearAllMocks();
  Object.values(api).forEach((fn) => fn.mockReset()); // drop queued once-values from other tests
  listener = null;
  await AsyncStorage.clear();
  __setNativeTelephonyForTests(native as never);
  useSessionStore.getState().setAuthenticated({
    id: 'u1',
    email: 'u1@example.com',
    firstName: null,
    lastName: null,
    fullName: 'U1',
    phone: null,
    language: null,
    avatarUrl: null,
    roleName: null,
    status: null,
  });
  await useCampaignOutbox.getState().activate('u1');
  api.campaign.mockResolvedValue(campaign());
  api.dial.mockResolvedValue({ dialNumber: '+41796661001', destinationMasked: '•••• 1001' });
  api.saveAnswers.mockImplementation(async () => task());
  api.complete.mockImplementation(async () => ({ task: task({ state: 'completed' }), replayed: false }));
});

afterEach(() => {
  __setNativeTelephonyForTests(undefined);
});

describe('CallCampaignRunScreen', () => {
  it('claims, dials on the SIM, follows the call state, saves the confirmed outcome, then counts down to the next lead', async () => {
    api.next.mockResolvedValueOnce(claimed(task())).mockResolvedValueOnce(empty);
    await renderRun();
    expect(await screen.findByText('Acme AG')).toBeTruthy();
    expect(screen.getByText('Say who you are.')).toBeTruthy();
    expect(native.placeCall).not.toHaveBeenCalled(); // nothing is dialled without a tap

    await fireEvent.press(screen.getByText('Call'));
    await waitFor(() =>
      expect(native.placeCall).toHaveBeenCalledWith({
        number: '+41796661001',
        subscriptionId: undefined,
        operationId: 'att-1',
      }),
    );
    expect(api.dial).toHaveBeenCalledWith('t1', expect.objectContaining({ attemptId: 'att-1' }));
    expect(await screen.findByText('Call in progress')).toBeTruthy();

    await fireEvent.press(screen.getByText('High'));
    await emit('offhook', Date.now());
    await emit('idle', Date.now() + 42_000);
    expect(await screen.findByText('What happened?')).toBeTruthy();
    expect(screen.getByText(/Android does not tell apps whether the call was answered/)).toBeTruthy();

    await fireEvent.press(screen.getByText('Answered'));
    await fireEvent.press(await screen.findByText('Interested'));
    await fireEvent.press(screen.getByText('Save outcome'));
    await waitFor(() => expect(api.complete).toHaveBeenCalled());
    expect(api.complete).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({
        attemptId: 'att-1',
        outcome: 'answered',
        interest: 'interested',
        answers: [{ fieldKey: 'interest', status: 'answered', value: 'high' }],
        call: expect.objectContaining({ evidence: 'call_state', offhookDurationSec: 42 }),
      }),
    );
    expect(await screen.findByText('Saved to the CRM')).toBeTruthy();
    expect(await screen.findByText(/Next lead in \d s/)).toBeTruthy();

    // Pause stops the sequence; nothing is claimed while paused.
    await fireEvent.press(screen.getByText('Pause'));
    expect(await screen.findByText('Paused. Continue when you are ready.')).toBeTruthy();
    await act(async () => new Promise((r) => setTimeout(r, 1200)));
    expect(api.next).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByText('Continue'));
    await waitFor(() => expect(api.next).toHaveBeenCalledTimes(2), { timeout: 6000 });
    expect(await screen.findByText('No more leads to call.')).toBeTruthy();
    expect(native.placeCall).toHaveBeenCalledTimes(1); // auto-dial is off
  }, 15000);

  it('after a restart it reconciles a dialled lead instead of redialling', async () => {
    api.next.mockResolvedValueOnce(
      claimed(
        task({
          attempts: [{ attemptId: 'att-1', dialedAt: new Date(Date.now() - 60_000).toISOString() }],
        } as Partial<CallTask>),
        true,
      ),
    );
    native.getCallStateEvents.mockResolvedValueOnce([
      { operationId: 'att-1', state: 'offhook', at: Date.now() - 58_000, source: 'telephony_callback' },
      { operationId: 'att-1', state: 'idle', at: Date.now() - 30_000, source: 'telephony_callback' },
    ]);
    await renderRun();
    expect(await screen.findByText('What happened?')).toBeTruthy();
    expect(screen.getByText(/off-hook for 28 s/)).toBeTruthy();
    expect(screen.queryByText('Call')).toBeNull();
    expect(native.placeCall).not.toHaveBeenCalled();
    expect(api.dial).not.toHaveBeenCalled();
  });

  it('requires an explicit callback date and time before saving', async () => {
    api.next.mockResolvedValueOnce(
      claimed(
        task({ attempts: [{ attemptId: 'att-1', dialedAt: new Date().toISOString() }] } as Partial<CallTask>),
        true,
      ),
    );
    await renderRun();
    await fireEvent.press(await screen.findByText('Callback requested'));
    expect(screen.getByText('Campaign (UTC)')).toBeTruthy();
    await fireEvent.press(screen.getByText('Save outcome'));
    expect(await screen.findByText('Pick the callback date and time.')).toBeTruthy();
    expect(api.complete).not.toHaveBeenCalled();
  });

  it('keeps the outcome on the phone when the network fails and does not move on', async () => {
    api.next.mockResolvedValueOnce(
      claimed(
        task({ attempts: [{ attemptId: 'att-1', dialedAt: new Date().toISOString() }] } as Partial<CallTask>),
        true,
      ),
    );
    api.complete.mockRejectedValue(new ApiError({ kind: 'network', message: 'offline' }));
    await renderRun();
    await fireEvent.press(await screen.findByText('No answer'));
    await fireEvent.press(screen.getByText('Save outcome'));
    expect(await screen.findByText('Saved on this phone — syncing')).toBeTruthy();
    expect(screen.getByText('Waiting for the server to confirm this result.')).toBeTruthy();
    expect(useCampaignOutbox.getState().items['complete:att-1']).toMatchObject({
      status: 'pending',
      tries: 1,
    });
    await act(async () => new Promise((r) => setTimeout(r, 1200)));
    expect(api.next).toHaveBeenCalledTimes(1);
  });

  it('a paused or cancelled campaign hands out no lead', async () => {
    api.next.mockRejectedValueOnce(
      new ApiError({
        kind: 'http',
        status: 409,
        code: 'SIM_CALL_CAMPAIGN_NOT_RUNNING',
        message: 'Campaign is cancelled',
      }),
    );
    await renderRun();
    expect(
      await screen.findByText('The campaign is not running (paused, cancelled or completed).'),
    ).toBeTruthy();
    expect(screen.queryByText('Call')).toBeNull();
  });

  it('records "Call failed" when the phone cannot place the call', async () => {
    api.next.mockResolvedValueOnce(claimed(task()));
    native.placeCall.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'PERMISSION_DENIED' }));
    await renderRun();
    await fireEvent.press(await screen.findByText('Call'));
    expect(await screen.findByText('What happened?')).toBeTruthy();
    expect(screen.getByText('Phone permission is needed to place calls.')).toBeTruthy();
  });
});
