// Workflow tests for the irreversible-side-effect rules. The CRM API and the native
// telephony module are faked; the outbox, recovery and sync logic run for real.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useSessionStore } from '@/features/auth/store/sessionStore';
import { ApiError } from '@/services/api/apiErrors';
import { __setNativeTelephonyForTests } from '@/services/telephony/telephonyService';

import { communicationApi } from '../api/communicationApi';
import { startCall, startSms, submitOutcome } from '../services/contactFlows';
import { flushOutbox, retryOperation, stopOutboxTimer } from '../services/outboxSync';
import { flushOperationsWrites, getOperation, useOperationsStore } from '../store/operationsStore';
import type { Receipt } from '../types';

jest.mock('../api/communicationApi', () => ({
  communicationApi: {
    create: jest.fn(),
    appendEvents: jest.fn(),
    complete: jest.fn(),
  },
}));

const api = communicationApi as jest.Mocked<typeof communicationApi>;
const lead = { id: 'a'.repeat(24), name: 'Muster AG' };
const USER = 'u1';
const ok = { status: 'ok' as const, error: null, at: null };
const fullReceipt: Receipt = {
  steps: {
    outcome: ok,
    contactLog: ok,
    leadContact: ok,
    statusChange: ok,
    qualification: ok,
    suppression: ok,
  },
  completedAt: '2026-10-16T10:00:00.000Z',
};

const native = {
  getCapabilities: jest.fn(),
  getActiveSims: jest.fn(),
  normalizeNumber: jest.fn(),
  placeCall: jest.fn(),
  openSmsComposer: jest.fn(),
  startCallStateMonitoring: jest.fn(async () => true),
  stopCallStateMonitoring: jest.fn(async () => undefined),
  getCallStateEvents: jest.fn(async () => []),
  clearCallStateEvents: jest.fn(async () => undefined),
  addListener: jest.fn(() => ({ remove: jest.fn() })),
};

const outcome = {
  disposition: 'interested' as const,
  connected: 'yes' as const,
  notes: 'Needs a new boiler before winter.',
  followUpAt: null,
  followUpTimezone: null,
  statusChange: 'contacted',
  doNotContact: false,
  answers: [],
};

function signIn(id: string) {
  useSessionStore.getState().setAuthenticated({
    id,
    email: `${id}@example.com`,
    firstName: null,
    lastName: null,
    fullName: id,
    phone: null,
    language: null,
    avatarUrl: null,
    roleName: null,
    status: null,
  });
}

function created(operationId: string) {
  return { communication: { operationId } as never, dialNumber: '+41 44 000 00 00' };
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  __setNativeTelephonyForTests(native as never);
  signIn(USER);
  await useOperationsStore.getState().activate(USER);
  api.create.mockImplementation(async (_leadId, input) => created(input.operationId));
  api.appendEvents.mockResolvedValue({} as never);
  api.complete.mockResolvedValue({ communication: {} as never, receipt: fullReceipt });
});

afterEach(() => {
  stopOutboxTimer();
  __setNativeTelephonyForTests(undefined);
});

