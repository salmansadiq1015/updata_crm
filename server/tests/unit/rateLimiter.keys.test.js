import { describe, expect, it } from '@jest/globals';
import { ipKeyGenerator } from 'express-rate-limit';

/**
 * Regression: express-rate-limit v8's ipKeyGenerator takes an IP string. Passing (req, res)
 * returned the request object, so every anonymous client shared the key "[object Object]".
 */
describe('rate limiter keys', () => {
  it('ipKeyGenerator needs the IP string (v8 contract)', () => {
    expect(`${ipKeyGenerator({ ip: '1.2.3.4' })}`).toBe('[object Object]'); // the old, broken call shape
    expect(ipKeyGenerator('1.2.3.4')).toBe('1.2.3.4');
    expect(ipKeyGenerator('2001:db8::1')).toBe('2001:db8::/56');
  });

  it('limiter modules no longer pass the request object', async () => {
    const fs = await import('node:fs');
    for (const file of ['src/shared/middleware/rateLimiter.js', 'src/modules/extension/extension.routes.js', 'src/modules/governance/governance.routes.js', 'src/modules/workflowAutomation/workflow.routes.js']) {
      expect([file, /ipKeyGenerator\(req,\s*res\)/.test(fs.readFileSync(file, 'utf8'))]).toEqual([file, false]);
    }
  });

  it('distinct clients get distinct keys through the real limiters', async () => {
    const { authLimiter } = await import('../../src/shared/middleware/rateLimiter.js');
    expect(typeof authLimiter).toBe('function');
    const express = (await import('express')).default;
    const request = (await import('supertest')).default;
    const app = express();
    app.set('trust proxy', 1);
    app.post('/login', authLimiter, (req, res) => res.json({ ok: true }));
    // Exhaust the budget for one IP; another IP must still pass.
    let last;
    for (let i = 0; i < 60; i += 1) { last = await request(app).post('/login').set('X-Forwarded-For', '10.0.0.1'); if (last.status === 429) break; }
    expect(last.status).toBe(429);
    const other = await request(app).post('/login').set('X-Forwarded-For', '10.0.0.2');
    expect(other.status).toBe(200);
  });
});
