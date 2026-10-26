/** Finding and opening the ESP32 bridge on a USB serial port (shared by the probe and the gateway). */

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

export async function listPorts() {
  const { SerialPort } = await import('serialport');
  return (await SerialPort.list()).map((p) => {
    const id = p.vendorId ? `${p.vendorId}:${p.productId}`.toLowerCase() : '';
    return {
      path: p.path,
      id,
      manufacturer: p.manufacturer || '',
      bridge: USB_BRIDGES[id] || null,
      nativeUsbNoClassicBt: id.startsWith('303a:'), // ESP32-S2/S3/C3/C6: no Classic Bluetooth
    };
  });
}

/** The single USB-serial bridge present, preferring macOS /dev/cu.* names. */
export async function findBoardPort() {
  const candidates = (await listPorts()).filter((p) => p.bridge && !p.path.includes('/dev/tty.'));
  if (candidates.length === 1) return candidates[0].path;
  if (candidates.length > 1) throw new Error(`Several USB-serial boards found (${candidates.map((c) => c.path).join(', ')}); pass --port`);
  return null;
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
      const info = await device.hello();
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
