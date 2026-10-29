/** Finding and opening the ESP32 bridge on a USB serial port (shared by the probe and the gateway). */

import { existsSync } from 'node:fs';

import { Esp32Device } from './device.js';

export const BAUD = 921600;
export const USB_BRIDGES = Object.freeze({
  '10c4:ea60': 'Silicon Labs CP210x (common on ESP32-WROOM-32 DevKitC)',
  '1a86:7523': 'WCH CH340',
  '1a86:55d4': 'WCH CH9102',
  '0403:6001': 'FTDI FT232R',
  '0403:6015': 'FTDI FT231X',
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function listPorts({ platform = process.platform, enumerate, pathExists = existsSync } = {}) {
  const ports = enumerate ? await enumerate() : await (await import('serialport')).SerialPort.list();
  const seen = new Set();
  return ports.map((p) => {
    const id = p.vendorId ? `${p.vendorId}:${p.productId}`.toLowerCase() : '';
    // IOKit/serialport enumerates tty names on macOS. Use the matching callout
    // device for outbound connections, but only when it really exists.
    const callout = p.path.replace(/^\/dev\/tty\./, '/dev/cu.');
    const path = platform === 'darwin' && pathExists(callout) ? callout : p.path;
    return {
      path,
      id,
      manufacturer: p.manufacturer || '',
      // Some macOS drivers omit USB IDs but still identify the CP210x vendor.
      // Restrict this fallback to USB serial paths and absent IDs so Bluetooth
      // ports and known incompatible native-USB chips are never selected.
      bridge: USB_BRIDGES[id] || (!p.vendorId && !p.productId
        && /silicon\s+labs/i.test(p.manufacturer || '')
        && /^(\/dev\/(?:cu|tty)\.usbserial|\/dev\/ttyUSB|COM\d)/i.test(path)
        ? USB_BRIDGES['10c4:ea60'] : null),
      nativeUsbNoClassicBt: id.startsWith('303a:'), // ESP32-S2/S3/C3/C6: no Classic Bluetooth
    };
  }).filter((p) => {
    if (seen.has(p.path)) return false;
    seen.add(p.path);
    return true;
  });
}

/** The single USB-serial bridge present, preferring macOS /dev/cu.* names. */
export async function findBoardPort(options) {
  const candidates = (await listPorts(options)).filter((p) => p.bridge && !p.path.startsWith('/dev/tty.'));
  if (candidates.length === 1) return candidates[0].path;
  if (candidates.length > 1) throw new Error(`Several USB-serial boards found (${candidates.map((c) => c.path).join(', ')}); pass --port`);
  return null;
}

/** Resolve auto-detected ports on every attempt, including after a USB reconnect. */
export function createBoardOpener({ path = null, onError, discover = findBoardPort, open = openSerialDevice } = {}) {
  return async () => {
    const currentPath = path || await discover();
    if (!currentPath) throw Object.assign(new Error('No USB bridge found. Plug in its USB data cable.'), { code: 'no_board' });
    return open({ path: currentPath, onError });
  };
}

/**
 * Opens the port, releases DTR/RTS (DevKits wire them to EN/BOOT), waits out the boot and runs
 * HELLO with retries. Returns { device, port, info }.
 */
export async function openSerialDevice({ path, ackTimeoutMs = 2500, bootWaitMs = 1500, onError = () => {} }) {
  const { SerialPort } = await import('serialport');
  const port = new SerialPort({ path, baudRate: BAUD, autoOpen: false });
  await new Promise((resolve, reject) => port.open((err) => (err ? reject(err) : resolve())));
  await new Promise((resolve) => port.set({ dtr: false, rts: false }, () => resolve()));
  await sleep(bootWaitMs);
  const device = new Esp32Device(port, { ackTimeoutMs });
  device.on('error', onError);
  let lastErr;
  for (let i = 0; i < 3; i += 1) {
    try {
      let info = await device.hello();
      await device.statusRequest();
      // HELLO is served by the UART tasks while Bluedroid is still starting.
      // Opening pairing before start_bluetooth() finishes can be undone by its
      // final NON_DISCOVERABLE setting. Wait for actual STATE, not a longer sleep.
      await device.waitForState((s) => s.device !== 'booting' && s.device !== 'usb_ready', ackTimeoutMs);
      if (info.bdaddr === '00:00:00:00:00:00' && device.state.device !== 'fault') info = await device.hello();
      return { device, port, info };
    } catch (err) {
      lastErr = err;
    }
  }
  device.close();
  await new Promise((resolve) => port.close(() => resolve()));
  throw lastErr;
}

export async function closeSerialDevice({ device, port }) {
  device.close();
  if (port?.isOpen) await new Promise((resolve) => port.close(() => resolve()));
}
