import { test } from 'node:test';
import { setImmediate } from 'node:timers';
import assert from 'node:assert/strict';
import { createSessionController, backoffDelay, STATES, DISCONNECT_REASONS, DEFAULT_POLICY } from '../src/sessionController.js';

// Manual clock: timers only fire when the test advances time.
function fakeClock() {
  let now = 1_000_000;
  let seq = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout: (fn, ms) => { seq += 1; timers.set(seq, { at: now + ms, fn }); return seq; },
    clearTimeout: (id) => timers.delete(id),
    pending: () => timers.size,
    async advance(ms) {
      const until = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
        await flush();
      }
      now = until;
      await flush();
    },
  };
}
const flush = () => new Promise((r) => setImmediate(r));

function fakeAdapter({ rejectWith } = {}) {
  const calls = { connect: [], disconnect: [] };
  return {
    calls,
    connect: async ({ attemptId }) => { calls.connect.push(attemptId); if (rejectWith) throw new Error(rejectWith); },
    disconnect: async ({ attemptId }) => { calls.disconnect.push(attemptId); },
  };
}

function setup(opts = {}) {
  const clock = fakeClock();
  const adapter = opts.adapter ?? fakeAdapter();
  const events = [];
  const ctl = createSessionController({ adapter, clock, random: () => 0.5, policy: opts.policy, onChange: (e) => events.push(e) });
  return { clock, adapter, ctl, events };
}

async function connected(env) {
  env.ctl.start();
  await flush();
  const id = env.ctl.status().attemptId;
  env.ctl.handle({ type: 'slc_connected', attemptId: id });
  return id;
}

test('backoff grows exponentially, is capped, and jitter stays within ±10%', () => {
  const mid = () => 0.5;
  assert.equal(backoffDelay(1, DEFAULT_POLICY, mid), 2000);
  assert.equal(backoffDelay(2, DEFAULT_POLICY, mid), 4000);
  assert.equal(backoffDelay(3, DEFAULT_POLICY, mid), 8000);
  assert.equal(backoffDelay(10, DEFAULT_POLICY, mid), 30000);
  assert.equal(backoffDelay(1, DEFAULT_POLICY, () => 0), 1800);
  assert.equal(backoffDelay(1, DEFAULT_POLICY, () => 1), 2200);
});

test('successful connect reaches CONNECTED and reports capabilities-independent status', async () => {
  const env = setup();
  await connected(env);
  const s = env.ctl.status();
  assert.equal(s.state, STATES.CONNECTED);
  assert.equal(s.attempt, 0);
  assert.equal(s.lastError, null);
  assert.equal(env.adapter.calls.connect.length, 1);
  assert.equal(env.clock.pending(), 0, 'connect timeout cleared');
});

test('duplicate start() while connecting or connected does not open a second connection', async () => {
  const env = setup();
  env.ctl.start();
  env.ctl.start();
  await flush();
  env.ctl.start();
  env.ctl.handle({ type: 'slc_connected', attemptId: env.ctl.status().attemptId });
  env.ctl.start();
  await flush();
  assert.equal(env.adapter.calls.connect.length, 1);
});

test('connect timeout cancels the attempt, backs off, and gives up after maxAttempts', async () => {
  const env = setup();
  env.ctl.start();
  await flush();
  await env.clock.advance(DEFAULT_POLICY.connectTimeoutMs);
  assert.equal(env.ctl.status().state, STATES.BACKOFF);
  assert.equal(env.ctl.status().lastError.reason, DISCONNECT_REASONS.CONNECT_TIMEOUT);
  await env.clock.advance(2000 + DEFAULT_POLICY.connectTimeoutMs); // retry 2 times out
  await env.clock.advance(4000 + DEFAULT_POLICY.connectTimeoutMs); // retry 3 times out
  const s = env.ctl.status();
  assert.equal(s.state, STATES.FAILED);
  assert.equal(env.adapter.calls.connect.length, DEFAULT_POLICY.maxAttempts);
  assert.equal(env.adapter.calls.disconnect.length, DEFAULT_POLICY.maxAttempts, 'each timed-out attempt is cancelled');
  assert.equal(env.clock.pending(), 0, 'no timer left after giving up');
  await env.clock.advance(120_000);
  assert.equal(env.adapter.calls.connect.length, DEFAULT_POLICY.maxAttempts, 'no retries after FAILED');
});

