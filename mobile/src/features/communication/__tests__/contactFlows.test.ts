// Workflow tests for the irreversible-side-effect rules. The CRM API and the native
// telephony module are faked; the outbox, recovery and sync logic run for real.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useSessionStore } from '@/features/auth/store/sessionStore';
import { ApiError } from '@/services/api/apiErrors';
import { __setNativeTelephonyForTests } from '@/services/telephony/telephonyService';

import { communicationApi } from '../api/communicationApi';
import { startCall, startDirectSms, startSms, submitOutcome } from '../services/contactFlows';
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

function created(operationId: string, link: { url: string } | null = null) {
  return { communication: { operationId } as never, dialNumber: '+41 44 000 00 00', link };
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
    expect(getOperation(id)?.pendingEvents).toEqual([]);
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

describe('startDirectSms (client / company builds: SEND_SMS from the SIM)', () => {
  type StatusListener = (event: { messageId: string; status: string }) => void;
  let statusListener: StatusListener | null = null;
  const sim = {
    subscriptionId: 3,
    slotIndex: 0,
    carrierName: 'Jazz',
    displayName: 'Jazz',
    countryIso: 'pk',
    isEmbedded: false,
    isDefaultVoice: false,
    isDefaultSms: false,
    number: null,
  };
  const sendNative = {
    ...native,
    sendSms: jest.fn(async (_req: { messageId: string }) => ({ parts: 1 })),
    ackSmsJournal: jest.fn(async (_ids: string[]) => undefined),
    getSmsJournal: jest.fn(async (): Promise<unknown[]> => []),
    addListener: jest.fn((name: string, cb: StatusListener) => {
      if (name === 'onSmsStatus') statusListener = cb;
      return { remove: jest.fn() };
    }),
  };
  beforeEach(() => {
    statusListener = null;
    __setNativeTelephonyForTests(sendNative as never);
  });
  const input = {
    userId: USER,
    lead,
    destinationField: 'mobile' as const,
    body: 'Salam, quick question',
    templateId: null,
    sim,
  };

  it("is authorised by the CRM as sms_direct, sent on the chosen SIM, and logged with the phone's result", async () => {
    sendNative.sendSms.mockImplementationOnce(async (req: { messageId: string }) => {
      setTimeout(() => statusListener?.({ messageId: req.messageId, status: 'sent' }), 0);
      return { parts: 1 };
    });
    const { operationId, status } = await startDirectSms(input);
    expect(status).toBe('sent');
    expect(api.create).toHaveBeenCalledWith(
      lead.id,
      expect.objectContaining({ channel: 'sms', route: 'sms_direct' }),
    );
    expect(sendNative.sendSms).toHaveBeenCalledWith({
      messageId: `smsq-${operationId}`,
      to: '+41 44 000 00 00',
      body: 'Salam, quick question',
      subscriptionId: 3,
    });
    await flushOutbox();
    expect(api.complete).toHaveBeenCalledWith(
      lead.id,
      operationId,
      expect.objectContaining({
        outcome: expect.objectContaining({ disposition: 'sent', connected: 'unknown' }),
        sms: expect.objectContaining({ sendStatus: 'device_sent', body: 'Salam, quick question' }),
      }),
    );
    // Sent: kept in the native journal until the carrier's delivery report arrives.
    expect(sendNative.ackSmsJournal).not.toHaveBeenCalledWith([`smsq-${operationId}`]);

    const finishedAt = Date.now();
    sendNative.getSmsJournal.mockResolvedValueOnce([
      {
        messageId: `smsq-${operationId}`,
        status: 'sent',
        errorCode: null,
        parts: 1,
        startedAt: finishedAt - 2_000,
        finishedAt,
        deliveredAt: finishedAt + 5_000,
      },
    ]);
    await flushOutbox();
    expect(api.appendEvents).toHaveBeenLastCalledWith(
      lead.id,
      operationId,
      expect.arrayContaining([expect.objectContaining({ type: 'sms_delivered', source: 'native' })]),
    );
    expect(sendNative.ackSmsJournal).toHaveBeenLastCalledWith([`smsq-${operationId}`]);
  });

  it('stops waiting for a delivery report after 72 hours without reporting one', async () => {
    const old = Date.now() - 73 * 60 * 60_000;
    sendNative.getSmsJournal.mockResolvedValueOnce([
      {
        messageId: 'smsq-gone',
        status: 'sent',
        errorCode: null,
        parts: 1,
        startedAt: old,
        finishedAt: old,
        deliveredAt: null,
      },
      {
        messageId: 'smsq-fresh',
        status: 'sent',
        errorCode: null,
        parts: 1,
        startedAt: Date.now(),
        finishedAt: Date.now(),
        deliveredAt: null,
      },
      {
        messageId: 'agent-1',
        status: 'sent',
        errorCode: null,
        parts: 1,
        startedAt: old,
        finishedAt: old,
        deliveredAt: old,
      },
    ]);
    await flushOutbox();
    expect(sendNative.ackSmsJournal).toHaveBeenLastCalledWith(['smsq-gone']);
    expect(api.appendEvents).not.toHaveBeenCalled();
  });

  it('a link campaign: the CRM issues the personal link and it replaces {link} in the SMS', async () => {
    api.create.mockImplementationOnce(async (_leadId, req) =>
      created(req.operationId, { url: 'https://upd.example/c/AbCdEfGhIjKlMnOpQrStUv' }),
    );
    sendNative.sendSms.mockImplementationOnce(async (req: { messageId: string }) => {
      setTimeout(() => statusListener?.({ messageId: req.messageId, status: 'sent' }), 0);
      return { parts: 1 };
    });
    await startDirectSms({ ...input, body: 'Hi Ali, quick questions: {link}', link: { campaignId: 'c1' } });
    expect(api.create).toHaveBeenCalledWith(
      lead.id,
      expect.objectContaining({ linkCampaignId: 'c1', linkPurpose: 'initial' }),
    );
    expect(sendNative.sendSms).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Hi Ali, quick questions: https://upd.example/c/AbCdEfGhIjKlMnOpQrStUv',
      }),
    );
  });

  it('never sends a raw {link}: no link from the CRM means nothing is sent', async () => {
    await expect(startDirectSms({ ...input, body: 'Answer here: {link}' })).rejects.toMatchObject({
      code: 'LINK_NOT_ISSUED',
    });
    expect(sendNative.sendSms).not.toHaveBeenCalled();
  });

  it('records a SIM send failure as device_failed / not_sent', async () => {
    sendNative.sendSms.mockImplementationOnce(async (req: { messageId: string }) => {
      setTimeout(() => statusListener?.({ messageId: req.messageId, status: 'failed' }), 0);
      return { parts: 1 };
    });
    const { operationId, status } = await startDirectSms(input);
    expect(status).toBe('failed');
    await flushOutbox();
    expect(api.complete).toHaveBeenCalledWith(
      lead.id,
      operationId,
      expect.objectContaining({
        outcome: expect.objectContaining({ disposition: 'not_sent' }),
        sms: expect.objectContaining({ sendStatus: 'device_failed' }),
      }),
    );
  });

  it('a send refused by the phone before transmission is not_sent and never retried', async () => {
    sendNative.sendSms.mockRejectedValueOnce(new Error('PERMISSION_DENIED'));
    const { status } = await startDirectSms(input);
    expect(status).toBe('failed');
    expect(sendNative.sendSms).toHaveBeenCalledTimes(1);
  });

  it('no result from the phone in time is recorded as unknown, not resent', async () => {
    jest.useFakeTimers();
    try {
      const pending = startDirectSms(input);
      for (let i = 0; i < 20; i += 1) await Promise.resolve();
      await jest.advanceTimersByTimeAsync(61_000);
      const { status } = await pending;
      expect(status).toBe('unknown');
      expect(sendNative.sendSms).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('never sends when the CRM does not authorise it (e.g. SMS opt-out)', async () => {
    api.create.mockRejectedValueOnce(
      new ApiError({ kind: 'http', status: 409, code: 'CONTACT_NOT_ELIGIBLE', message: 'no' }),
    );
    await expect(startDirectSms(input)).rejects.toMatchObject({ code: 'NOT_AUTHORISED' });
    expect(sendNative.sendSms).not.toHaveBeenCalled();
  });
});