describe('startCall', () => {
  it('never dials when the CRM does not authorise the attempt', async () => {
    api.create.mockRejectedValue(
      new ApiError({ kind: 'http', status: 409, code: 'CONTACT_NOT_ELIGIBLE', message: 'x' }),
    );
    await expect(
      startCall({
        userId: USER,
        lead,
        destinationField: 'phone',
        sim: null,
        canPlaceDirect: true,
        mode: 'assisted',
      }),
    ).rejects.toMatchObject({ code: 'NOT_AUTHORISED' });
    expect(native.placeCall).not.toHaveBeenCalled();
    const [op] = Object.values(useOperationsStore.getState().operations);
    expect(op?.phase).toBe('abandoned');
  });

  it('never dials while offline (the CRM is unreachable)', async () => {
    api.create.mockRejectedValue(new ApiError({ kind: 'network', message: 'offline' }));
    await expect(
      startCall({
        userId: USER,
        lead,
        destinationField: 'phone',
        sim: null,
        canPlaceDirect: false,
        mode: 'manual',
      }),
    ).rejects.toMatchObject({ code: 'NOT_AUTHORISED' });
    expect(native.placeCall).not.toHaveBeenCalled();
  });

  it('dials the number the CRM returned, on the chosen SIM, after persisting "dispatching"', async () => {
    let persistedPhaseAtDial: string | undefined;
    native.placeCall.mockImplementation(async (request: { operationId: string }) => {
      const raw = await AsyncStorage.getItem(`updata.communication.operations.v1.${USER}`);
      persistedPhaseAtDial = JSON.parse(raw ?? '{}').operations?.[request.operationId]?.phase;
      return { route: 'telecom_direct', subscriptionApplied: true };
    });
    const sim = {
      subscriptionId: 7,
      slotIndex: 1,
      carrierName: 'Swisscom',
      displayName: 'Work',
      countryIso: 'ch',
      isEmbedded: false,
      isDefaultVoice: false,
      isDefaultSms: false,
      number: null,
    };

    const id = await startCall({
      userId: USER,
      lead,
      destinationField: 'mobile',
      sim,
      canPlaceDirect: true,
      mode: 'assisted',
    });

    expect(persistedPhaseAtDial).toBe('dispatching');
    expect(native.placeCall).toHaveBeenCalledTimes(1);
    expect(native.placeCall).toHaveBeenCalledWith({
      number: '+41 44 000 00 00',
      subscriptionId: 7,
      operationId: id,
    });
    expect(api.create.mock.calls[0]?.[1]).toMatchObject({
      destinationField: 'mobile',
      route: 'telecom_direct',
    });
    expect(getOperation(id)?.phase).toBe('in_progress');
  });

  it('records a native failure as dispatch_failed and does not retry the dial', async () => {
    native.placeCall.mockRejectedValue(Object.assign(new Error('gone'), { code: 'SUBSCRIPTION_NOT_FOUND' }));
    const id = await startCall({
      userId: USER,
      lead,
      destinationField: 'phone',
      sim: null,
      canPlaceDirect: true,
      mode: 'assisted',
    });
    expect(getOperation(id)).toMatchObject({
      phase: 'dispatch_failed',
      dispatchError: 'SUBSCRIPTION_NOT_FOUND',
    });
    await flushOutbox();
    expect(native.placeCall).toHaveBeenCalledTimes(1);
  });
});

