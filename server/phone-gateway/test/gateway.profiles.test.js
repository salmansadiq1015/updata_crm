import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { acquireLock, deleteConfig, gatewayPaths, loadConfig, saveConfig } from '../src/gateway/system.js';
import { launchAgent, manageService } from '../src/gateway/service.js';

test('two phones have independent private credentials, event outboxes and process locks', t => {
  const home = mkdtempSync(join(tmpdir(), 'updata-profiles-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const first = gatewayPaths('phone1', home), second = gatewayPaths('phone2', home);
  saveConfig({ deviceId: 'phone1', token: 'first-token', port: '/dev/first' }, first.config);
  saveConfig({ deviceId: 'phone2', token: 'second-token', port: '/dev/second' }, second.config);
  writeFileSync(first.outbox, 'first-call\n');
  writeFileSync(second.outbox, 'second-call\n');
  const releaseFirst = acquireLock(first.lock), releaseSecond = acquireLock(second.lock);
  assert.throws(() => acquireLock(first.lock), /Another gateway/);
  assert.equal(loadConfig(first.config).token, 'first-token');
  assert.equal(loadConfig(second.config).token, 'second-token');
  assert.equal(statSync(first.config).mode & 0o777, 0o600);
  assert.equal(statSync(join(home, 'profiles', 'phone1')).mode & 0o777, 0o700);
  releaseFirst(); releaseSecond();
  deleteConfig(first.config, first.outbox);
  assert.equal(existsSync(first.config), false);
  assert.equal(existsSync(first.outbox), false);
  assert.equal(existsSync(second.outbox), true);
  assert.equal(loadConfig(second.config).token, 'second-token');
});

test('profiles cannot escape the gateway directory and no-profile paths remain compatible', () => {
  for (const profile of ['../phone', '/tmp/phone', 'phone/name', 'phone name', 'x'.repeat(81)]) {
    assert.throws(() => gatewayPaths(profile, '/tmp/gateway'), /Profile must/);
  }
  assert.deepEqual(gatewayPaths(undefined, '/tmp/gateway'), {
    config: '/tmp/gateway/gateway.json', outbox: '/tmp/gateway/gateway-outbox.jsonl', lock: '/tmp/gateway/gateway.lock',
  });
});

test('CLI migrates only the matching legacy phone and never displays its bearer token', t => {
  const home = mkdtempSync(join(tmpdir(), 'updata-legacy-profile-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  saveConfig({ deviceId: 'phone1', deviceName: 'Sales', token: 'private-test-token' }, gatewayPaths(undefined, home).config);
  writeFileSync(gatewayPaths(undefined, home).outbox, '{"eventId":"pending-call-result"}\n');
  const cli = profile => {
    const result = spawnSync(process.execPath, ['bin/updata-gateway.mjs', 'status', '--profile', profile], {
      cwd: new URL('../', import.meta.url), env: { ...process.env, UPDATA_GATEWAY_HOME: home }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout + result.stderr;
  };
  // status enumerates USB devices, but neither opens them nor starts a gateway.
  cli('phone2');
  assert.equal(existsSync(gatewayPaths('phone2', home).config), false);
  const output = cli('phone1');
  assert.equal(output.includes('private-test-token'), false);
  assert.equal(loadConfig(gatewayPaths('phone1', home).config).deviceId, 'phone1');
  assert.equal(readFileSync(gatewayPaths('phone1', home).outbox, 'utf8'), '{"eventId":"pending-call-result"}\n');
});

test('macOS services use a distinct label, profile command and log directory for each phone', async t => {
  const home = mkdtempSync(join(tmpdir(), 'updata-profile-services-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const targets = [];
  for (const profile of ['phone1', 'phone2']) {
    const plist = launchAgent({ node: '/node', entry: '/gateway/bin/updata-gateway.mjs', logDir: `/logs/${profile}`, profile });
    assert.ok(plist.includes(`<string>ai.updata.phone-gateway.${profile}</string>`));
    assert.ok(plist.includes(`<string>--profile</string><string>${profile}</string>`));
    await manageService('install', { platform: 'darwin', homeDir: home, profile, run: async (command, args) => { if (command === 'launchctl' && args[0] === 'bootout') targets.push(args[1]); } });
    assert.ok(existsSync(join(home, 'Library', 'LaunchAgents', `ai.updata.phone-gateway.${profile}.plist`)));
    assert.ok(existsSync(join(home, '.updata', 'logs', profile, 'gateway.err.log')));
  }
  assert.notEqual(targets[0], targets[1]);
});
