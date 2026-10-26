import express from 'express';
import request from 'supertest';
import { describe, expect, it } from '@jest/globals';
import { corsMiddleware, isSameOrigin } from '../../src/shared/middleware/cors.js';

/** The SMS link page posts to its own server: same-origin requests must not need the allow-list. */
describe('same-origin requests and CORS', () => {
  const app = express();
  app.use(corsMiddleware);
  app.post('/c/x/api/message', (_req, res) => res.json({ ok: true }));
  app.use((err, _req, res, _next) => res.status(403).json({ error: err.message })); // eslint-disable-line no-unused-vars

  it('a page on any host this API is served from can call itself (LAN IP, short link domain)', async () => {
    const res = await request(app).post('/c/x/api/message').set('Host', '192.168.1.12:9098').set('Origin', 'http://192.168.1.12:9098').send({});
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined(); // no CORS grant needed or given
  });

  it('a different site is still rejected', async () => {
    const res = await request(app).post('/c/x/api/message').set('Host', 'upd.example').set('Origin', 'https://evil.example').send({});
    expect(res.status).toBe(403);
  });

  it('compares the full host (port included)', () => {
    expect(isSameOrigin({ headers: { origin: 'http://upd.example:9098', host: 'upd.example:9098' } })).toBe(true);
    expect(isSameOrigin({ headers: { origin: 'http://upd.example:8080', host: 'upd.example:9098' } })).toBe(false);
    expect(isSameOrigin({ headers: { origin: 'null', host: 'upd.example' } })).toBe(false);
    expect(isSameOrigin({ headers: { host: 'upd.example' } })).toBe(false);
  });
});
