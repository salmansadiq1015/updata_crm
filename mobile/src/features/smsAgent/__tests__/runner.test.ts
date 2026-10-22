import {
  DELIVERY_WAIT_MS,
  ERROR_DELAY_MS,
  RESULT_TIMEOUT_MS,
  runCycle,
  type RunnerApi,
  type RunnerNative,
} from '../domain/runner';
import type { InboundSms, SmsJournalEntry } from '@/services/telephony/types';
import type { LeaseResult } from '../types';

const NOW = 1_800_000_000_000;
const DEVICE = 'device-1234-abcd';

const leased = (id = 'm1', to = '+41795551001'): LeaseResult => ({
  message: {
    id,
    conversationId: 'c1',
    campaignId: 'k1',
    leadId: 'l1',
    leadName: 'Acme',
    to,
    body: 'Hello? Reply STOP to opt out.',
    segments: 1,
    subscriptionId: 2,
    kind: 'opening',
  },
  retryAfterMs: 20_000,
});

function httpError(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), { status, kind: 'http' });
}

function setup(overrides: { lease?: LeaseResult; journal?: SmsJournalEntry[]; inbound?: InboundSms[] } = {}) {
  const journal = [...(overrides.journal ?? [])];
  const inbound = [...(overrides.inbound ?? [])];
  const calls: string[] = [];
  const api = {
    lease: jest.fn(async () => overrides.lease ?? { message: null, retryAfterMs: 60_000 }),
    attempting: jest.fn(async () => {
      calls.push('attempting');
      return { proceed: true };
    }),
    result: jest.fn(async () => undefined),
    delivery: jest.fn(async () => undefined),
    watchList: jest.fn(async () => ['+41795550000']),
    inbound: jest.fn(async () => ({ matched: true })),
  } as unknown as jest.Mocked<RunnerApi>;
  const native = {
    sendSms: jest.fn(async () => {
      calls.push('sendSms');
      return { parts: 1 };
    }),
    getSmsJournal: jest.fn(async () => journal),
    ackSmsJournal: jest.fn(async () => undefined),
    getInboundSms: jest.fn(async () => inbound),
    ackInboundSms: jest.fn(async () => undefined),
    setWatchedNumbers: jest.fn(async () => undefined),
  } as unknown as jest.Mocked<RunnerNative>;
  const deps = { api, native, deviceId: DEVICE, canSend: true, now: () => NOW };
  return { api, native, deps, calls };
}

const entry = (over: Partial<SmsJournalEntry>): SmsJournalEntry => ({
  messageId: 'm0',
  status: 'sent',
  errorCode: null,
  parts: 1,
  startedAt: NOW - 60_000,
  finishedAt: NOW - 50_000,
  deliveredAt: null,
  ...over,
});

describe('SIM SMS runner — sending', () => {
  it('sends only after the server confirms the attempt, on the leased SIM, watching the number first', async () => {
    const { api, native, deps, calls } = setup({ lease: leased() });
    const res = await runCycle(deps);
    expect(calls).toEqual(['attempting', 'sendSms']);
    expect(native.sendSms).toHaveBeenCalledWith({
      messageId: 'm1',
      to: '+41795551001',
      body: expect.stringContaining('STOP'),
      subscriptionId: 2,
    });
    expect(native.setWatchedNumbers).toHaveBeenLastCalledWith(['+41795550000', '+41795551001']);
    expect(api.attempting).toHaveBeenCalledWith('m1', DEVICE);
    expect(res).toMatchObject({ sent: 'm1', nextDelayMs: 20_000, error: null });
  });

  it('never sends when the lease was lost (409) or the server says not to proceed', async () => {
    const a = setup({ lease: leased() });
    a.api.attempting.mockRejectedValueOnce(httpError(409));
    expect((await runCycle(a.deps)).sent).toBeNull();
    expect(a.native.sendSms).not.toHaveBeenCalled();

    const b = setup({ lease: leased() });
    b.api.attempting.mockResolvedValueOnce({ proceed: false });
    await runCycle(b.deps);
    expect(b.native.sendSms).not.toHaveBeenCalled();
  });

  it('a network error on "attempting" sends nothing and backs off', async () => {
    const { api, native, deps } = setup({ lease: leased() });
    api.attempting.mockRejectedValueOnce(Object.assign(new Error('offline'), { kind: 'network' }));
    const res = await runCycle(deps);
    expect(native.sendSms).not.toHaveBeenCalled();
    expect(res).toMatchObject({ error: 'offline', nextDelayMs: ERROR_DELAY_MS });
  });

  it('reports a rejection that happened before the modem got the message as failed', async () => {
    const { api, native, deps } = setup({ lease: leased() });
    native.sendSms.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'PERMISSION_DENIED' }));
    await runCycle(deps);
    expect(api.result).toHaveBeenCalledWith('m1', {
      deviceId: DEVICE,
      status: 'failed',
      errorCode: 'PERMISSION_DENIED',
    });
  });

  it('ALREADY_ATTEMPTED is left to the journal — never reported as a failure (which could allow a resend)', async () => {
    const { api, native, deps } = setup({ lease: leased() });
    native.sendSms.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'ALREADY_ATTEMPTED' }));
    await runCycle(deps);
    expect(api.result).not.toHaveBeenCalled();
  });

  it('without SEND_SMS it leases nothing but still uploads replies', async () => {
    const { api, deps } = setup({
      inbound: [
        {
          key: 'in_1',
          from: '0795551001',
          matchedTo: '+41795551001',
          body: 'yes',
          receivedAt: NOW,
          subscriptionId: 2,
        },
      ],
    });
    const res = await runCycle({ ...deps, canSend: false });
    expect(api.lease).not.toHaveBeenCalled();
    expect(api.inbound).toHaveBeenCalledTimes(1);
    expect(res.nextDelayMs).toBe(60_000);
  });
});

