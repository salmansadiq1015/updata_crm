import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  afterAll, beforeAll, beforeEach, describe, expect, test,
} from '@jest/globals';
import {
  buildIntegrationStatusNotification, findActiveAdminIds,
} from '../../src/modules/integrations/integrations.events.js';

let mongod;
let Role;
let User;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  Role = (await import('../../src/modules/auth/role.model.js')).default;
  User = (await import('../../src/modules/auth/user.model.js')).default;
});

beforeEach(async () => {
  await Promise.all([Role.deleteMany({}), User.deleteMany({})]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('integration status admin alerts', () => {
  test('builds a critical, deduplicated outage alert and redacts credential-shaped error text', () => {
    const result = buildIntegrationStatusNotification({
      integrationKey: 'messaging_textbee', displayName: 'TextBee SMS gateway',
      oldStatus: 'healthy', newStatus: 'down', checkedAt: '2026-10-12T12:00:00.000Z',
      errorMessage: 'token=do-not-expose device offline', settingsPath: '/admin/messaging',
    }, ['admin-1']);

    expect(result).toMatchObject({
      priority: 'CRITICAL', channels: ['IN_APP', 'EMAIL'], recipientIds: ['admin-1'],
      idempotencyKey: 'integration-status:messaging_textbee:healthy:down:2026-10-12T12',
      payload: { deepLink: '/admin/messaging', errorMessage: 'token=[REDACTED] device offline' },
    });
    expect(JSON.stringify(result)).not.toContain('do-not-expose');
  });

  test('uses an in-app recovery notice and ignores healthy-to-healthy noise', () => {
    expect(buildIntegrationStatusNotification({
      integrationKey: 'messaging_twilio', oldStatus: 'down', newStatus: 'healthy',
      checkedAt: '2026-10-12T12:05:00.000Z',
    }, ['admin-1'])).toMatchObject({ priority: 'NORMAL', channels: ['IN_APP'] });

    expect(buildIntegrationStatusNotification({
      integrationKey: 'messaging_twilio', oldStatus: 'healthy', newStatus: 'healthy',
    }, ['admin-1'])).toBeNull();
  });

  test('targets every active Admin-role user and excludes inactive, deleted, and non-admin accounts', async () => {
    const [adminRole, staffRole] = await Role.create([{ name: 'Admin' }, { name: 'Employee' }]);
    const users = await User.create([
      { email: 'active-admin@example.test', passwordHash: 'hash', firstName: 'Active', lastName: 'Admin', role: adminRole._id, status: 'active' },
      { email: 'pending-admin@example.test', passwordHash: 'hash', firstName: 'Pending', lastName: 'Admin', role: adminRole._id, status: 'pending_activation' },
      { email: 'deleted-admin@example.test', passwordHash: 'hash', firstName: 'Deleted', lastName: 'Admin', role: adminRole._id, status: 'active', isDeleted: true },
      { email: 'active-staff@example.test', passwordHash: 'hash', firstName: 'Active', lastName: 'Staff', role: staffRole._id, status: 'active' },
    ]);

    const ids = (await findActiveAdminIds()).map(String);

    expect(ids).toEqual([String(users[0]._id)]);
  });
});