test('platform rejection keeps its reason and detail (actionable), then retries', async () => {
  const env = setup({ adapter: fakeAdapter({ rejectWith: 'RFCOMM channel refused (0x391)' }) });
  env.ctl.start();
  await flush();
  const s = env.ctl.status();
  assert.equal(s.state, STATES.BACKOFF);
  assert.deepEqual([s.lastError.reason, s.lastError.detail], [DISCONNECT_REASONS.REJECTED, 'RFCOMM channel refused (0x391)']);
});

test('phone-initiated HFP close (baseband up) is REMOTE_CLOSED and reconnects with backoff', async () => {
  const env = setup();
  const id = await connected(env);
  await env.clock.advance(60_000);
  env.ctl.handle({ type: 'slc_disconnected', attemptId: id, initiator: 'remote', aclConnected: true });
  let s = env.ctl.status();
  assert.equal(s.state, STATES.BACKOFF);
  assert.equal(s.lastDisconnect.reason, DISCONNECT_REASONS.REMOTE_CLOSED);
  assert.equal(s.lastDisconnect.connectedForMs, 60_000);
  await env.clock.advance(2000);
  env.ctl.handle({ type: 'slc_connected', attemptId: env.ctl.status().attemptId });
  s = env.ctl.status();
  assert.equal(s.state, STATES.CONNECTED);
  assert.equal(s.reconnects, 1);
});

test('baseband loss is LINK_LOST, distinct from a phone-side HFP close', async () => {
  const env = setup();
  const id = await connected(env);
  env.ctl.handle({ type: 'slc_disconnected', attemptId: id, initiator: 'remote', aclConnected: false });
  assert.equal(env.ctl.status().lastDisconnect.reason, DISCONNECT_REASONS.LINK_LOST);
});

test('gateway-initiated stop disconnects once, does not reconnect, and clears timers', async () => {
  const env = setup();
  const id = await connected(env);
  const stopping = env.ctl.stop('operator');
  assert.equal(env.ctl.status().state, STATES.DISCONNECTING);
  env.ctl.handle({ type: 'slc_disconnected', attemptId: id, initiator: 'gateway', aclConnected: true });
  const s = await stopping;
  assert.equal(s.state, STATES.STOPPED);
  assert.equal(s.lastDisconnect.reason, DISCONNECT_REASONS.GATEWAY_REQUESTED);
  assert.equal(env.adapter.calls.disconnect.length, 1);
  await env.clock.advance(120_000);
  assert.equal(env.adapter.calls.connect.length, 1, 'no reconnect after a requested stop');
  assert.equal(env.clock.pending(), 0);
});

test('stop() is idempotent and completes even if the platform never confirms', async () => {
  const env = setup();
  await connected(env);
  const a = env.ctl.stop();
  const b = env.ctl.stop();
  await env.clock.advance(DEFAULT_POLICY.disconnectTimeoutMs);
  const [sa, sb] = await Promise.all([a, b]);
  assert.equal(sa.state, STATES.STOPPED);
  assert.equal(sb.state, STATES.STOPPED);
  assert.equal(env.adapter.calls.disconnect.length, 1);
  assert.equal((await env.ctl.stop()).state, STATES.STOPPED);
});

test('stop() during backoff cancels the pending retry (shutdown leaves nothing running)', async () => {
  const env = setup();
  const id = await connected(env);
  env.ctl.handle({ type: 'slc_disconnected', attemptId: id, aclConnected: false });
  assert.equal(env.ctl.status().state, STATES.BACKOFF);
  await env.ctl.stop('app_exit');
  await env.clock.advance(120_000);
  assert.equal(env.adapter.calls.connect.length, 1);
  assert.equal(env.clock.pending(), 0);
});

test('late callbacks from a retired attempt cannot change the current connection', async () => {
  const env = setup();
  env.ctl.start();
  await flush();
  const first = env.ctl.status().attemptId;
  await env.clock.advance(DEFAULT_POLICY.connectTimeoutMs + 2000); // attempt 1 timed out, attempt 2 running
  const second = env.ctl.status().attemptId;
  assert.notEqual(first, second);
  env.ctl.handle({ type: 'slc_connected', attemptId: first }); // late success of the cancelled attempt
  assert.equal(env.ctl.status().state, STATES.CONNECTING);
  env.ctl.handle({ type: 'slc_connected', attemptId: second });
  env.ctl.handle({ type: 'slc_disconnected', attemptId: first, aclConnected: false }); // late close of the old one
  const s = env.ctl.status();
  assert.equal(s.state, STATES.CONNECTED);
  assert.equal(s.ignoredEvents, 2);
});

