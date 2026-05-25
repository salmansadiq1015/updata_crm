import request from 'supertest';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test,
} from '@jest/globals';
import { createApp } from '../../src/app.js';
import { disconnectRedis } from '../../src/config/redis.js';
import logger from '../../src/shared/logger/index.js';

describe('Migration routes', () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  afterAll(async () => {
    await disconnectRedis(logger);
  });

  test('rejects unauthenticated access to migration admin routes', async () => {
    const response = await request(app).get('/api/v1/admin/migration/runs');

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('NO_TOKEN');
  });
});
