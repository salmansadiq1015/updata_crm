/**
 * Dial authorization for the ESP32 bridge. The firmware dials only when the DIAL frame carries
 * HMAC-SHA256(deviceKey, message) for the CURRENT session nonce and a counter above the last one
 * it accepted, so a host process that can write to the serial port still cannot dial on its own
 * or replay an old authorization. The key is written once, while the board's BOOT button is held
 * (physical presence), and is then held by whoever authorizes calls (the CRM; the local probe
 * during the Phase 1 test).
 *
 * Firmware twin: esp32/firmware/main/dialauth.c
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const NUMBER_RE = /^\+?[0-9]{3,20}$/;

export function normalizeNumber(raw) {
  const cleaned = String(raw ?? '').replace(/[\s\-().]/g, '');
  if (!NUMBER_RE.test(cleaned)) throw new Error(`not a dialable number: ${raw}`);
  return cleaned;
}

export function dialMessage({ sessionNonce, counter, callRef, number }) {
  if (!/^[0-9a-f]{32}$/.test(sessionNonce)) throw new Error('sessionNonce must be 16 bytes of hex');
  return `updata-dial-v1|${sessionNonce}|${counter >>> 0}|${callRef >>> 0}|${normalizeNumber(number)}`;
}

export function signDial(key, fields) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('device key must be 32 bytes');
  return createHmac('sha256', key).update(dialMessage(fields), 'ascii').digest();
}

export function verifyDial(key, fields, mac) {
  const want = signDial(key, fields);
  return mac.length === want.length && timingSafeEqual(mac, want);
}

export const newDeviceKey = () => randomBytes(32);
