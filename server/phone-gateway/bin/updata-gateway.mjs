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
 * Config (incl. the gateway token) lives in ~/.updata/gateway.json, readable by you only.
 */

import { parseArgs } from 'node:util';
import { hostname } from 'node:os';

import { CrmClient, EventOutbox } from '../src/gateway/crmClient.js';
import { GatewayDaemon, GATEWAY_VERSION } from '../src/gateway/daemon.js';
import { CONFIG_FILE, OUTBOX_FILE, KeepAwake, acquireLock, deleteConfig, loadConfig, saveConfig } from '../src/gateway/system.js';
import { closeSerialDevice, findBoardPort, listPorts, openSerialDevice } from '../src/esp32/serial.js';

const { values: a, positionals } = parseArgs({
  allowPositionals: true,
  options: { api: { type: 'string' }, code: { type: 'string' }, port: { type: 'string' } },
});
const log = (event, data = {}) => process.stderr.write(`${JSON.stringify({ ts: new Date().toISOString(), event, ...data })}\n`);
const die = (msg, code = 2) => {
  process.stderr.write(`${msg}\n`);
  process.exit(code);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function requireConfig() {
  const cfg = loadConfig();
  if (!cfg?.token) die(`Not paired. Run: updata-gateway pair --api <CRM API URL> --code <code from the CRM>`);
  return cfg;
}

async function resolvePort(cfg) {
  const port = a.port || cfg?.port || await findBoardPort();
  if (!port) die('No ESP32 board found. Plug it in (data USB cable) or pass --port (see `updata-gateway status`).');
  return port;
}

const commands = {
  async pair() {
    if (!a.api || !a.code) die('pair needs --api <CRM API URL ending in /api/v1> and --code <pairing code>');
    const crm = new CrmClient({ apiBase: a.api });
    const res = await crm.pair(a.code, { version: GATEWAY_VERSION, platform: process.platform, hostname: hostname().slice(0, 120) });
    saveConfig({ apiBase: a.api, deviceId: res.deviceId, deviceName: res.deviceName, token: res.token, port: a.port || null });
    log('paired', { deviceId: res.deviceId, deviceName: res.deviceName, config: CONFIG_FILE });
  },

  async provision() {
    const cfg = requireConfig();
    const crm = new CrmClient({ apiBase: cfg.apiBase, token: cfg.token });
    const path = await resolvePort(cfg);
    const conn = await openSerialDevice({ path });
    try {
      const { key } = await crm.takeDialKey();
      process.stderr.write('Hold the BOOT button on the ESP32 now (5 s)…\n');
      await sleep(5000);
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
    const cfg = requireConfig();
    const release = acquireLock();
    const path = await resolvePort(cfg);
    const crm = new CrmClient({ apiBase: cfg.apiBase, token: cfg.token });
    const outbox = new EventOutbox({ client: crm, file: OUTBOX_FILE, log });
    const rtc = await import('@livekit/rtc-node');
    const daemon = new GatewayDaemon({
      crm, outbox, rtc, log, portLabel: path,
      keepAwake: new KeepAwake({ log }),
      openDevice: () => openSerialDevice({ path, onError: (err) => log('serial_error', { error: err.message }) }),
      closeDevice: closeSerialDevice,
    });
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
    const cfg = loadConfig();
    log('status', {
      paired: Boolean(cfg?.token),
      deviceName: cfg?.deviceName || null,
      deviceId: cfg?.deviceId || null,
      apiBase: cfg?.apiBase || null,
      ports: await listPorts(),
    });
  },

  async unpair() {
    deleteConfig();
    log('unpaired', { note: 'also revoke the device in the CRM if this laptop is no longer trusted' });
  },
};

const mode = positionals[0];
if (!commands[mode]) die('usage: updata-gateway pair|provision|run|status|unpair (see the header of bin/updata-gateway.mjs)');
commands[mode]().catch((err) => die(`${err.code ? `[${err.code}] ` : ''}${err.message}`, 1));
