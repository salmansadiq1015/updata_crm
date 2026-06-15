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

jest.unstable_mockModule('../../src/modules/notifications/notification.service.js', () => ({
  default: {
    create: createNotification,
  },
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
    createNotification.mockClear();
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
        payload: {
          installationName: 'Boiler A',
          siteName: 'Main site',
          dueDate: '2026-05-01',
        },
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
        payload: {
          count: 2,
          daysOverdue: 14,
        },
      }),
      null,
      { ipAddress: 'internal', userAgent: 'event-handler' },
    );
  });
});
