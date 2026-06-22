import { jest, describe, it, beforeAll, afterEach, expect } from '@jest/globals';

// ── All mock registrations must happen before the module under test is imported ──

// Mock project.model — lazy-imported inside transitionStatus
const mockProjectSave = jest.fn().mockResolvedValue(undefined);
const mockProjectFindById = jest.fn();
jest.unstable_mockModule('../project.model.js', () => ({
  default: { findById: mockProjectFindById },
}));

// Mock preparatoryAction.model — lazy-imported inside transitionStatus
const mockPrepFind = jest.fn();
jest.unstable_mockModule('../preparatoryAction.model.js', () => ({
  default: {
    find: mockPrepFind,
  },
}));

// Mock scheduleEntry.model — lazy-imported for COMPLETED transition checks
jest.unstable_mockModule('../scheduleEntry.model.js', () => ({
  default: { countDocuments: jest.fn().mockResolvedValue(0) },
}));

const taskFindResult = (tasks = []) => ({
  select: jest.fn().mockReturnValue({
    limit: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(tasks),
    }),
  }),
});

const mockTaskFind = jest.fn(() => taskFindResult([]));
jest.unstable_mockModule('../../tasks/task.model.js', () => ({
  default: { find: mockTaskFind },
}));

// Mock projectStatusHistory.model
const mockHistoryCreate = jest.fn().mockResolvedValue({ changedAt: new Date() });
jest.unstable_mockModule('../projectStatusHistory.model.js', () => ({
  default: { create: mockHistoryCreate },
}));

// Mock cacheManager
jest.unstable_mockModule('../../../shared/cache/CacheManager.js', () => ({
  default: { del: jest.fn(), invalidatePattern: jest.fn() },
}));

// Mock eventBus
jest.unstable_mockModule('../../../shared/events/EventBus.js', () => ({
  default: { publish: jest.fn() },
}));

// Mock EVENT_TYPES
jest.unstable_mockModule('../../../shared/events/eventTypes.js', () => ({
  default: {
    PROJECT_STATUS_CHANGED: 'PROJECT_STATUS_CHANGED',
    PROJECT_STATUS_OVERRIDDEN: 'PROJECT_STATUS_OVERRIDDEN',
  },
}));

// Mock auditService
jest.unstable_mockModule('../../auth/audit.service.js', () => ({
  default: { logEvent: jest.fn() },
}));

// Mock queueManager
jest.unstable_mockModule('../../../shared/queue/QueueManager.js', () => ({
  default: { addJob: jest.fn().mockResolvedValue(undefined) },
}));

// Mock config
jest.unstable_mockModule('../../../config/index.js', () => ({
  default: { redis: { keyPrefix: 'test:' } },
}));

