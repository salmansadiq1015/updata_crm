#!/usr/bin/env node
/** Real-board protocol checks. Never dials, provisions a key or opens pairing.
 * --reset also pulses EN and checks loss/reconnect; requires an idle phone.
 */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { parseArgs } from 'node:util';

import { T, build, encodeFrame } from '../src/esp32/protocol.js';
import { findBoardPort, openSerialDevice, closeSerialDevice } from '../src/esp32/serial.js';
import { createEvidence } from '../src/esp32/evidence.js';

const { values: a } = parseArgs({ options: {
  port: { type: 'string' }, out: { type: 'string', default: 'evidence/esp32-hardware' },
  reset: { type: 'boolean', default: false },
} });
const ev = createEvidence(a.out);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const next = async (device, event, ms = 4000) => (await once(device, event, { signal: AbortSignal.timeout(ms) }))[0];
let conn;
let passed = 0;
async function check(name, work) {
  await work();
  passed += 1;
  ev('check_pass', { name });
}

try {
  const path = a.port || await findBoardPort();
  if (!path) throw new Error('No supported USB-UART board found; pass --port');
  conn = await openSerialDevice({ path });
  const { device, port, info } = conn;
  ev('real_board', { port: path, ...info, sessionNonce: '(redacted)' });
  await device.statusRequest();
  await device.waitForState(Boolean, 2500);
  if (device.state.call || device.state.callsetup) throw new Error('Phone is in a call; refusing diagnostic traffic/reset');
  await check('identity and Bluetooth stack', async () => {
    assert.equal(info.protoMajor, 1);
    assert.equal(info.protoMinor, 0);
    assert.equal(info.maxPayload, 1024);
    assert.equal(info.codecs, 1);
    assert.equal(info.capabilities & 0x37, 0x37);
    assert.notEqual(info.bdaddr, '00:00:00:00:00:00');
    assert.notEqual(device.state.device, 'fault');
    assert.match(info.idf, /^v5\.5\.6/);
  });
  await check('50 status requests in the same session', async () => {
    for (let i = 0; i < 50; i += 1) await device.statusRequest();
  });
  await check('10 fresh sessions without resetting the board', async () => {
    let previous = info.sessionNonce;
    for (let i = 0; i < 10; i += 1) {
      const current = await device.hello();
      assert.notEqual(current.sessionNonce, previous);
      previous = current.sessionNonce;
      await device.statusRequest();
    }
  });
  await check('incompatible HELLO rejected', async () => {
    const ack = await device.command(T.HELLO, Buffer.from([255, 0]));
    assert.equal(ack.result, 'bad_arg');
    await device.hello();
  });
  await check('unknown command rejected', async () => {
    assert.equal((await device.command(0x7f)).result, 'unknown_type');
  });
  await check('invalid volume rejected', async () => {
    assert.equal((await device.command(T.VOLUME, Buffer.from([16, 0]))).result, 'bad_arg');
  });
  await check('CRC corruption and truncation recover on the real firmware', async () => {
    const before = device.stats || await next(device, 'stats');
    const corrupt = encodeFrame(T.STATUS_REQ, device.seq++ & 0xffff);
    corrupt[corrupt.length - 1] ^= 0xff;
    port.write(corrupt);
    const truncated = encodeFrame(T.PING, device.seq++ & 0xffff, build.ping(42)).subarray(0, 13);
    port.write(truncated);
    await device.statusRequest();
    const after = await next(device, 'stats');
    assert.ok(after.rxCrcErrors >= before.rxCrcErrors + 2);
    ev('injected_error_stats', { before: before.rxCrcErrors, after: after.rxCrcErrors, rxResyncs: after.rxResyncs });
  });
  await check('30 seconds of continuous uptime and keepalive without a watchdog reset', async () => {
    const before = device.stats || await next(device, 'stats');
    await new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); device.off('lost', lost); };
      const lost = (reason) => { cleanup(); reject(new Error(`Board reset/disconnected during stability test: ${reason}`)); };
      const timer = setTimeout(() => { cleanup(); resolve(); }, 30000);
      device.once('lost', lost);
    });
    assert.equal(device.closed, false);
    assert.ok(device.stats.uptimeMs >= before.uptimeMs + 28000);
    assert.equal(device.decoder.stats.crcErrors, 0);
    ev('stable_uptime', { beforeMs: before.uptimeMs, afterMs: device.stats.uptimeMs, heapMin: device.stats.heapMin });
  });
  if (a.reset) {
    await check('reset invalidates the old session and reconnects with a fresh nonce', async () => {
      const nonce = device.info.sessionNonce;
      const lost = next(device, 'lost', 6000);
      await new Promise((resolve, reject) => port.set({ dtr: false, rts: true }, (err) => err ? reject(err) : resolve()));
      await sleep(100);
      await new Promise((resolve, reject) => port.set({ dtr: false, rts: false }, (err) => err ? reject(err) : resolve()));
      const reason = await lost;
      assert.match(reason, /reboot|reset|no frame|closed/);
      await closeSerialDevice(conn);
      conn = await openSerialDevice({ path });
      assert.notEqual(conn.info.sessionNonce, nonce);
      await conn.device.statusRequest();
      await conn.device.waitForState(Boolean, 2500);
      assert.notEqual(conn.device.state.device, 'fault');
      ev('reconnected', { reason, firmware: conn.info.firmware, state: conn.device.state });
    });
  }
  ev('hardware_summary', { passed, state: conn.device.state, decoder: conn.device.decoder.stats });
} catch (err) {
  ev('hardware_failed', { passed, code: err.code || null, error: err.message });
  process.exitCode = 1;
} finally {
  if (conn) await closeSerialDevice(conn);
}