describe('SIM SMS runner — journal reconciliation', () => {
  it('reports sent/failed, acks failed at once, keeps a sent entry until delivery (or a day)', async () => {
    const { api, native, deps } = setup({
      journal: [
        entry({ messageId: 'sent-waiting' }),
        entry({ messageId: 'sent-delivered', deliveredAt: NOW - 1000 }),
        entry({ messageId: 'failed', status: 'failed', errorCode: 'RESULT_ERROR_NO_SERVICE' }),
        entry({ messageId: 'sent-old', finishedAt: NOW - DELIVERY_WAIT_MS - 1 }),
      ],
    });
    const res = await runCycle(deps);
    expect(res.reported).toBe(4);
    expect(api.result).toHaveBeenCalledWith(
      'failed',
      expect.objectContaining({ status: 'failed', errorCode: 'RESULT_ERROR_NO_SERVICE' }),
    );
    expect(api.delivery).toHaveBeenCalledWith(
      'sent-delivered',
      expect.objectContaining({ deviceId: DEVICE }),
    );
    expect(native.ackSmsJournal).toHaveBeenCalledWith(['sent-delivered', 'failed', 'sent-old']);
  });

  it('leaves SMS-queue sends (smsq- ids) to their own flow: never reported to the agent server', async () => {
    const { api, native, deps } = setup({
      journal: [
        entry({ messageId: 'smsq-op-1' }),
        entry({ messageId: 'agent-msg', status: 'failed', errorCode: 'X' }),
      ],
    });
    const res = await runCycle(deps);
    expect(res.reported).toBe(1);
    expect(api.result).toHaveBeenCalledTimes(1);
    expect(api.result).toHaveBeenCalledWith('agent-msg', expect.anything());
    expect(native.ackSmsJournal).not.toHaveBeenCalledWith(expect.arrayContaining(['smsq-op-1']));
  });

  it('an attempt with no SENT callback becomes "unknown" only after the timeout', async () => {
    const fresh = setup({
      journal: [entry({ messageId: 'a', status: 'attempting', startedAt: NOW - 1000, finishedAt: null })],
    });
    await runCycle(fresh.deps);
    expect(fresh.api.result).not.toHaveBeenCalled();

    const stale = setup({
      journal: [
        entry({
          messageId: 'a',
          status: 'attempting',
          startedAt: NOW - RESULT_TIMEOUT_MS - 1,
          finishedAt: null,
        }),
      ],
    });
    await runCycle(stale.deps);
    expect(stale.api.result).toHaveBeenCalledWith(
      'a',
      expect.objectContaining({ status: 'unknown', errorCode: 'NO_SENT_CALLBACK' }),
    );
    expect(stale.native.ackSmsJournal).toHaveBeenCalledWith(['a']);
  });

  it('keeps entries when the server is unreachable (retried next cycle); drops ones the server rejects for good', async () => {
    const offline = setup({ journal: [entry({ messageId: 'x', status: 'failed' })] });
    offline.api.result.mockRejectedValueOnce(Object.assign(new Error('offline'), { kind: 'network' }));
    const res = await runCycle(offline.deps);
    expect(res.error).toBe('offline');
    expect(offline.native.ackSmsJournal).not.toHaveBeenCalled();

    const rejected = setup({ journal: [entry({ messageId: 'y', status: 'failed' })] });
    rejected.api.result.mockRejectedValueOnce(httpError(404));
    await runCycle(rejected.deps);
    expect(rejected.native.ackSmsJournal).toHaveBeenCalledWith(['y']);
  });
});

describe('SIM SMS runner — inbound', () => {
  const sms = (key: string): InboundSms => ({
    key,
    from: '0795551001',
    matchedTo: '+41795551001',
    body: `reply ${key}`,
    receivedAt: NOW,
    subscriptionId: 2,
  });

  it('uploads replies and acks exactly the uploaded ones when the network drops midway', async () => {
    const { api, native, deps } = setup({ inbound: [sms('in_1'), sms('in_2'), sms('in_3')] });
    api.inbound
      .mockResolvedValueOnce({ matched: true })
      .mockRejectedValueOnce(Object.assign(new Error('offline'), { kind: 'network' }));
    const res = await runCycle(deps);
    expect(native.ackInboundSms).toHaveBeenCalledWith(['in_1']);
    expect(res.error).toBe('offline');
    expect(api.lease).not.toHaveBeenCalled(); // nothing is sent while replies are pending upload
    expect(api.inbound).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceMessageKey: 'in_1',
        matchedTo: '+41795551001',
        receivedAt: new Date(NOW).toISOString(),
      }),
    );
  });
});
