// The calling runner against a mocked API and a fake native telephony module. No real
// call is placed: the fake records placeCall() and the test plays the Android call-state
// callbacks. These tests are simulations, not SIM-call verification.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { AppState, PermissionsAndroid, type AppStateStatus } from 'react-native';

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

let mockFocused = true;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useIsFocused: () => mockFocused,
}));

jest.mock('../api/callCampaignApi', () => ({
  callCampaignApi: {
    campaign: jest.fn(),
    next: jest.fn(),
    task: jest.fn(),
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

// Android permission dialogs and app foreground/background, driven by each test.
const checkPermission = jest.spyOn(PermissionsAndroid, 'check');
const requestPermission = jest.spyOn(PermissionsAndroid, 'request');
let appStateHandlers: ((state: AppStateStatus) => void)[] = [];
jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
  appStateHandlers.push(handler as (state: AppStateStatus) => void);
  return { remove: () => undefined } as ReturnType<typeof AppState.addEventListener>;
});
const setAppState = async (state: AppStateStatus) => {
  Object.defineProperty(AppState, 'currentState', { value: state, configurable: true });
  await act(async () => appStateHandlers.forEach((h) => h(state)));
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
  mockFocused = true;
  jest.clearAllMocks();
  Object.values(api).forEach((fn) => fn.mockReset()); // drop queued once-values from other tests
  listener = null;
  appStateHandlers = [];
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  checkPermission.mockResolvedValue(true);
  requestPermission.mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
  native.placeCall.mockResolvedValue({ route: 'telecom_direct', subscriptionApplied: false });
  native.startCallStateMonitoring.mockResolvedValue(true);
  native.getCallStateEvents.mockResolvedValue([]);
  native.getActiveSims.mockResolvedValue([]);
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
  it('lets the caller correct a server-rejected outcome without dialing again', async () => {
    api.next.mockResolvedValueOnce(claimed(task()));
    api.task.mockResolvedValue(
      task({ attempts: [{ attemptId: 'att-1', dialedAt: new Date().toISOString() }] } as Partial<CallTask>),
    );
    api.complete
      .mockRejectedValueOnce(new ApiError({ kind: 'http', status: 400, message: 'Invalid answer' }))
      .mockResolvedValueOnce({ task: task({ state: 'completed' }), replayed: false });
    await renderRun();
    await fireEvent.press(await screen.findByText('Call'));
    await fireEvent.press(await screen.findByText('The call has ended'));
    await fireEvent.press(screen.getByText('No answer'));
    await fireEvent.press(screen.getByText('Save outcome'));
    await fireEvent.press(await screen.findByText('Correct rejected outcome'));
    expect(await screen.findByText('What happened?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Busy'));
    await fireEvent.press(screen.getByText('Save outcome'));
    expect(await screen.findByText('Saved to the campaign')).toBeTruthy();
    expect(api.complete).toHaveBeenCalledTimes(2);
    expect(native.placeCall).toHaveBeenCalledTimes(1);
  });
  it('reconciles a locally remembered dial after server cancellation without claiming or redialing', async () => {
    api.campaign.mockResolvedValue(campaign({ status: 'cancelled' }));
    useCampaignOutbox
      .getState()
      .setRun('c1', { taskId: 't1', attemptId: 'att-1', dialedAt: Date.now(), recorded: false });
    api.task.mockResolvedValue(
      task({ attempts: [{ attemptId: 'att-1', dialedAt: new Date().toISOString() }] } as Partial<CallTask>),
    );
    await renderRun();
    expect(await screen.findByText('What happened?')).toBeTruthy();
    expect(api.next).not.toHaveBeenCalled();
    expect(native.placeCall).not.toHaveBeenCalled();
  });

  it('does not claim another lead on restart while a completion is still offline', async () => {
    api.complete.mockRejectedValue(new ApiError({ kind: 'network', message: 'offline' }));
    useCampaignOutbox.getState().enqueue({
      kind: 'complete',
      taskId: 't1',
      campaignId: 'c1',
      attemptId: 'att-1',
      body: { attemptId: 'att-1', outcome: 'no_answer' },
    });
    await renderRun();
    expect(await screen.findByText('Saved on this phone — syncing')).toBeTruthy();
    expect(api.next).not.toHaveBeenCalled();
    expect(native.placeCall).not.toHaveBeenCalled();
  });

  it('does not launch native dialing if the app backgrounds during authorization', async () => {
    api.next.mockResolvedValueOnce(claimed(task()));
    let authorize!: (value: { dialNumber: string }) => void;
    api.dial.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          authorize = resolve;
        }),
    );
    await renderRun();
    await fireEvent.press(await screen.findByText('Call'));
    await waitFor(() => expect(api.dial).toHaveBeenCalledTimes(1));
    await setAppState('background');
    await act(async () => authorize({ dialNumber: '+41796661001' }));
    expect(await screen.findByText('What happened?')).toBeTruthy();
    expect(native.placeCall).not.toHaveBeenCalled();
  });

  it('holds automatic dialing while another app screen covers the caller', async () => {
    mockFocused = false;
    api.campaign.mockResolvedValue(campaign({ settings: { autoDial: true, countdownSeconds: 3 } }));
    api.next.mockResolvedValueOnce(claimed(task()));
    await renderRun();
    expect(await screen.findByText('Automatic calling waits while Updata is not on screen.')).toBeTruthy();
    await act(async () => new Promise((r) => setTimeout(r, 3500)));
    expect(native.placeCall).not.toHaveBeenCalled();
  }, 10000);

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
    expect(await screen.findByText('Saved to the campaign')).toBeTruthy();
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

  it('after a restart it reconciles a dialled lead instead of redialling, even with auto-call on', async () => {
    api.campaign.mockResolvedValue(
      campaign({ settings: { timezone: 'UTC', countdownSeconds: 3, autoDial: true, readAloud: false } }),
    );
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
    await act(async () => new Promise((r) => setTimeout(r, 3500)));
    expect(native.placeCall).not.toHaveBeenCalled();
    expect(api.dial).not.toHaveBeenCalled();
  }, 10000);

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

