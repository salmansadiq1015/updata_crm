import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { afterEach, describe, expect, it } from '@jest/globals';
import { verifyLiveKitSignature } from '../../src/modules/aiCalling/aiCalling.controller.js';

const original = {
  NODE_ENV: process.env.NODE_ENV,
  LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET,
};

afterEach(() => {
  Object.entries(original).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  });
});

function requestFor(body, token) {
  return { rawBody: body, get: (name) => (name.toLowerCase() === 'authorization' ? `Bearer ${token}` : '') };
}

describe('LiveKit webhook signature verification', () => {
  it('verifies the JWT signature, issuer and raw-body digest', () => {
    process.env.NODE_ENV = 'production';
    process.env.LIVEKIT_API_KEY = 'lk-key';
    process.env.LIVEKIT_API_SECRET = 'lk-secret';
    const body = Buffer.from('{"event":"participant_joined"}');
    const token = jwt.sign({ sha256: crypto.createHash('sha256').update(body).digest('base64') }, 'lk-secret', {
      algorithm: 'HS256', issuer: 'lk-key', expiresIn: 60,
    });
    expect(verifyLiveKitSignature(requestFor(body, token))).toBe(true);
  });

  it('rejects a forged payload-only JWT and a body mismatch', () => {
    process.env.NODE_ENV = 'production';
    process.env.LIVEKIT_API_KEY = 'lk-key';
    process.env.LIVEKIT_API_SECRET = 'lk-secret';
    const body = Buffer.from('{}');
    const digest = crypto.createHash('sha256').update(body).digest('base64');
    const forged = jwt.sign({ sha256: digest }, 'wrong-secret', { algorithm: 'HS256', issuer: 'lk-key', expiresIn: 60 });
    const valid = jwt.sign({ sha256: digest }, 'lk-secret', { algorithm: 'HS256', issuer: 'lk-key', expiresIn: 60 });
    expect(verifyLiveKitSignature(requestFor(body, forged))).toBe(false);
    expect(verifyLiveKitSignature(requestFor(Buffer.from('{"changed":true}'), valid))).toBe(false);
  });
});