describe('recovery', () => {
  it('turns an interrupted dispatch into dispatch_unknown and never redials', async () => {
    native.placeCall.mockImplementation(() => new Promise(() => undefined)); // the app "dies" mid-dial
    void startCall({
      userId: USER,
      lead,
      destinationField: 'phone',
      sim: null,
      canPlaceDirect: true,
      mode: 'assisted',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await flushOperationsWrites();

    // Relaunch: a fresh load of the persisted outbox.
    useOperationsStore.getState().deactivate();
    await useOperationsStore.getState().activate(USER);
    const [op] = Object.values(useOperationsStore.getState().operations);
    expect(op?.phase).toBe('dispatch_unknown');
    await flushOutbox();
    expect(native.placeCall).toHaveBeenCalledTimes(1);
  });
});

describe('outcome sync', () => {
  async function placedCall() {
    native.placeCall.mockResolvedValue({ route: 'dialer_handoff', subscriptionApplied: false });
    return startCall({
      userId: USER,
      lead,
      destinationField: 'phone',
      sim: null,
      canPlaceDirect: false,
      mode: 'manual',
    });
  }

  it('saves locally first and retries only the idempotent CRM write after a lost connection', async () => {
    const id = await placedCall();
    api.complete.mockRejectedValueOnce(new ApiError({ kind: 'network', message: 'lost' }));

    await submitOutcome(id, outcome);
    expect(getOperation(id)).toMatchObject({ phase: 'submitting' });
    expect(getOperation(id)?.sync.lastError?.kind).toBe('transient');

    await retryOperation(id);
    expect(api.complete).toHaveBeenCalledTimes(2);
    expect(api.complete.mock.calls[0]?.[2]).toEqual(api.complete.mock.calls[1]?.[2]); // same payload, same operation
    expect(getOperation(id)?.phase).toBe('done');
    expect(native.placeCall).toHaveBeenCalledTimes(1);
  });

  it('pauses on a conflict instead of retrying', async () => {
    const id = await placedCall();
    api.complete.mockRejectedValue(
      new ApiError({ kind: 'http', status: 409, code: 'ALREADY_COMPLETED', message: 'x' }),
    );
    await submitOutcome(id, outcome);
    expect(getOperation(id)).toMatchObject({ phase: 'needs_attention', sync: { paused: true } });
    await flushOutbox();
    expect(api.complete).toHaveBeenCalledTimes(1);
  });

  it('shows partial success when the CRM reports a failed step', async () => {
    const id = await placedCall();
    api.complete.mockResolvedValue({
      communication: {} as never,
      receipt: {
        ...fullReceipt,
        steps: {
          ...fullReceipt.steps,
          statusChange: { ...ok, status: 'failed', error: 'LEAD_CONVERTED_PROTECTED' },
        },
      },
    });
    await submitOutcome(id, outcome);
    expect(getOperation(id)?.phase).toBe('needs_attention');
  });

  it('submits an outcome only once even if the user taps again', async () => {
    const id = await placedCall();
    await submitOutcome(id, outcome);
    await submitOutcome(id, { ...outcome, disposition: 'not_interested' });
    expect(api.complete).toHaveBeenCalledTimes(1);
    expect(api.complete.mock.calls[0]?.[2].outcome.disposition).toBe('interested');
  });

  it('drops a late response that arrives after another user signed in', async () => {
    const id = await placedCall();
    let release: (value: unknown) => void = () => undefined;
    api.complete.mockImplementation(() => new Promise((resolve) => (release = resolve)) as never);
    const submitting = submitOutcome(id, outcome);
    await new Promise((resolve) => setTimeout(resolve, 0));

    signIn('u2');
    await useOperationsStore.getState().activate('u2');
    release({ communication: {}, receipt: fullReceipt });
    await submitting;

    expect(useOperationsStore.getState().operations).toEqual({});
    const raw = await AsyncStorage.getItem(`updata.communication.operations.v1.${USER}`);
    expect(JSON.parse(raw ?? '{}').operations[id].phase).toBe('submitting'); // u1's work is intact, not marked done
  });

  it("does not send another user's queued work", async () => {
    const id = await placedCall();
    api.complete.mockRejectedValueOnce(new ApiError({ kind: 'network', message: 'lost' }));
    await submitOutcome(id, outcome);
    await flushOperationsWrites();

    signIn('u2');
    await useOperationsStore.getState().activate('u2');
    api.complete.mockClear();
    await flushOutbox();
    expect(api.complete).not.toHaveBeenCalled();
  });
});

describe('startSms', () => {
  it('opens the composer with the exact text and records only "opened"', async () => {
    native.openSmsComposer.mockResolvedValue(true);
    const id = await startSms({
      userId: USER,
      lead,
      destinationField: 'mobile',
      body: 'Hello',
      templateId: null,
    });
    expect(native.openSmsComposer).toHaveBeenCalledWith('+41 44 000 00 00', 'Hello');
    const op = getOperation(id);
    expect(op?.phase).toBe('in_progress');
    // Already synced to the CRM by the outbox: assert on what was sent.
    await flushOutbox();
    const sent = api.appendEvents.mock.calls.flatMap(([, , events]) => events.map((event) => event.type));
    expect(sent).toEqual(['dispatch_requested', 'composer_opened']);
    expect(op?.pendingEvents).toEqual([]);
  });

  it('marks a missing SMS app as dispatch_failed', async () => {
    native.openSmsComposer.mockResolvedValue(false);
    const id = await startSms({
      userId: USER,
      lead,
      destinationField: 'mobile',
      body: 'Hello',
      templateId: null,
    });
    expect(getOperation(id)?.phase).toBe('dispatch_failed');
  });
});