// Bug A (2026-10-20): the caller waited for a tap on every lead. Auto-call is a visible,
// stoppable countdown on a claimed, never-dialled lead; the phone permissions are asked for.
describe('CallCampaignRunScreen — automatic calling', () => {
  const autoCampaign = () =>
    campaign({ settings: { timezone: 'UTC', countdownSeconds: 3, autoDial: true, readAloud: false } });

  it('calls the first lead after a visible countdown, without a tap', async () => {
    api.campaign.mockResolvedValue(autoCampaign());
    api.next.mockResolvedValueOnce(claimed(task()));
    await renderRun();
    expect(await screen.findByText(/Calling Acme AG in \d s/)).toBeTruthy();
    expect(native.placeCall).not.toHaveBeenCalled(); // the countdown is visible first
    await waitFor(() => expect(native.placeCall).toHaveBeenCalledTimes(1), { timeout: 6000 });
    expect(api.dial).toHaveBeenCalledWith('t1', expect.objectContaining({ attemptId: 'att-1' }));
    expect(await screen.findByText('Call in progress')).toBeTruthy();
    expect(screen.getByText(/The lead hears only you/)).toBeTruthy();
  }, 15000);

  it('dual SIM: waits for a SIM, then remembers it for this campaign', async () => {
    native.getActiveSims.mockResolvedValue([
      { subscriptionId: 3, slotIndex: 0, displayName: 'Jazz', carrierName: 'Jazz' },
      { subscriptionId: 2, slotIndex: 1, displayName: 'Telenor', carrierName: 'Telenor' },
    ] as never);
    api.campaign.mockResolvedValue(autoCampaign());
    api.next.mockResolvedValueOnce(claimed(task()));
    const first = await renderRun();
    expect(await screen.findByText('Choose the SIM to call from to start automatic calling.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Telenor'));
    expect(useCampaignOutbox.getState().sims.c1).toBe(2);
    expect(await screen.findByText(/Calling Acme AG in \d s/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Stop — I will tap Call'));
    await first.unmount();

    // Opened again later: the SIM is already chosen, so the countdown starts by itself.
    api.next.mockResolvedValueOnce(claimed(task()));
    await renderRun();
    await waitFor(
      () => expect(native.placeCall).toHaveBeenCalledWith(expect.objectContaining({ subscriptionId: 2 })),
      {
        timeout: 6000,
      },
    );
  }, 20000);

  it('Stop leaves the lead waiting for a tap', async () => {
    api.campaign.mockResolvedValue(autoCampaign());
    api.next.mockResolvedValueOnce(claimed(task()));
    await renderRun();
    expect(await screen.findByText(/Calling Acme AG in \d s/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Stop — I will tap Call'));
    expect(await screen.findByText('Stopped for this lead. Tap Call when you are ready.')).toBeTruthy();
    await act(async () => new Promise((r) => setTimeout(r, 3500)));
    expect(native.placeCall).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Call'));
    await waitFor(() => expect(native.placeCall).toHaveBeenCalledTimes(1));
  }, 15000);

  it('the switch turns auto-call on for this campaign on this phone', async () => {
    api.next.mockResolvedValueOnce(claimed(task()));
    await renderRun(); // campaign default: autoDial off
    await screen.findByText('Acme AG');
    await act(async () => new Promise((r) => setTimeout(r, 1200)));
    expect(screen.queryByText(/Calling Acme AG in/)).toBeNull();
    await fireEvent.press(screen.getByText('Call automatically'));
    expect(useCampaignOutbox.getState().autoCall.c1).toBe(true);
    await waitFor(() => expect(native.placeCall).toHaveBeenCalledTimes(1), { timeout: 6000 });
  }, 15000);

  it('waits while the app is in the background and restarts the countdown on return', async () => {
    api.campaign.mockResolvedValue(autoCampaign());
    api.next.mockResolvedValueOnce(claimed(task()));
    await renderRun();
    expect(await screen.findByText(/Calling Acme AG in \d s/)).toBeTruthy();
    await setAppState('background');
    expect(await screen.findByText('Automatic calling waits while Updata is not on screen.')).toBeTruthy();
    await act(async () => new Promise((r) => setTimeout(r, 3500)));
    expect(native.placeCall).not.toHaveBeenCalled();
    await setAppState('active');
    await waitFor(() => expect(native.placeCall).toHaveBeenCalledTimes(1), { timeout: 6000 });
  }, 20000);

  it('without phone permission it never auto-calls; a tap asks for it and falls back to the dialer', async () => {
    checkPermission.mockResolvedValue(false);
    requestPermission.mockResolvedValue(PermissionsAndroid.RESULTS.DENIED);
    native.placeCall.mockResolvedValueOnce({ route: 'dialer_handoff', subscriptionApplied: false });
    native.startCallStateMonitoring.mockResolvedValueOnce(false);
    api.campaign.mockResolvedValue(autoCampaign());
    api.next.mockResolvedValueOnce(claimed(task()));
    await renderRun();
    expect(await screen.findByText(/needs the Phone permission/)).toBeTruthy();
    expect(screen.getByText('Automatic calling needs phone access (see above).')).toBeTruthy();
    await act(async () => new Promise((r) => setTimeout(r, 3500)));
    expect(native.placeCall).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Call'));
    await waitFor(() => expect(native.placeCall).toHaveBeenCalledTimes(1));
    expect(requestPermission).toHaveBeenCalled();
    expect(
      await screen.findByText("Press the call button in your phone's dialer, then come back to Updata."),
    ).toBeTruthy();
    expect(screen.getByText(/can't see this call's state/)).toBeTruthy();
  }, 15000);

  it('after the call the next lead is called automatically once the outcome is saved', async () => {
    api.campaign.mockResolvedValue(autoCampaign());
    api.next.mockResolvedValueOnce(claimed(task())).mockResolvedValueOnce(
      claimed(
        task({
          id: 't2',
          leadId: 'l2',
          lead: { id: 'l2', name: 'Beta GmbH', city: 'Zug' },
          lock: { deviceId: 'd', attemptId: 'att-2', until: null },
          attempts: [{ attemptId: 'att-2' }],
        } as Partial<CallTask>),
      ),
    );
    await renderRun();
    await waitFor(() => expect(native.placeCall).toHaveBeenCalledTimes(1), { timeout: 6000 });
    await emit('offhook', Date.now());
    await emit('idle', Date.now() + 5_000);
    await fireEvent.press(await screen.findByText('No answer'));
    await fireEvent.press(screen.getByText('Save outcome'));
    expect(await screen.findByText(/Calling Beta GmbH in \d s/, {}, { timeout: 4000 })).toBeTruthy();
    await waitFor(() => expect(native.placeCall).toHaveBeenCalledTimes(2), { timeout: 6000 });
    expect(api.dial).toHaveBeenLastCalledWith('t2', expect.objectContaining({ attemptId: 'att-2' }));
  }, 20000);

  it('pausing during the countdown stops the next call', async () => {
    api.campaign.mockResolvedValue(autoCampaign());
    api.next.mockResolvedValueOnce(claimed(task()));
    await renderRun();
    await waitFor(() => expect(native.placeCall).toHaveBeenCalledTimes(1), { timeout: 6000 });
    await emit('offhook', Date.now());
    await emit('idle', Date.now() + 5_000);
    await fireEvent.press(await screen.findByText('No answer'));
    await fireEvent.press(screen.getByText('Save outcome'));
    await fireEvent.press(await screen.findByText('Pause'));
    await act(async () => new Promise((r) => setTimeout(r, 1500)));
    expect(api.next).toHaveBeenCalledTimes(1);
    expect(native.placeCall).toHaveBeenCalledTimes(1);
  }, 15000);
});

describe('CallCampaignRunScreen — retries due later', () => {
  it('with auto-call it fetches the retry when it is due; without auto-call it waits for a tap', async () => {
    const waiting: ClaimResult = {
      task: null,
      resumed: false,
      reason: 'waiting',
      nextAt: new Date(Date.now() + 1_500).toISOString(),
    };
    api.campaign.mockResolvedValue(
      campaign({ settings: { timezone: 'UTC', countdownSeconds: 3, autoDial: true, readAloud: false } }),
    );
    api.next.mockResolvedValueOnce(waiting).mockResolvedValueOnce(claimed(task()));
    await renderRun();
    expect(await screen.findByText('Remaining leads are scheduled for later.')).toBeTruthy();
    await waitFor(() => expect(api.next).toHaveBeenCalledTimes(2), { timeout: 5000 });
    expect(await screen.findByText(/Calling Acme AG in \d s/)).toBeTruthy();
  }, 15000);

  it('does not re-check by itself when auto-call is off', async () => {
    api.next.mockResolvedValueOnce({
      task: null,
      resumed: false,
      reason: 'waiting',
      nextAt: new Date(Date.now() + 1_000).toISOString(),
    });
    await renderRun();
    expect(await screen.findByText('Remaining leads are scheduled for later.')).toBeTruthy();
    await act(async () => new Promise((r) => setTimeout(r, 3000)));
    expect(api.next).toHaveBeenCalledTimes(1);
  }, 10000);
});

describe('CallCampaignRunScreen — claim lapsed while the lead sat on screen', () => {
  it('after an app restart, answers typed under the lapsed claim appear on the new one', async () => {
    useCampaignOutbox.getState().saveDraft('att-0', {
      taskId: 't1',
      campaignId: 'c1',
      answers: { interest: { status: 'answered', value: 'low' } },
    });
    api.next.mockResolvedValueOnce(claimed(task()));
    await renderRun();
    await screen.findByText('Acme AG');
    expect(useCampaignOutbox.getState().drafts['att-1']?.answers.interest?.value).toBe('low');
    await waitFor(() =>
      expect(api.saveAnswers).toHaveBeenCalledWith('t1', expect.objectContaining({ attemptId: 'att-1' })),
    );
    expect(screen.queryByText(/released after a long pause/)).toBeNull();
  });

  it('claims again on the dial refusal and keeps the typed answers for the new attempt', async () => {
    const renewed = task({
      lock: { deviceId: 'd', attemptId: 'att-2', until: null },
      attempts: [{ attemptId: 'att-2' }],
    } as Partial<CallTask>);
    api.next.mockResolvedValueOnce(claimed(task())).mockResolvedValueOnce(claimed(renewed));
    api.dial
      .mockRejectedValueOnce(
        new ApiError({ kind: 'http', status: 409, code: 'SIM_CALL_TASK_LOCKED', message: 'not claimed' }),
      )
      .mockResolvedValue({ dialNumber: '+41796661001', destinationMasked: '•••• 1001' });
    await renderRun();
    await fireEvent.press(await screen.findByText('High'));
    await fireEvent.press(screen.getByText('Call'));
    expect(await screen.findByText(/released after a long pause/)).toBeTruthy();
    expect(api.next).toHaveBeenCalledTimes(2);
    expect(native.placeCall).not.toHaveBeenCalled(); // never dials on the refused attempt
    expect(useCampaignOutbox.getState().drafts['att-2']?.answers.interest).toEqual({
      status: 'answered',
      value: 'high',
    });
    await waitFor(() =>
      expect(api.saveAnswers).toHaveBeenCalledWith('t1', expect.objectContaining({ attemptId: 'att-2' })),
    );
    await fireEvent.press(screen.getByText('Call'));
    await waitFor(() =>
      expect(native.placeCall).toHaveBeenCalledWith(expect.objectContaining({ operationId: 'att-2' })),
    );
  });
});

// Returning from Android's call screen: JS may have missed the hang-up while in the
// background, so the runner reads the call-state events the native module persisted.
describe('CallCampaignRunScreen — back from the dialer', () => {
  it('shows the outcome when the phone recorded the hang-up while Updata was in the background', async () => {
    api.next.mockResolvedValueOnce(claimed(task()));
    await renderRun();
    await fireEvent.press(await screen.findByText('Call'));
    expect(await screen.findByText('Call in progress')).toBeTruthy();
    await setAppState('background');
    const now = Date.now();
    native.getCallStateEvents.mockResolvedValue([
      { operationId: 'att-1', state: 'offhook', at: now, source: 'telephony_callback' },
      { operationId: 'att-1', state: 'idle', at: now + 20_000, source: 'telephony_callback' },
    ]);
    await setAppState('active');
    expect(await screen.findByText('What happened?')).toBeTruthy();
    expect(screen.getByText(/off-hook for 20 s/)).toBeTruthy();
  });
});
