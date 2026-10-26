import crypto from 'node:crypto';

/**
 * Secrets for paired phones.
 *  - Gateway tokens: random 32 bytes, stored as SHA-256 only.
 *  - ESP32 dial keys: AES-256-GCM at rest, key derived (HKDF) from PAIRED_PHONE_KEY_SECRET.
 *  - Dial authorization: HMAC-SHA256 exactly as the firmware verifies it
 *    (server/phone-gateway/esp32/firmware/main/dialauth.c; same test vector).
 */

function masterSecret() {
  const value = process.env.PAIRED_PHONE_KEY_SECRET || process.env.JWT_SECRET || '';
  if (value) return value;
  if (process.env.NODE_ENV === 'production') throw new Error('PAIRED_PHONE_KEY_SECRET (or JWT_SECRET) is required in production');
  return 'dev-insecure-paired-phone-secret';
}

const encKey = () => Buffer.from(crypto.hkdfSync('sha256', masterSecret(), 'updata-paired-phone', 'device-dial-key-v1', 32));

export const newToken = () => crypto.randomBytes(32).toString('base64url');
export const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
export const newDialKey = () => crypto.randomBytes(32);

/** 8 characters from an alphabet without look-alikes, shown as XXXX-XXXX. */
export function newPairingCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  const raw = [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}
export const normalizePairingCode = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export function encryptDialKey(key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  const enc = Buffer.concat([cipher.update(key), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${enc.toString('base64url')}`;
}

export function decryptDialKey(blob) {
  const [v, iv, tag, enc] = String(blob || '').split('.');
  if (v !== 'v1' || !iv || !tag || !enc) throw new Error('unreadable dial key');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(enc, 'base64url')), decipher.final()]);
}

const NUMBER_RE = /^\+?[0-9]{3,20}$/;

export function dialMessage({ sessionNonce, counter, callRef, number }) {
  if (!/^[0-9a-f]{32}$/.test(sessionNonce || '')) throw new Error('session nonce must be 16 bytes of hex');
  if (!NUMBER_RE.test(number || '')) throw new Error('number is not dialable');
  return `updata-dial-v1|${sessionNonce}|${counter >>> 0}|${callRef >>> 0}|${number}`;
}

export function signDial(key, fields) {
  return crypto.createHmac('sha256', key).update(dialMessage(fields), 'ascii').digest('hex');
}
