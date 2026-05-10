import request from 'supertest';
import { createApp } from '../../src/app.js';
import { disconnectRedis } from '../../src/config/redis.js';
import logger from '../../src/shared/logger/index.js';

describe('System routes', () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  afterAll(async () => {
    await disconnectRedis(logger);
  });

  test('rejects unauthenticated access to system config', async () => {
    const response = await request(app).get('/api/v1/system/config');

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('NO_TOKEN');
  });

  test('rejects unauthenticated access to job operations', async () => {
    const response = await request(app).delete('/api/v1/system/jobs/email-dispatch/1');

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('NO_TOKEN');
  });
});
