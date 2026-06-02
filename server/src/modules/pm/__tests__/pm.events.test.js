import { jest, describe, it, beforeAll, afterEach, expect } from '@jest/globals';

// Paths below are relative to THIS test file (src/modules/pm/__tests__/).
// jest.unstable_mockModule resolves relative to the test file, but Jest keys
// mocked modules by their resolved absolute path — which matches how the
// dynamic imports inside pm.events.js (one directory up) will resolve.

// --- mock notification service ---
// pm.events.js imports '../notifications/notification.service.js' (from pm/)
// From __tests__/ that resolves to '../../notifications/notification.service.js'
const mockNotificationCreate = jest.fn();
jest.unstable_mockModule('../../notifications/notification.service.js', () => ({
  default: { create: mockNotificationCreate },
}));

// --- mock project model ---
// pm.events.js imports './project.model.js' (from pm/)
// From __tests__/ that is '../project.model.js'
const mockProjectFindById = jest.fn();
jest.unstable_mockModule('../project.model.js', () => ({
  default: {
    findById: jest.fn(() => ({
      select: jest.fn(() => ({
        lean: mockProjectFindById,
      })),
    })),
  },
}));

// --- mock shared/events/EventBus so we can capture handlers ---
// pm.events.js imports '../../shared/events/EventBus.js' (from pm/)
// From __tests__/ that is '../../../shared/events/EventBus.js'
const listeners = {};
jest.unstable_mockModule('../../../shared/events/EventBus.js', () => ({
  default: {
    on: (event, handler) => { listeners[event] = handler; },
  },
}));

// --- mock EVENT_TYPES ---
jest.unstable_mockModule('../../../shared/events/eventTypes.js', () => ({
  default: {
    CUSTOMER_UPDATED: 'CUSTOMER_UPDATED',
    PROJECT_STATUS_CHANGED: 'PROJECT_STATUS_CHANGED',
    PREP_ACTION_CREATED: 'PREP_ACTION_CREATED',
    PREP_ACTION_UPDATED: 'PREP_ACTION_UPDATED',
    PREP_ACTION_OVERDUE: 'PREP_ACTION_OVERDUE',
  },
}));

// --- mock CacheManager (used by other handlers) ---
jest.unstable_mockModule('../../../shared/cache/CacheManager.js', () => ({
  default: { invalidatePattern: jest.fn(), del: jest.fn() },
}));

// --- mock config ---
jest.unstable_mockModule('../../../config/index.js', () => ({
  default: { redis: { keyPrefix: 'test:' } },
}));

