// Queue screen against mocked APIs and a faked telephony module: nothing is dialed, ever.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { useSessionStore } from '@/features/auth/store/sessionStore';
import { communicationApi } from '@/features/communication/api/communicationApi';
import { newOperation } from '@/features/communication/domain/operations';
import { useOperationsStore } from '@/features/communication/store/operationsStore';
import { leadsApi } from '@/features/leads/api/leadsApi';
import type { Lead } from '@/features/leads/types';
import type { RootScreenProps } from '@/navigation/navigationTypes';
import { __setNativeTelephonyForTests } from '@/services/telephony/telephonyService';
import { renderWithProviders } from '@/test/renderWithProviders';

import { createQueue } from '../domain/queue';
import { syncCallQueue } from '../hooks/useCallQueueRuntime';
import { CallQueueScreen } from '../screens/CallQueueScreen';
import { useCallQueueStore } from '../store/callQueueStore';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  const { useEffect } = jest.requireActual('react');
  return { ...actual, useFocusEffect: (effect: () => void) => useEffect(effect, [effect]) };
});
jest.mock('@/features/leads/api/leadsApi');
jest.mock('@/features/communication/api/communicationApi', () => ({
  communicationApi: { eligibility: jest.fn(), appendEvents: jest.fn(), complete: jest.fn() },
}));

const A = 'a'.repeat(24);
const B = 'b'.repeat(24);
const C = 'c'.repeat(24);
const USER = 'u1';

