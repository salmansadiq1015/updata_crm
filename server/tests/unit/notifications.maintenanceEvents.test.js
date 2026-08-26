import {
  setImmediate,
} from 'node:timers';
import {
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';
import EVENT_TYPES from '../../src/shared/events/eventTypes.js';
import eventBus from '../../src/shared/events/EventBus.js';

const createNotification = jest.fn(async (data) => ({ _id: 'notification-1', ...data }));
const logger = {
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
};

jest.unstable_mockModule('../../src/modules/notifications/notification.service.js', () => ({
  default: {
    create: createNotification,
  },
}));

jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({
  default: logger,
}));

const { registerNotificationsEvents } = await import('../../src/modules/notifications/notifications.events.js');

function flushEventHandlers() {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

describe('maintenance notification events', () => {
  beforeEach(() => {
    eventBus.removeAllListeners();
    createNotification.mockReset();
    createNotification.mockImplementation(async (data) => ({ _id: 'notification-1', ...data }));
    Object.values(logger).forEach((mock) => mock.mockClear());
  });

  test('dispatches overdue maintenance notifications to assigned recipients', async () => {
    registerNotificationsEvents();

    eventBus.publish(EVENT_TYPES.MAINTENANCE_OVERDUE, {
      assignedTo: ['user-1', 'user-2'],
      installationName: 'Boiler A',
      siteName: 'Main site',
      dueDate: '2026-05-01',
      maintenanceId: 'maintenance-1',
    }, { source: 'jobs:maintenance-check' });

    await flushEventHandlers();

    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'maintenance_overdue',
        category: 'MAINTENANCE',
        priority: 'HIGH',
        channels: ['IN_APP', 'PUSH', 'EMAIL'],
        recipientIds: ['user-1', 'user-2'],
        sourceModule: 'crm',
        sourceEvent: 'MAINTENANCE_OVERDUE',
        sourceEntityType: 'MaintenanceInterval',
        sourceEntityId: 'maintenance-1',
        // The payload also carries the German title and body the office
        // reads; asserting the whole object made this test break the day
        // wording was added to it.
        payload: expect.objectContaining({
          installationName: 'Boiler A',
          siteName: 'Main site',
          dueDate: '2026-05-01',
          title: 'Wartung überfällig',
          body: 'Boiler A – Main site',
        }),
      }),
      null,
      { ipAddress: 'internal', userAgent: 'event-handler' },
    );
  });

  test('does not dispatch overdue maintenance notifications without recipients', async () => {
    registerNotificationsEvents();

    eventBus.publish(EVENT_TYPES.MAINTENANCE_OVERDUE, {
      count: 3,
    }, { source: 'jobs:maintenance-check' });

    await flushEventHandlers();

    expect(createNotification).not.toHaveBeenCalled();
  });

  test('dispatches critical maintenance escalation notifications with overdue threshold', async () => {
    registerNotificationsEvents();

    eventBus.publish(EVENT_TYPES.MAINTENANCE_ESCALATED, {
      assignedTo: ['admin-1'],
      count: 2,
      daysOverdue: 14,
      maintenanceId: 'maintenance-2',
    }, { source: 'jobs:maintenance-check' });

    await flushEventHandlers();

    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'maintenance_escalated',
        category: 'MAINTENANCE',
        priority: 'CRITICAL',
        channels: ['IN_APP', 'EMAIL'],
        recipientIds: ['admin-1'],
        sourceModule: 'crm',
        sourceEvent: 'MAINTENANCE_ESCALATED',
        sourceEntityType: 'MaintenanceInterval',
        sourceEntityId: 'maintenance-2',
        payload: expect.objectContaining({
          count: 2,
          daysOverdue: 14,
          title: 'Wartung eskaliert',
          body: '2 Wartungen seit 14 Tagen überfällig',
        }),
      }),
      null,
      { ipAddress: 'internal', userAgent: 'event-handler' },
    );
  });

  test('skips duplicate task overdue notifications without error logging', async () => {
    registerNotificationsEvents();

    const duplicateError = new Error('Duplicate notification (idempotency key already exists)');
    duplicateError.code = 'NOTIF_DUPLICATE';
    duplicateError.statusCode = 409;
    createNotification.mockRejectedValueOnce(duplicateError);

    eventBus.publish(EVENT_TYPES.TASK_OVERDUE, {
      taskId: 'task-1',
      taskTitle: 'Replace pump',
      assigneeId: 'user-1',
      dueDate: '2026-07-16',
    }, { source: 'jobs:task-overdue-check' });

    await flushEventHandlers();

    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'task_overdue',
        sourceEvent: 'TASK_OVERDUE',
        sourceEntityType: 'Task',
        sourceEntityId: 'task-1',
        idempotencyKey: expect.stringMatching(/^task-overdue-task-1-\d{4}-\d{2}-\d{2}$/),
      }),
      null,
      { ipAddress: 'internal', userAgent: 'event-handler' },
    );
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      'Skipped duplicate notification dispatch for TASK_OVERDUE',
      expect.objectContaining({
        action: 'event.dispatch.duplicate',
        sourceEvent: 'TASK_OVERDUE',
        idempotencyKey: expect.stringMatching(/^task-overdue-task-1-\d{4}-\d{2}-\d{2}$/),
      }),
    );
  });

  test('logs task overdue notification dispatch failures when the error is not a duplicate', async () => {
    registerNotificationsEvents();

    createNotification.mockRejectedValueOnce(new Error('queue unavailable'));

    eventBus.publish(EVENT_TYPES.TASK_OVERDUE, {
      taskId: 'task-2',
      taskTitle: 'Calibrate valve',
      assigneeId: 'user-1',
      dueDate: '2026-07-16',
    }, { source: 'jobs:task-overdue-check' });

    await flushEventHandlers();

    expect(logger.info).not.toHaveBeenCalledWith(
      'Skipped duplicate notification dispatch for TASK_OVERDUE',
      expect.any(Object),
    );
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to dispatch notification for TASK_OVERDUE',
      expect.objectContaining({
        action: 'event.dispatch',
        sourceEvent: 'TASK_OVERDUE',
        idempotencyKey: expect.stringMatching(/^task-overdue-task-2-\d{4}-\d{2}-\d{2}$/),
        error: expect.objectContaining({ message: 'queue unavailable' }),
      }),
    );
  });
});
