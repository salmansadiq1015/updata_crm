/**
 * Personal link tokens. A token is 128 random bits, base62-encoded (22 chars) so the
 * URL stays short in an SMS. Only an HMAC of it is stored: a database leak does not
 * reveal working links, and the token itself carries no data (not a JWT).
 */
import crypto from 'node:crypto';

import { TOKEN_BYTES } from '../linkAssistant.constants.js';

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const TOKEN_LENGTH = 22; // ceil(128 / log2(62))
export const TOKEN_PATTERN = /^[0-9A-Za-z]{22}$/;

export function encodeBase62(buffer) {
  let n = BigInt(`0x${buffer.toString('hex') || '0'}`);
  let out = '';
  while (n > 0n) {
    out = ALPHABET[Number(n % 62n)] + out;
    n /= 62n;
  }
  return out.padStart(TOKEN_LENGTH, '0');
}

export function generateToken(randomBytes = crypto.randomBytes) {
  return encodeBase62(randomBytes(TOKEN_BYTES));
}

function secret() {
  const s = process.env.LINK_ASSISTANT_TOKEN_SECRET || process.env.JWT_SECRET || '';
  if (!s && process.env.NODE_ENV === 'production') {
    throw new Error('LINK_ASSISTANT_TOKEN_SECRET (or JWT_SECRET) must be set');
  }
  return s || 'dev-only-link-secret';
}

/**
 * Token for one SMS send. Derived (keyed HMAC) from the mobile operation id so a
 * retried authorisation returns the SAME link — the plain token is never stored.
 * Without the server secret it is as unpredictable as a random token.
 */
export function tokenForOperation(operationId) {
  const digest = crypto.createHmac('sha256', secret()).update(`op:${operationId}`).digest();
  return encodeBase62(digest.subarray(0, TOKEN_BYTES));
}

export function hashToken(token) {
  return crypto.createHmac('sha256', secret()).update(`link:${token}`).digest('hex');
}

/** Random id for the device cookie; only its hash is stored on the session. */
export function generateDeviceId() {
  return crypto.randomBytes(16).toString('hex');
}

export function hashDevice(deviceId) {
  return crypto.createHmac('sha256', secret()).update(`device:${deviceId}`).digest('hex').slice(0, 32);
}

export function isWellFormedToken(token) {
  return typeof token === 'string' && TOKEN_PATTERN.test(token);
}

export function linkUrl(token, base = process.env.LINK_ASSISTANT_BASE_URL || process.env.PUBLIC_API_BASE_URL || 'http://localhost:9097') {
  return `${String(base).replace(/\/+$/, '')}/c/${token}`;
}
