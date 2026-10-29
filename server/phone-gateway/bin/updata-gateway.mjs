#!/usr/bin/env node
/**
 * Updata paired-phone gateway: runs on the laptop the ESP32 bridge is plugged into.
 *
 *   updata-gateway pair --api https://crm.example.com/api/v1 --code ABCD-EFGH   (code from CRM → AI Calling → Paired phones)
 *   updata-gateway provision [--port /dev/cu.usbserial-XXXX]                   (hold the board's BOOT button)
 *   updata-gateway run [--port …]                                              (keep it running while campaigns call)
 *   updata-gateway status
 *   updata-gateway unpair
 *
 * Use --profile <phone ID> for separate phone connections on the same computer.
 * Credentials live in ~/.updata/profiles/<phone ID>/gateway.json, readable by you only.
 * Commands without --profile retain the legacy ~/.updata/gateway.json connection.
 */

import { parseArgs } from 'node:util';
import { hostname } from 'node:os';
import { chmodSync, copyFileSync, existsSync, rmSync } from 'node:fs';

import { CrmClient, EventOutbox } from '../src/gateway/crmClient.js';
import { GatewayDaemon, GATEWAY_VERSION } from '../src/gateway/daemon.js';
import { KeepAwake, acquireLock, deleteConfig, gatewayPaths, loadConfig, saveConfig } from '../src/gateway/system.js';
import { closeSerialDevice, createBoardOpener, findBoardPort, listPorts, openSerialDevice } from '../src/esp32/serial.js';
import { manageService } from '../src/gateway/service.js';

const { values: a, positionals } = parseArgs({
  allowPositionals: true,
  options: { api: { type: 'string' }, code: { type: 'string' }, profile: { type: 'string' }, port: { type: 'string' }, 'presence-wait': { type: 'string', default: '5' }, 'playback-gain-db': { type: 'string', default: '0' } },
});
const log = (event, data = {}) => process.stderr.write(`${JSON.stringify({ ts: new Date().toISOString(), event, ...data })}\n`);
const die = (msg, code = 2) => {
  process.stderr.write(`${msg}\n`);
  process.exit(code);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const paths = gatewayPaths(a.profile);

function readConfig() {
  const config = loadConfig(paths.config);
  if (config || !a.profile) return config;
  // Existing installations used one default file. Migrate only the matching phone.
  const legacy = loadConfig();
  if (legacy?.deviceId === a.profile) {
    const release = acquireLock();
    try {
      saveConfig(legacy, paths.config);
      const legacyOutbox = gatewayPaths().outbox;
      if (existsSync(legacyOutbox) && !existsSync(paths.outbox)) {
        copyFileSync(legacyOutbox, paths.outbox);
        chmodSync(paths.outbox, 0o600);
      }
    } catch (error) {
      rmSync(paths.config, { force: true });
      throw error;
    } finally { release(); }
    return legacy;
  }
  return null;
}

function requireConfig() {
  const cfg = readConfig();
  if (!cfg?.token) die('This phone is not linked on this computer. Open its card in CRM, choose Link computer, then copy the pairing command.');
  return cfg;
}

async function resolvePort(cfg) {
  const port = a.port || cfg?.port || await findBoardPort();
  if (!port) die('No ESP32 board found. Plug it in (data USB cable) or pass --port (see `updata-gateway status`).');
  return port;
}

const commands = {
  async service() { log('login_service', await manageService(positionals[1], { profile: a.profile })); },
  async pair() {
    if (!a.api || !a.code) die('pair needs --api <CRM API URL ending in /api/v1> and --code <pairing code>');
    // Do not replace credentials while a running process still uses the old token.
    const release = acquireLock(paths.lock);
    try {
      const crm = new CrmClient({ apiBase: a.api });
      const res = await crm.pair(a.code, { version: GATEWAY_VERSION, platform: process.platform, hostname: hostname().slice(0, 120) });
      saveConfig({ apiBase: a.api, deviceId: res.deviceId, deviceName: res.deviceName, token: res.token, port: a.port || null }, paths.config);
      log('paired', { deviceId: res.deviceId, deviceName: res.deviceName, config: paths.config });
    } finally { release(); }
  },

  async provision() {
    const presenceWait = Number(a['presence-wait']);
    if (!Number.isInteger(presenceWait) || presenceWait < 5 || presenceWait > 120) die('--presence-wait must be 5–120 seconds');
    const cfg = requireConfig();
    const crm = new CrmClient({ apiBase: cfg.apiBase, token: cfg.token });
    const path = await resolvePort(cfg);
    const conn = await openSerialDevice({ path });
    try {
      const { key } = await crm.takeDialKey();
      process.stderr.write(`Hold the BOOT button on the ESP32 now (${presenceWait} s)…\n`);
      await sleep(presenceWait * 1000);
      await conn.device.provisionKey(Buffer.from(key, 'hex'));
      await crm.confirmDialKey(conn.info.bdaddr);
      log('dial_key_provisioned', { bdaddr: conn.info.bdaddr });
    } catch (err) {
      if (err.code === 'no_presence') die('The BOOT button was not held. Run provision again within 15 minutes (or rotate the key in the CRM).', 3);
      throw err;
    } finally {
      await closeSerialDevice(conn);
    }
  },

  async run() {
    const agentGainDb = Number(a['playback-gain-db']);
    if (!Number.isFinite(agentGainDb) || agentGainDb < 0 || agentGainDb > 12) die('--playback-gain-db must be 0–12 dB');
    const cfg = requireConfig();
    const release = acquireLock(paths.lock);
    const path = a.port || cfg.port || null;
    const crm = new CrmClient({ apiBase: cfg.apiBase, token: cfg.token });
    const outbox = new EventOutbox({ client: crm, file: paths.outbox, log });
    const rtc = await import('@livekit/rtc-node');
    const daemon = new GatewayDaemon({
      crm, outbox, rtc, log, portLabel: path,
      keepAwake: new KeepAwake({ log }),
      options: { agentGainDb },
      openDevice: createBoardOpener({ path, onError: (err) => log('serial_error', { error: err.message }) }),
      closeDevice: closeSerialDevice,
    });
    log('playback_gain', { db: agentGainDb });
    const shutdown = async (signal) => {
      log('signal', { signal });
      await daemon.stop();
      release();
      process.exit(0);
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    await daemon.start();
  },

  async status() {
    const cfg = readConfig();
    log('status', {
      paired: Boolean(cfg?.token),
      deviceName: cfg?.deviceName || null,
      deviceId: cfg?.deviceId || null,
      apiBase: cfg?.apiBase || null,
      ports: await listPorts(),
    });
  },

  async unpair() {
    const release = acquireLock(paths.lock);
    try { deleteConfig(paths.config, paths.outbox); } finally { release(); }
    log('unpaired', { note: 'also revoke the device in the CRM if this laptop is no longer trusted' });
  },
};

const mode = positionals[0];
if (!commands[mode]) die('usage: updata-gateway pair|provision|run|status|unpair (see the header of bin/updata-gateway.mjs)');
commands[mode]().catch((err) => die(`${err.code ? `[${err.code}] ` : ''}${err.message}`, 1));
