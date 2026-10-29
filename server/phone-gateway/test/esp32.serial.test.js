import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createBoardOpener, findBoardPort, listPorts } from '../src/esp32/serial.js';

const bridge = { path: '/dev/tty.usbserial-0001', vendorId: '10c4', productId: 'ea60', manufacturer: 'Silicon Labs' };
const options = (ports, existing = []) => ({
  platform: 'darwin', enumerate: async () => ports, pathExists: (path) => existing.includes(path),
});

test('macOS tty enumeration resolves the existing callout port and deduplicates aliases', async () => {
  const o = options([bridge, { ...bridge, path: '/dev/cu.usbserial-0001' }], ['/dev/cu.usbserial-0001']);
  assert.equal((await listPorts(o)).length, 1);
  assert.equal(await findBoardPort(o), '/dev/cu.usbserial-0001');
});

test('discovery does not invent a missing callout port or accept unrelated Bluetooth/native USB ports', async () => {
  assert.equal(await findBoardPort(options([bridge])), null);
  assert.equal(await findBoardPort(options([
    { path: '/dev/cu.Bluetooth-Incoming-Port' },
    { path: '/dev/cu.usbmodem1', vendorId: '303a', productId: '1001' },
  ])), null);
});

test('multiple boards require an explicit port; Linux and Windows paths remain usable', async () => {
  await assert.rejects(findBoardPort(options([bridge, { ...bridge, path: '/dev/cu.usbserial-2' }],
    ['/dev/cu.usbserial-0001', '/dev/cu.usbserial-2'])), /Several USB-serial boards/);
  for (const [platform, path] of [['linux', '/dev/ttyUSB0'], ['win32', 'COM3']]) {
    assert.equal(await findBoardPort({ platform, enumerate: async () => [{ ...bridge, path }] }), path);
  }
});

test('macOS detects Silicon Labs USB serial ports when the driver omits USB IDs', async () => {
  const port = { path: '/dev/cu.usbserial-0001', manufacturer: 'Silicon Labs' };
  assert.equal(await findBoardPort(options([port])), port.path);
  assert.equal(await findBoardPort(options([{ ...port, path: '/dev/cu.Bluetooth-Incoming-Port' }])), null);
  assert.equal(await findBoardPort(options([{ ...port, vendorId: '303a', productId: '1001' }])), null);
  assert.equal(await findBoardPort(options([{ ...port, manufacturer: 'Unknown' }])), null);
  await assert.rejects(findBoardPort(options([port, { ...port, path: '/dev/cu.usbserial-2' }])), /Several USB-serial boards/);
});

test('a gateway can start without a board and discovers its current path on subsequent attempts', async () => {
  const ports = [null, '/dev/cu.usbserial-1', '/dev/cu.usbserial-2'];
  const opened = [];
  const open = createBoardOpener({ discover: async () => ports.shift(), open: async ({ path }) => { opened.push(path); return path; } });
  await assert.rejects(open(), e => e.code === 'no_board');
  assert.equal(await open(), '/dev/cu.usbserial-1');
  assert.equal(await open(), '/dev/cu.usbserial-2');
  assert.equal(opened.length, 2);
  const explicit = createBoardOpener({ path: '/dev/cu/chosen', discover: async () => { throw new Error('do not override explicit selection'); }, open: async ({ path }) => path });
  assert.equal(await explicit(), '/dev/cu/chosen');
});