test('repeated drops exhaust the reconnect budget and stop retrying', async () => {
  const env = setup({ policy: { maxAttempts: 2 } });
  const id = await connected(env);
  env.ctl.handle({ type: 'slc_disconnected', attemptId: id, aclConnected: false });
  await env.clock.advance(2000); // reconnect attempt (2 of 2)
  await env.clock.advance(DEFAULT_POLICY.connectTimeoutMs);
  assert.equal(env.ctl.status().state, STATES.FAILED);
  assert.equal(env.adapter.calls.connect.length, 2);
});

test('adapter removal suspends retries until the adapter is back', async () => {
  const env = setup();
  await connected(env);
  env.ctl.handle({ type: 'adapter_removed', detail: 'USB dongle unplugged' });
  let s = env.ctl.status();
  assert.equal(s.state, STATES.ADAPTER_UNAVAILABLE);
  assert.equal(s.lastDisconnect.reason, DISCONNECT_REASONS.ADAPTER_REMOVED);
  env.ctl.start();
  await env.clock.advance(120_000);
  assert.equal(env.adapter.calls.connect.length, 1, 'no attempts while the adapter is missing');
  env.ctl.handle({ type: 'adapter_available' });
  await flush();
  s = env.ctl.status();
  assert.equal(s.state, STATES.CONNECTING);
  assert.equal(env.adapter.calls.connect.length, 2);
});

test('a stale heartbeat marks the process stale without declaring the phone disconnected', async () => {
  const env = setup();
  await connected(env);
  env.ctl.handle({ type: 'heartbeat' });
  await env.clock.advance(DEFAULT_POLICY.staleAfterMs + 1);
  const s = env.ctl.status();
  assert.equal(s.process.stale, true);
  assert.equal(s.state, STATES.CONNECTED);
  env.ctl.handle({ type: 'heartbeat' });
  assert.equal(env.ctl.status().process.stale, false);
});

test('audio initialisation failure is reported without touching the control connection', async () => {
  const env = setup();
  const id = await connected(env);
  env.ctl.handle({ type: 'audio_failed', attemptId: id, detail: 'SCO kIOReturnUnsupported' });
  const s = env.ctl.status();
  assert.equal(s.audio.state, 'failed');
  assert.equal(s.audio.lastError.detail, 'SCO kIOReturnUnsupported');
  assert.equal(s.state, STATES.CONNECTED);
});

test('audio lost while the call is still active raises audio_lost and keeps the call', async () => {
  const env = setup();
  const id = await connected(env);
  env.ctl.handle({ type: 'call_state', attemptId: id, state: 'active' });
  env.ctl.handle({ type: 'audio_opened', attemptId: id });
  env.ctl.handle({ type: 'audio_closed', attemptId: id });
  const s = env.ctl.status();
  assert.equal(s.audio.state, 'lost');
  assert.equal(s.call.state, 'active');
  assert.equal(s.state, STATES.CONNECTED);
  assert.ok(env.events.some((e) => e.type === 'audio_lost'));
});

test('link loss mid-call makes the call uncertain; no dial is allowed until the phone reports idle', async () => {
  const env = setup();
  const id = await connected(env);
  assert.equal(env.ctl.canDial(), true);
  env.ctl.handle({ type: 'call_state', attemptId: id, state: 'active' });
  assert.equal(env.ctl.canDial(), false);
  env.ctl.handle({ type: 'slc_disconnected', attemptId: id, aclConnected: false });
  assert.equal(env.ctl.status().call.state, 'uncertain');
  await env.clock.advance(2000);
  const id2 = env.ctl.status().attemptId;
  env.ctl.handle({ type: 'slc_connected', attemptId: id2 });
  assert.equal(env.ctl.canDial(), false, 'reconnected, but the old call has not been reconciled');
  env.ctl.handle({ type: 'call_state', attemptId: id2, state: 'idle' });
  assert.equal(env.ctl.canDial(), true);
});

test('events without an attempt id, or of unknown type, are ignored and counted', async () => {
  const env = setup();
  const id = await connected(env);
  env.ctl.handle({ type: 'slc_disconnected' });
  env.ctl.handle({ type: 'mystery', attemptId: id });
  env.ctl.handle(null);
  const s = env.ctl.status();
  assert.equal(s.state, STATES.CONNECTED);
  assert.equal(s.ignoredEvents, 3);
});