// --- mock logger ---
jest.unstable_mockModule('../../../shared/logger/index.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

let registerPmEvents;

beforeAll(async () => {
  const mod = await import('../pm.events.js');
  registerPmEvents = mod.registerPmEvents;
  registerPmEvents();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('PREP_ACTION_CREATED handler', () => {
  const basePayload = {
    actionId: 'action-123',
    projectId: 'project-456',
    title: 'Install boiler',
    assignedToId: 'user-789',
  };

  it('calls notificationService.create with the assignee when assignedToId is set', async () => {
    mockNotificationCreate.mockResolvedValue({ _id: 'notif-100' });

    await listeners['PREP_ACTION_CREATED']({ payload: basePayload });

    expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
    const [data, userId] = mockNotificationCreate.mock.calls[0];

    expect(data.recipientIds).toEqual([basePayload.assignedToId]);
    expect(data.type).toBe('prep_action_assigned');
    expect(data.category).toBe('PROJECT');
    expect(data.priority).toBe('NORMAL');
    expect(data.channels).toEqual(expect.arrayContaining(['IN_APP', 'EMAIL']));
    expect(data.sourceModule).toBe('pm');
    expect(data.sourceEvent).toBe('PREP_ACTION_CREATED');
    expect(data.sourceEntityType).toBe('PreparatoryAction');
    expect(data.sourceEntityId).toBe(basePayload.actionId);
    expect(data.payload).toMatchObject({
      title: basePayload.title,
      projectId: basePayload.projectId,
      actionId: basePayload.actionId,
    });
    expect(userId).toBeNull();
  });

  it('does not notify when assignedToId is missing', async () => {
    await listeners['PREP_ACTION_CREATED']({
      payload: { ...basePayload, assignedToId: null },
    });

    expect(mockNotificationCreate).not.toHaveBeenCalled();
  });

  it('logs error but does not throw when notificationService.create rejects', async () => {
    mockNotificationCreate.mockRejectedValue(new Error('DB down'));

    await expect(
      listeners['PREP_ACTION_CREATED']({ payload: basePayload }),
    ).resolves.toBeUndefined();
  });
});

describe('PREP_ACTION_OVERDUE handler', () => {
  const basePayload = {
    actionId: 'action-123',
    projectId: 'project-456',
    title: 'Install boiler',
    dueDate: '2026-05-01',
    assignedToId: 'user-789',
  };

  it('calls notificationService.create with recipientIds containing the assignee', async () => {
    mockNotificationCreate.mockResolvedValue({ _id: 'notif-001' });
    mockProjectFindById.mockResolvedValue(null); // no project manager

    await listeners['PREP_ACTION_OVERDUE']({ payload: basePayload });

    expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
    const [data, userId] = mockNotificationCreate.mock.calls[0];

    expect(data.recipientIds).toContain(basePayload.assignedToId);
    expect(data.type).toBe('prep_action_overdue');
    expect(data.category).toBe('PROJECT');
    expect(data.priority).toBe('HIGH');
    expect(data.channels).toEqual(expect.arrayContaining(['IN_APP', 'EMAIL']));
    expect(data.sourceModule).toBe('pm');
    expect(data.sourceEvent).toBe('PREP_ACTION_OVERDUE');
    expect(data.sourceEntityType).toBe('PreparatoryAction');
    expect(data.sourceEntityId).toBe(basePayload.actionId);
    expect(data.payload).toMatchObject({
      title: basePayload.title,
      dueDate: basePayload.dueDate,
      projectId: basePayload.projectId,
      actionId: basePayload.actionId,
    });
    expect(userId).toBeNull();
  });

  it('also includes projectManagerId in recipientIds when different from assignee', async () => {
    mockNotificationCreate.mockResolvedValue({ _id: 'notif-002' });
    mockProjectFindById.mockResolvedValue({ projectManagerId: 'manager-111' });

    await listeners['PREP_ACTION_OVERDUE']({ payload: basePayload });

    expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
    const [data] = mockNotificationCreate.mock.calls[0];

    expect(data.recipientIds).toContain(basePayload.assignedToId);
    expect(data.recipientIds).toContain('manager-111');
    expect(data.recipientIds).toHaveLength(2);
  });

  it('does not duplicate projectManagerId when same as assignee', async () => {
    mockNotificationCreate.mockResolvedValue({ _id: 'notif-003' });
    // manager is same as assignee
    mockProjectFindById.mockResolvedValue({ projectManagerId: basePayload.assignedToId });

    await listeners['PREP_ACTION_OVERDUE']({ payload: basePayload });

    const [data] = mockNotificationCreate.mock.calls[0];
    expect(data.recipientIds).toHaveLength(1);
    expect(data.recipientIds[0]).toBe(basePayload.assignedToId);
  });

  it('does not call notificationService.create when there are no recipients', async () => {
    mockProjectFindById.mockResolvedValue(null);

    await listeners['PREP_ACTION_OVERDUE']({
      payload: { ...basePayload, assignedToId: null },
    });

    expect(mockNotificationCreate).not.toHaveBeenCalled();
  });

  it('logs error but does not throw when notificationService.create rejects', async () => {
    mockNotificationCreate.mockRejectedValue(new Error('DB down'));
    mockProjectFindById.mockResolvedValue(null);

    // Should not throw — outer try/catch absorbs it
    await expect(
      listeners['PREP_ACTION_OVERDUE']({ payload: basePayload }),
    ).resolves.toBeUndefined();
  });
});
