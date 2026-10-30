import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { CrmClient, normalizeApiBase } from '../src/gateway/crmClient.js';
import { reconnectConfig } from '../src/gateway/reconnect.js';
import { GatewayDaemon } from '../src/gateway/daemon.js';
import { gatewayPaths, saveConfig, loadConfig } from '../src/gateway/system.js';

async function listen(server, port = 0) {
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}
async function close(server) {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}

test('an explicit local URL replaces the live target only after confirming the same phone', async () => {
  const config = { apiBase: 'https://live.test/api/v1', token: 'retained-test-token', deviceId: 'phone1', port: '/dev/existing' };
  const fixed = await reconnectConfig(config, 'http://127.0.0.1:9097/api/v1/', { connect: async client => {
    assert.equal(client.apiBase, 'http://127.0.0.1:9097/api/v1');
    assert.equal(client.token, config.token);
    return { deviceId: 'phone1' };
  } });
  assert.deepEqual(fixed, { ...config, apiBase: 'http://127.0.0.1:9097/api/v1' });
  assert.equal(config.apiBase, 'https://live.test/api/v1');
  await assert.rejects(reconnectConfig(config, 'https://wrong.test/api/v1', { connect: async () => ({ deviceId: 'another-phone' }) }), /not changed/);
  await assert.rejects(reconnectConfig(config, 'https://down.test/api/v1', { connect: async () => { throw new Error('unreachable'); } }), /unreachable/);
  assert.equal(config.token, 'retained-test-token');
});

test('API URLs cannot contain credentials or silently redirect plain HTTP to another computer', () => {
  for (const url of ['https://user:secret@crm.test/api/v1', 'https://crm.test/api/v1?token=secret', 'https://crm.test/api/v1#secret', 'http://192.168.1.5/api/v1', 'file:///tmp/gateway']) {
    assert.throws(() => normalizeApiBase(url));
  }
  assert.equal(normalizeApiBase('http://[::1]:9097/api/v1/'), 'http://[::1]:9097/api/v1');
});

test('CLI saves the validated URL and keeps credentials/outbox; run --api refuses a different phone', async t => {
  const home = mkdtempSync(join(tmpdir(), 'updata-reconnect-cli-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const paths = gatewayPaths('phone1', home);
  const original = { apiBase: 'https://live.test/api/v1', deviceId: 'phone1', token: 'retained-token', port: '/dev/existing' };
  saveConfig(original, paths.config);
  writeFileSync(paths.outbox, 'pending-call-event\n');
  let phone = 'phone1';
  const server = createServer((req, res) => {
    assert.equal(req.url, '/api/v1/paired-phone/gateway/connection');
    assert.equal(req.headers.authorization, 'Bearer retained-token');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, data: { deviceId: phone } }));
  });
  const port = await listen(server);
  t.after(() => close(server));
  const target = `http://127.0.0.1:${port}/api/v1`;
  const cli = (...args) => promisify(execFile)(process.execPath, ['bin/updata-gateway.mjs', ...args, '--profile', 'phone1'], {
    cwd: new URL('../', import.meta.url), env: { ...process.env, UPDATA_GATEWAY_HOME: home }, timeout: 5000,
  });
  const result = await cli('configure', '--api', `${target}/`);
  assert.equal((result.stdout + result.stderr).includes(original.token), false);
  assert.deepEqual(loadConfig(paths.config), { ...original, apiBase: target });
  assert.equal(readFileSync(paths.outbox, 'utf8'), 'pending-call-event\n');
  await cli('status', '--check-crm');
  phone = 'different-phone';
  await assert.rejects(cli('run', '--api', target), /not changed/);
  assert.deepEqual(loadConfig(paths.config), { ...original, apiBase: target });
});

test('a response body stalled after headers is still a retryable timeout with a useful endpoint', async t => {
  const server = createServer((_req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.flushHeaders(); });
  const port = await listen(server);
  t.after(() => close(server));
  const crm = new CrmClient({ apiBase: `http://127.0.0.1:${port}/api/v1`, token: 'never-print-this', timeoutMs: 50 });
  await assert.rejects(crm.connection(), e => e.code === 'CRM_TIMEOUT' && e.retryable && e.endpoint.endsWith('/connection')
    && e.message.includes('50ms') && !e.message.includes('never-print-this'));
});

test('a website HTML response is diagnosed as an invalid CRM API URL', async () => {
  const crm = new CrmClient({ apiBase: 'https://crm.test/api/v1', fetchImpl: async () => new globalThis.Response('<html>Login</html>') });
  await assert.rejects(crm.connection(), e => e.code === 'CRM_INVALID_RESPONSE' && /CRM API response/.test(e.message));
});

test('gateway recovers after the same CRM restarts, retaining its USB session and pairing', async t => {
  let headers = [], claims = 0, closes = 0;
  const handler = (req, res) => {
    headers.push(req.headers.authorization);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, data: { readiness: { ok: true }, commands: [] } }));
  };
  let server = createServer(handler);
  const port = await listen(server);
  const crm = new CrmClient({ apiBase: `http://127.0.0.1:${port}/api/v1`, token: 'retained-token', timeoutMs: 500 });
  crm.claim = async () => { claims++; return null; };
  const daemon = new GatewayDaemon({ crm, outbox: { flush: async () => {} }, keepAwake: { set() {} }, closeDevice: async () => { closes++; } });
  daemon.scheduleHeartbeat = () => {};
  const board = { info: { keyProvisioned: true, sessionNonce: 'existing-session' }, device: { state: { hfp: 'slc', call: 0, callsetup: 0 } } };
  daemon.conn = board;
  t.after(async () => { await daemon.stop(); await close(server); });
  await daemon.heartbeat();
  assert.equal(daemon.canClaim(), true);
  await close(server);
  await daemon.heartbeat();
  assert.equal(daemon.crmConnected, false);
  await daemon.tryClaim();
  assert.equal(claims, 0);
  server = createServer(handler);
  await listen(server, port);
  await daemon.heartbeat();
  assert.equal(daemon.canClaim(), true);
  assert.equal(daemon.lastError, null);
  assert.equal(daemon.conn, board);
  assert.equal(closes, 0);
  assert.deepEqual(headers, ['Bearer retained-token', 'Bearer retained-token']);
});

test('slow heartbeats never overlap and a late response after shutdown cannot revive the gateway', async () => {
  let requests = 0, release;
  const pending = new Promise(resolve => { release = resolve; });
  const daemon = new GatewayDaemon({ crm: { heartbeat: async () => { requests++; return pending; } }, outbox: { flush: async () => {} }, keepAwake: { set() {} } });
  const first = daemon.heartbeat();
  await daemon.heartbeat();
  assert.equal(requests, 1);
  await daemon.stop();
  release({ readiness: { ok: true } });
  await first;
  assert.equal(daemon.crmConnected, false);
  assert.equal(daemon.heartbeatInFlight, false);
});