const lead = (id: string, name: string, phone: string | null = '+41 44 123 45 67'): Lead => ({
  id,
  leadNumber: null,
  name,
  type: 'business',
  status: 'new',
  source: 'manual',
  address: null,
  phone,
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
const LEADS: Record<string, Lead> = {
  [A]: lead(A, 'Acme AG'),
  [B]: lead(B, 'Beta GmbH'),
  [C]: lead(C, 'Gamma SA'),
};

const native = {
  getCapabilities: jest.fn(),
  getActiveSims: jest.fn(),
  normalizeNumber: jest.fn(),
  placeCall: jest.fn(),
  openSmsComposer: jest.fn(),
  startCallStateMonitoring: jest.fn(),
  stopCallStateMonitoring: jest.fn(),
  getCallStateEvents: jest.fn(async () => []),
  clearCallStateEvents: jest.fn(),
  addListener: jest.fn(() => ({ remove: jest.fn() })),
};

const navigation = {
  navigate: jest.fn(),
  replace: jest.fn(),
  goBack: jest.fn(),
  popTo: jest.fn(),
  canGoBack: () => true,
};

function renderQueue() {
  return renderWithProviders(
    <CallQueueScreen
      route={{ key: 'CallQueue', name: 'CallQueue' } as RootScreenProps<'CallQueue'>['route']}
      navigation={navigation as unknown as RootScreenProps<'CallQueue'>['navigation']}
    />,
  );
}

function startQueue(ids = [A, B, C]) {
  useCallQueueStore.getState().start(
    createQueue({
      id: 'q1',
      userId: USER,
      leads: ids.map((id) => ({ id, name: LEADS[id]!.name })),
      now: 1_000,
    }),
  );
}

function putOperation(operationId: string, leadId: string, extra: object) {
  useOperationsStore.getState().put({
    ...newOperation({
      operationId,
      userId: USER,
      leadId,
      leadName: LEADS[leadId]!.name,
      channel: 'phone',
      destinationField: 'phone',
      sim: null,
      now: Date.now(),
    }),
    serverConfirmed: true,
    ...extra,
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  __setNativeTelephonyForTests(native as never);
  useSessionStore.getState().setAuthenticated({
    id: USER,
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
  await useOperationsStore.getState().activate(USER);
  await useCallQueueStore.getState().activate(USER);
  jest.mocked(leadsApi.get).mockImplementation(async (id: string) => LEADS[id]!);
  jest.mocked(communicationApi.eligibility).mockResolvedValue({
    eligible: true,
    reasons: [],
    destinationMasked: '+41 •• ••• 67',
  });
});

afterEach(() => {
  __setNativeTelephonyForTests(undefined);
});

describe('CallQueueScreen', () => {
  it('shows progress and the current lead; Call opens the call screen and dials nothing', async () => {
    startQueue();
    await renderQueue();
    expect(screen.getByText('Lead 1 of 3')).toBeTruthy();
    expect(screen.getByText('Acme AG')).toBeTruthy();
    expect(await screen.findByText('Number +41 •• ••• 67')).toBeTruthy();
    // Up next lists the other leads in order.
    expect(screen.getByText('Beta GmbH')).toBeTruthy();
    expect(screen.getByText('Gamma SA')).toBeTruthy();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Call' })).toBeEnabled());
    await fireEvent.press(screen.getByRole('button', { name: 'Call' }));
    expect(navigation.navigate).toHaveBeenCalledWith('CallSession', {
      leadId: A,
      queueId: 'q1',
      destinationField: 'phone',
    });
    expect(native.placeCall).not.toHaveBeenCalled();
    expect(useCallQueueStore.getState().queue?.items[0]?.callRequestedAt).toEqual(expect.any(Number));
  });

  it('Skip moves on to the next lead', async () => {
    startQueue();
    await renderQueue();
    await screen.findByText('Number +41 •• ••• 67');
    await fireEvent.press(screen.getByRole('button', { name: 'Skip' }));
    expect(screen.getByText('Lead 2 of 3')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Call' })).toBeEnabled());
    expect(useCallQueueStore.getState().queue?.items[0]).toMatchObject({
      state: 'skipped',
      skipReason: 'user',
    });
  });

  it('auto-skips leads the CRM says cannot be called, with the reason visible', async () => {
    jest
      .mocked(communicationApi.eligibility)
      .mockImplementation(async (leadId) =>
        leadId === A
          ? { eligible: false, reasons: ['PHONE_SUPPRESSED'], destinationMasked: null }
          : { eligible: true, reasons: [], destinationMasked: '+41 •• ••• 99' },
      );
    LEADS[B] = lead(B, 'Beta GmbH', null); // no number at all
    try {
      startQueue();
      await renderQueue();
      await screen.findByText('Number +41 •• ••• 99');
      const items = useCallQueueStore.getState().queue!.items;
      expect(items[0]).toMatchObject({ state: 'skipped', skipReason: 'PHONE_SUPPRESSED' });
      expect(items[1]).toMatchObject({ state: 'skipped', skipReason: 'NO_DESTINATION' });
      expect(items[2]!.state).toBe('current');
      expect(screen.getByText('Lead 3 of 3')).toBeTruthy();
      // Every auto-skipped lead stays listed with the CRM's reason.
      expect(screen.getByText(/Acme AG was skipped: This number is on the do-not-call list\./)).toBeTruthy();
      expect(screen.getByText(/Beta GmbH was skipped: The lead has no number for this field\./)).toBeTruthy();
      // The lead without a number never reached the eligibility endpoint.
      expect(communicationApi.eligibility).not.toHaveBeenCalledWith(
        B,
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    } finally {
      LEADS[B] = lead(B, 'Beta GmbH');
    }
  });

  it('advances once the outcome is saved, and the next lead still waits for a tap', async () => {
    startQueue();
    putOperation('op1', A, { phase: 'in_progress' });
    useCallQueueStore.getState().change((q) => ({
      ...q,
      items: q.items.map((item, i) => (i === 0 ? { ...item, operationId: 'op1' } : item)),
    }));
    await renderQueue();
    expect(screen.getByRole('button', { name: 'Record outcome' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Skip' })).toBeDisabled();

    await act(async () => {
      useOperationsStore.getState().update('op1', (op) => ({
        ...op,
        phase: 'submitting',
        completePayload: { outcome: { disposition: 'interested', connected: 'yes', notes: 'ok' } },
      }));
      syncCallQueue();
    });
    expect(await screen.findByText('Lead 2 of 3')).toBeTruthy();
    expect(useCallQueueStore.getState().queue?.items[0]).toMatchObject({
      state: 'done',
      disposition: 'interested',
    });
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(native.placeCall).not.toHaveBeenCalled();
  });

  it('on resume with an open call it asks for the outcome and never dials', async () => {
    startQueue();
    putOperation('op1', A, { phase: 'dispatch_unknown' });
    useCallQueueStore.getState().change((q) => ({
      ...q,
      items: q.items.map((item, i) => (i === 0 ? { ...item, operationId: 'op1' } : item)),
    }));
    await renderQueue();
    expect(screen.getByText('Call open: record what happened before the next lead.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Call' })).toBeNull();
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(native.placeCall).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Record outcome' }));
    expect(navigation.navigate).toHaveBeenCalledWith('CallSession', {
      leadId: A,
      operationId: 'op1',
      queueId: 'q1',
    });
    expect(native.placeCall).not.toHaveBeenCalled();
  });

  it('pause and resume', async () => {
    startQueue();
    await renderQueue();
    await screen.findByText('Number +41 •• ••• 67');
    await fireEvent.press(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByText('The queue is paused.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Call' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Resume queue' }));
    expect(await screen.findByRole('button', { name: 'Call' })).toBeTruthy();
  });

  it('End queue shows the summary; Done clears the queue', async () => {
    startQueue([A, B]);
    putOperation('op1', A, {
      phase: 'done',
      completePayload: {
        outcome: {
          disposition: 'callback_requested',
          connected: 'yes',
          notes: 'call back',
          followUpAt: '2026-10-20T09:00:00Z',
        },
        qualification: {
          answers: [
            {
              fieldKey: 'need',
              label: 'Need',
              value: 'Boiler',
              status: 'answered',
              source: 'ai_proposed_user_confirmed',
              evidence: null,
              confidence: null,
            },
          ],
        },
      },
    });
    useCallQueueStore.getState().change((q) => ({
      ...q,
      items: q.items.map((item, i) => (i === 0 ? { ...item, operationId: 'op1' } : item)),
    }));
    syncCallQueue();
    await renderQueue();
    expect(screen.getByText('Lead 2 of 2')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'End queue' }));
    const confirm = screen.getAllByRole('button', { name: 'End queue' });
    await fireEvent.press(confirm[confirm.length - 1]!);

    expect(await screen.findByText('Queue ended')).toBeTruthy();
    expect(screen.getByText('1 of 2 leads called')).toBeTruthy();
    expect(screen.getByLabelText('Callbacks: 1')).toBeTruthy();
    expect(screen.getByLabelText('Answers collected: 1')).toBeTruthy();
    expect(screen.getByLabelText('Acme AG: Callback requested')).toBeTruthy();
    expect(screen.getByLabelText('Beta GmbH: Not called')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(useCallQueueStore.getState().queue).toBeNull();
    expect(navigation.goBack).toHaveBeenCalled();
  });
});
