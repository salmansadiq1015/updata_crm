import mongoose from 'mongoose';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from '@jest/globals';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';

let Assignment;
let WorkReport;
let InAppNotification;
let DeviceToken;
let syncService;

beforeAll(async () => {
  await connectTestDb();
  ({ default: Assignment } = await import('../../src/modules/deploy/assignment.model.js'));
  ({ default: WorkReport } = await import('../../src/modules/mobile/workReport.model.js'));
  ({ default: InAppNotification } = await import('../../src/modules/notifications/inAppNotification.model.js'));
  ({ default: DeviceToken } = await import('../../src/modules/mobile/deviceToken.model.js'));
  ({ default: syncService } = await import('../../src/modules/mobile/sync.service.js'));
});

afterEach(async () => {
  await clearTestDb();
});

afterAll(async () => {
  await disconnectTestDb();
});

function objectId() {
  return new mongoose.Types.ObjectId();
}

describe('mobile sync status', () => {
  test('returns server-side pending counts instead of a placeholder', async () => {
    const userId = objectId();
    const otherUserId = objectId();

    await Assignment.create({
      assignmentNumber: 'A-SYNC-1',
      employeeId: userId,
      assignmentType: 'SERVICE_CALL',
      title: 'Service visit',
      startDatetime: new Date(),
      endDatetime: new Date(Date.now() + 60 * 60 * 1000),
      status: 'PLANNED',
      createdBy: objectId(),
    });

    await WorkReport.create({
      reportNumber: 'WR-SYNC-1',
      orderId: objectId(),
      reportDate: new Date(),
      workPerformed: 'Draft report',
      technicianId: userId,
      createdBy: userId,
      status: 'DRAFT',
    });

    await InAppNotification.create({
      userId,
      title: 'New task',
      body: 'A new task is assigned.',
      isRead: false,
    });

    await DeviceToken.create({
      userId,
      deviceToken: 'device-token-1',
      platform: 'ANDROID',
      isActive: true,
    });

    await DeviceToken.create({
      userId: otherUserId,
      deviceToken: 'device-token-2',
      platform: 'ANDROID',
      isActive: true,
    });

    const status = await syncService.getSyncStatus(userId);

    expect(status.pendingItems).toBe(3);
    expect(status.breakdown).toMatchObject({
      orders: 1,
      notifications: 1,
      workReports: 1,
    });
    expect(status.device).toMatchObject({
      registered: true,
      activeTokens: 1,
    });
    expect(status.serverTimestamp).toBeInstanceOf(Date);
  });
});
