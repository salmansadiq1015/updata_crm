import crypto from 'node:crypto';
import { describe, expect, it } from '@jest/globals';

import { deviceReadiness } from '../../src/modules/pairedPhone/readiness.js';
import {
  decryptDialKey, encryptDialKey, hashToken, newPairingCode, normalizePairingCode, signDial,
} from '../../src/modules/pairedPhone/deviceCrypto.js';

const now = new Date('2026-10-23T12:00:00Z');
const ready = (over = {}) => ({
  revokedAt: null,
  audioVerifiedAt: new Date('2026-10-20'),
  lastHeartbeatAt: new Date(now.getTime() - 5_000),
  board: { connected: true, keyProvisioned: true },
  state: { device: 'hfp_ready', hfp: 'slc', call: 0, callsetup: 0 },
  limits: { cooldownSeconds: 60, maxCallsPerHour: 20, maxCallsPerDay: 100 },
  currentCallId: null,
  attention: { needed: false },
  lastCallEndedAt: null,
  ...over,
});

describe('paired-phone readiness', () => {
  it('is ready only when every check passes', () => {
    expect(deviceReadiness(ready(), { now })).toMatchObject({ ok: true, online: true, reasons: [] });
  });

  it.each([
    [{ revokedAt: new Date() }, 'revoked', true],
    [{ archivedAt: new Date() }, 'archived', true],
    [{ audioVerifiedAt: null }, 'audio_not_verified', true],
    [{ lastHeartbeatAt: new Date(now.getTime() - 60_000) }, 'gateway_offline', false],
    [{ board: { connected: false } }, 'board_disconnected', false],
    [{ board: { connected: true, keyProvisioned: false } }, 'key_not_provisioned', true],
    [{ dialKey: { state: 'pending' } }, 'key_not_provisioned', true],
    [{ dialKey: { state: 'delivered' } }, 'key_not_provisioned', true],
    [{ state: { hfp: 'connected' } }, 'phone_not_connected', false],
    [{ state: { hfp: 'slc', call: 1 } }, 'phone_in_call', false],
    [{ state: { device: 'fault', hfp: 'slc' } }, 'firmware_fault', true],
    [{ attention: { needed: true } }, 'needs_attention', true],
    [{ currentCallId: 'x' }, 'device_busy', false],
  ])('%o → %s', (over, reason, blocking) => {
    const r = deviceReadiness(ready(over), { now });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain(reason);
    expect(r.blocking).toBe(blocking);
  });

  it('cooldown and caps clear by themselves with a retry time', () => {
    const cool = deviceReadiness(ready({ lastCallEndedAt: new Date(now.getTime() - 20_000) }), { now });
    expect(cool).toMatchObject({ ok: false, reasons: ['cooldown'], blocking: false, retryInMs: 40_000 });
    expect(deviceReadiness(ready(), { now, callsLastHour: 20 }).reasons).toEqual(['hourly_cap']);
    expect(deviceReadiness(ready(), { now, callsToday: 100 }).reasons).toEqual(['daily_cap']);
    expect(deviceReadiness(null, { now })).toMatchObject({ ok: false, blocking: true });
  });

  it('a diagnostic audio test skips only prior audio proof and never key, fault or connection gates', () => {
    const d = ready({ audioVerifiedAt: null });
    expect(deviceReadiness(d, { now }).reasons).toContain('audio_not_verified');
    expect(deviceReadiness(d, { now, audioVerificationTest: true }).ok).toBe(true);
    expect(deviceReadiness({ ...d, board: { connected: true, keyProvisioned: false } }, { now, audioVerificationTest: true }).reasons).toContain('key_not_provisioned');
    expect(deviceReadiness({ ...d, state: { hfp: 'disconnected' } }, { now, audioVerificationTest: true }).reasons).toContain('phone_not_connected');
    expect(deviceReadiness({ ...d, attention: { needed: true } }, { now, audioVerificationTest: true }).reasons).toContain('needs_attention');
    expect(d.audioVerifiedAt).toBeNull();
  });
});

describe('paired-phone crypto', () => {
  it('dial signature matches the firmware/gateway vector', () => {
    const key = Buffer.from([...Array(32).keys()]);
    expect(signDial(key, { sessionNonce: '00112233445566778899aabbccddeeff', counter: 1, callRef: 42, number: '+923001234567' }))
      .toBe('3d83fa64eae811a1db5ee6c88ff587696651f8bdd2a97b276e0eeeaf0d222d9e');
    expect(() => signDial(key, { sessionNonce: 'zz', counter: 1, callRef: 1, number: '+923001234567' })).toThrow();
    expect(() => signDial(key, { sessionNonce: '00112233445566778899aabbccddeeff', counter: 1, callRef: 1, number: '0300;ATH' })).toThrow();
  });

  it('dial keys round-trip through AES-GCM and tampering is detected', () => {
    const key = crypto.randomBytes(32);
    const blob = encryptDialKey(key);
    expect(blob).not.toContain(key.toString('hex'));
    expect(decryptDialKey(blob).equals(key)).toBe(true);
    const parts = blob.split('.');
    parts[3] = Buffer.from('x'.repeat(32)).toString('base64url');
    expect(() => decryptDialKey(parts.join('.'))).toThrow();
  });

  it('pairing codes are readable and normalised; tokens are stored hashed', () => {
    const code = newPairingCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(normalizePairingCode(code.toLowerCase().replace('-', ' '))).toBe(code.replace('-', ''));
    expect(hashToken('abc')).toHaveLength(64);
  });
});
