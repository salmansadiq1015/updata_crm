import { canSendNow, getDeviceId, smsAgentLoop } from '../domain/agentLoop';

const mockRunCycle = jest.fn();
jest.mock('../domain/runner', () => ({ runCycle: (...args: unknown[]) => mockRunCycle(...args) }));

const mockCampaigns = jest.fn();
jest.mock('../api/simSmsApi', () => ({ simSmsApi: { campaigns: (...a: unknown[]) => mockCampaigns(...a) } }));

const mockJournal = jest.fn(async () => []);
const mockInbound = jest.fn(async () => []);
jest.mock('@/services/telephony/telephonyService', () => ({
  telephony: {
    getCapabilities: jest.fn(async () => ({
      directSmsSupported: true,
      airplaneMode: false,
      simState: 'ready',
    })),
    getSmsJournal: () => mockJournal(),
    getInboundSms: () => mockInbound(),
  },
}));

const cycle = (nextDelayMs = 10) => ({ nextDelayMs, reported: 0, uploaded: 0, sent: null, error: null });

beforeEach(() => {
  mockRunCycle.mockReset();
  mockCampaigns.mockReset();
  mockJournal.mockResolvedValue([]);
  mockInbound.mockResolvedValue([]);
});

describe('SMS agent loop', () => {
  it('keeps a stable device id', async () => {
    const a = await getDeviceId();
    expect(a).toMatch(/^android-/);
    expect(await getDeviceId()).toBe(a);
  });

  it('runs while a campaign is running, exits when idle, and concurrent starts share one run', async () => {
    mockRunCycle.mockResolvedValue(cycle(5));
    mockCampaigns.mockResolvedValueOnce([{ id: 'k1' }]).mockResolvedValue([]);
    const first = smsAgentLoop.run();
    const second = smsAgentLoop.run();
    expect(second).toBe(first);
    smsAgentLoop.kick(); // forces an immediate re-check of running mockCampaigns
    await first;
    expect(mockRunCycle).toHaveBeenCalledTimes(2);
    expect(smsAgentLoop.getStatus().running).toBe(false);
    expect(mockRunCycle.mock.calls[0][0]).toMatchObject({
      canSend: true,
      deviceId: expect.stringMatching(/^android-/),
    });
  });

  it('keeps going while results or replies are still waiting to be uploaded, even with no campaign running', async () => {
    mockRunCycle.mockResolvedValue(cycle(1));
    mockCampaigns.mockResolvedValue([]);
    mockJournal.mockResolvedValueOnce([{ messageId: 'm1' }] as never).mockResolvedValue([]);
    await smsAgentLoop.run();
    expect(mockRunCycle).toHaveBeenCalledTimes(2);
  });

  it('stop() ends a sleeping loop immediately', async () => {
    mockRunCycle.mockResolvedValue(cycle(60_000));
    mockCampaigns.mockResolvedValue([{ id: 'k1' }]);
    const run = smsAgentLoop.run();
    await new Promise((r) => setTimeout(r, 20));
    smsAgentLoop.stop();
    await run;
    expect(mockRunCycle).toHaveBeenCalledTimes(1);
  });

  it('does not send while offline (airplane mode or SIM not ready)', () => {
    const base = { directSmsSupported: true, airplaneMode: false, simState: 'ready' } as never;
    expect(canSendNow(base)).toBe(true);
    expect(canSendNow({ ...(base as object), airplaneMode: true } as never)).toBe(false);
    expect(canSendNow({ ...(base as object), simState: 'not_ready' } as never)).toBe(false);
    expect(canSendNow({ ...(base as object), directSmsSupported: false } as never)).toBe(false);
  });
});
