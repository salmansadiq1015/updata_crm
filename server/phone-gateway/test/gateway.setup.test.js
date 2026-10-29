import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { performSetup } from '../src/gateway/setup.js';
import { GatewayDaemon } from '../src/gateway/daemon.js';
import { launchAgent, manageService } from '../src/gateway/service.js';

test('provision uses the open session, waits for BOOT without reboot, confirms only after ACK and wipes key bytes', async () => {
  let button = false, writes = 0, held;
  const info = { bdaddr: '24:0A:C4:00:11:22', keyProvisioned: false };
  const confirmations = [];
  await performSetup({ action: 'provision_key', info,
    device: { state: { call: 0, callsetup: 0 }, async provisionKey(b) { held = b; if (!button) throw Object.assign(new Error(), { code: 'no_presence' }); writes++; } },
    crm: { takeDialKey: async () => ({ key: '09'.repeat(32) }), confirmDialKey: async b => confirmations.push(b) }, sleep: async () => { button = true; } });
  assert.equal(writes, 1);
  assert.deepEqual(confirmations, [info.bdaddr]);
  assert.equal(info.keyProvisioned, true);
  assert.ok(held.every(n => n === 0));
});

test('setup refuses active calls and unsupported commands without running anything', async () => {
  let touched = false;
  await assert.rejects(performSetup({ action: 'reconnect_usb', device: { state: { call: 1 } }, reconnect: async () => { touched = true; } }), e => e.code === 'busy');
  await assert.rejects(performSetup({ action: 'run_shell', device: { state: {} } }), /Unsupported/);
  assert.equal(touched, false);
});

test('connect completes only after the hands-free service link is established', async () => {
  const steps = [];
  const device = { state: { hfp: 'disconnected' }, async hfpConnect() { steps.push('request'); },
    async waitForState(predicate) { steps.push('wait'); this.state.hfp = 'slc'; assert.equal(predicate(this.state), true); },
    async statusRequest() { steps.push('status'); assert.equal(this.state.hfp, 'slc'); } };
  await performSetup({ action: 'connect_phone', device });
  assert.deepEqual(steps, ['request', 'wait', 'status']);
  await performSetup({ action: 'connect_phone', device });
  assert.deepEqual(steps, ['request', 'wait', 'status', 'status']);
});

test('Connect recovers a missing USB session, then verifies Bluetooth; failure never reports success', async () => {
  let opens = 0, requests = 0;
  const device = { state: { hfp: 'disconnected' }, async hfpConnect() { requests++; },
    async waitForState(predicate) { this.state.hfp = 'slc'; assert.ok(predicate(this.state)); }, async statusRequest() {} };
  await performSetup({ action: 'connect_phone', reconnect: async () => { opens++; return { device }; } });
  assert.equal(opens, 1); assert.equal(requests, 1);
  await performSetup({ action: 'connect_phone', device, reconnect: async () => { throw new Error('must keep healthy USB open'); } });
  await assert.rejects(performSetup({ action: 'connect_phone', reconnect: async () => null }), e => e.code === 'no_board');
  await assert.rejects(performSetup({ action: 'connect_phone', reconnect: async () => ({ device: { state: { call: 1 } } }) }), e => e.code === 'busy');
});

test('simultaneous USB retries share one open attempt and close a connection that arrives after shutdown', async () => {
  let opens = 0, closed = 0, release;
  const opening = new Promise(resolve => { release = resolve; });
  const daemon = new GatewayDaemon({ crm: {}, outbox: {}, keepAwake: {},
    openDevice: async () => { opens++; return opening; }, closeDevice: async () => { closed++; } });
  const first = daemon.connectBoard();
  const second = daemon.connectBoard();
  assert.equal(opens, 1);
  daemon.stopped = true;
  release({ device: {}, info: {} });
  await Promise.all([first, second]);
  assert.equal(closed, 1); assert.equal(daemon.conn, null);
});