// Mock logger
jest.unstable_mockModule('../../../shared/logger/index.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// ─────────────────────────────────────────────────────────────────────────────

let statusService;
let ConflictError;

beforeAll(async () => {
  const svcMod = await import('../status.service.js');
  statusService = svcMod.default;
  const errMod = await import('../../../shared/errors/AppError.js');
  ConflictError = errMod.ConflictError;
});

afterEach(() => {
  jest.clearAllMocks();
  mockTaskFind.mockImplementation(() => taskFindResult([]));
});

// ─── AC-2: outstanding mandatory prep actions listed on blocked transition ────

describe('AC-2 — transitionStatus PLANNING→IN_PROGRESS with incomplete mandatory actions', () => {
  const projectId = 'proj-123';
  const userId = 'user-abc';

  const fakeProject = {
    _id: projectId,
    status: 'PLANNING',
    save: mockProjectSave,
  };

  it('throws ConflictError with outstanding list when mandatory actions are incomplete', async () => {
    mockProjectFindById.mockResolvedValue(fakeProject);

    const incompleteActions = [
      { _id: { toString: () => 'act-1' }, title: 'Install boiler', status: 'PENDING' },
      { _id: { toString: () => 'act-2' }, title: 'Safety inspection', status: 'IN_PROGRESS' },
    ];

    // .find().select().lean() chain
    mockPrepFind.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(incompleteActions),
      }),
    });

    await expect(
      statusService.transitionStatus(projectId, 'IN_PROGRESS', {}, userId),
    ).rejects.toMatchObject({
      message: expect.stringContaining('2 mandatory preparatory action(s) are not completed'),
      data: {
        outstanding: expect.arrayContaining([
          expect.objectContaining({ id: 'act-1', title: 'Install boiler', status: 'PENDING' }),
          expect.objectContaining({ id: 'act-2', title: 'Safety inspection', status: 'IN_PROGRESS' }),
        ]),
      },
    });
  });

  it('thrown error is a ConflictError (409)', async () => {
    mockProjectFindById.mockResolvedValue(fakeProject);

    const incompleteActions = [
      { _id: { toString: () => 'act-3' }, title: 'Gas line check', status: 'PENDING' },
    ];

    mockPrepFind.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(incompleteActions),
      }),
    });

    let caught;
    try {
      await statusService.transitionStatus(projectId, 'IN_PROGRESS', {}, userId);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ConflictError);
    expect(caught.statusCode).toBe(409);
    expect(caught.data.outstanding).toHaveLength(1);
    expect(caught.data.outstanding[0]).toMatchObject({
      id: 'act-3',
      title: 'Gas line check',
      status: 'PENDING',
    });
  });

  it('succeeds (no throw) when override is true even with incomplete actions', async () => {
    mockProjectFindById.mockResolvedValue({ ...fakeProject, save: mockProjectSave });

    const incompleteActions = [
      { _id: { toString: () => 'act-4' }, title: 'Vent check', status: 'PENDING' },
    ];

    mockPrepFind.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(incompleteActions),
      }),
    });

    await expect(
      statusService.transitionStatus(
        projectId,
        'IN_PROGRESS',
        { override: true, overrideReason: 'Emergency start' },
        userId,
      ),
    ).resolves.toMatchObject({ toStatus: 'IN_PROGRESS' });
  });

  it('succeeds with no outstanding list when all mandatory actions are completed', async () => {
    mockProjectFindById.mockResolvedValue({ ...fakeProject, save: mockProjectSave });

    // Empty list — all completed
    mockPrepFind.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    });

    await expect(
      statusService.transitionStatus(projectId, 'IN_PROGRESS', {}, userId),
    ).resolves.toMatchObject({ toStatus: 'IN_PROGRESS' });
  });
});

describe('AC-2 — transitionStatus ON_HOLD→IN_PROGRESS with incomplete mandatory actions', () => {
  const projectId = 'proj-on-hold';
  const userId = 'user-abc';

  it('throws ConflictError with outstanding list when transitioning from ON_HOLD', async () => {
    mockProjectFindById.mockResolvedValue({
      _id: projectId,
      status: 'ON_HOLD',
      save: mockProjectSave,
    });

    const incompleteActions = [
      { _id: { toString: () => 'act-5' }, title: 'Pump replacement', status: 'PENDING' },
    ];

    mockPrepFind.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(incompleteActions),
      }),
    });

    await expect(
      statusService.transitionStatus(projectId, 'IN_PROGRESS', {}, userId),
    ).rejects.toMatchObject({
      message: expect.stringContaining('1 mandatory preparatory action(s) are not completed'),
      data: {
        outstanding: [
          expect.objectContaining({ id: 'act-5', title: 'Pump replacement', status: 'PENDING' }),
        ],
      },
    });
  });
});

describe('TASK-013 - project completion is guarded by open project tasks', () => {
  const projectId = 'proj-with-tasks';
  const userId = 'user-abc';

  it('throws ConflictError with outstanding task details when active tasks remain open', async () => {
    const dueDate = new Date('2026-06-30T08:00:00Z');
    mockProjectFindById.mockResolvedValue({
      _id: projectId,
      status: 'IN_PROGRESS',
      save: mockProjectSave,
    });
    mockTaskFind.mockImplementation(() => taskFindResult([
      {
        _id: { toString: () => 'task-1' },
        title: 'Finish commissioning checklist',
        status: 'ON_HOLD',
        assigneeId: { toString: () => 'assignee-1' },
        dueDate,
      },
    ]));

    await expect(
      statusService.transitionStatus(projectId, 'COMPLETED', {}, userId),
    ).rejects.toMatchObject({
      message: expect.stringContaining('1 task(s) are still open'),
      data: {
        outstandingTasks: [
          {
            id: 'task-1',
            title: 'Finish commissioning checklist',
            status: 'ON_HOLD',
            assigneeId: 'assignee-1',
            dueDate,
          },
        ],
      },
    });
  });
});