test('gateway reports the computer online while USB startup is still waiting', async t => {
  const heartbeats = [];
  let release;
  const opening = new Promise(resolve => { release = resolve; });
  const daemon = new GatewayDaemon({
    crm: { heartbeat: async body => { heartbeats.push(body); return {}; }, claim: async () => null },
    outbox: { flush: async () => {} }, keepAwake: { set() {} },
    openDevice: () => opening, closeDevice: async () => {},
  });
  t.after(async () => { await daemon.stop(); release({}); });
  const starting = daemon.start();
  const deadline = Date.now() + 1000;
  while (!heartbeats.length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(heartbeats.length, 1);
  assert.equal(heartbeats[0].board.connected, false);
  await daemon.stop();
  release({});
  await starting;
});

test('startup respects persisted Bluetooth disconnect and reports applied volume without reopening USB', async t => {
  let connections = 0, opens = 0;
  const device = new EventEmitter();
  device.state = { hfp: 'disconnected', call: 0, callsetup: 0 };
  device.statusRequest = async () => { device.emit('state', device.state); };
  device.hfpConnect = async () => { connections++; };
  const daemon = new GatewayDaemon({ crm: { heartbeat: async () => ({ setup: { autoConnect: false, playbackGainDb: 6 } }), claim: async () => null },
    outbox: { flush: async () => {} }, keepAwake: { set() {} },
    openDevice: async () => { opens++; return { device, info: { keyProvisioned: true } }; }, closeDevice: async () => {}, options: { heartbeatIdleMs: 10 } });
  t.after(() => daemon.stop());
  await daemon.start();
  const deadline = Date.now() + 1000;
  while (!daemon.settingsLoaded && Date.now() < deadline) await new Promise(r => setTimeout(r, 5));
  assert.equal(daemon.settingsLoaded, true);
  daemon.onBoardState(device.state);
  assert.equal(connections, 0); assert.equal(opens, 1);
  assert.equal(daemon.heartbeatBody().gateway.playbackGainDb, 6);
});

test('duplicate heartbeats and a failed result acknowledgement never repeat the hardware action', async () => {
  let claims = 0, acknowledgements = 0, actions = 0, release;
  const blocked = new Promise(r => { release = r; });
  const daemon = new GatewayDaemon({ crm: {
    async claimSetup() { claims++; }, async completeSetup() { acknowledgements++; if (acknowledgements === 1) throw new Error('network'); },
  }, outbox: {}, keepAwake: {}, openDevice: async () => {} });
  daemon.scheduleHeartbeat = () => {};
  daemon.conn = { info: { keyProvisioned: true }, device: { state: { hfp: 'slc', call: 0, callsetup: 0 }, async statusRequest() { actions++; await blocked; } } };
  const p = daemon.runSetup({ id: 'x', action: 'status' });
  assert.equal(daemon.canClaim(), false);
  await daemon.runSetup({ id: 'x', action: 'status' });
  release(); await p;
  assert.equal(claims, 1); assert.equal(actions, 1); assert.equal(acknowledgements, 2);
  assert.equal(daemon.setupBusy, false);
});

test('macOS login service is valid XML, escapes paths, uses per-user launchctl and preserves credentials', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'updata-login-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const plist = join(dir, 'test.plist');
  writeFileSync(plist, launchAgent({ node: '/a & b/node', entry: '/c <d>/bin/updata.mjs', logDir: '/log & safe' }));
  assert.match(readFileSync(plist, 'utf8'), /&amp;/);
  if (process.platform === 'darwin') execFileSync('plutil', ['-lint', plist]);
  const calls = [];
  const run = async (cmd, args) => { calls.push([cmd, args]); return {}; };
  const installed = await manageService('install', { platform: 'darwin', homeDir: dir, run });
  assert.equal(statSync(installed.file).mode & 0o777, 0o600);
  assert.ok(calls.some(([c, args]) => c === 'launchctl' && args[0] === 'bootstrap' && args[1].startsWith('gui/')));
  const result = await manageService('uninstall', { platform: 'darwin', homeDir: dir, run });
  assert.equal(result.credentialsPreserved, true);
  await assert.rejects(manageService('install', { platform: 'win32', homeDir: dir, run }), /currently supports macOS/);
});
