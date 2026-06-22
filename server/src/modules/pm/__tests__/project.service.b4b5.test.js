import { jest, describe, it, beforeAll, afterEach, expect } from '@jest/globals';

// ── Mocks must be hoisted before any dynamic import of the module under test ──

// mock projectRepository
const mockProjectRepo = {
  findById: jest.fn(),
  create: jest.fn(),
  countByStatus: jest.fn(),
  countByType: jest.fn(),
  getBudgetSummary: jest.fn(),
  findUpcomingMilestones: jest.fn(),
};
jest.unstable_mockModule('../project.repository.js', () => ({ default: mockProjectRepo }));

// mock crm/customer.model (lazily imported by _resolveCustomerName)
jest.unstable_mockModule('../../crm/customer.model.js', () => ({
  default: { findById: jest.fn(() => ({ select: () => ({ lean: async () => ({ name: 'Acme AG' }) }) })) },
}));

// mock counterService
jest.unstable_mockModule('../counter.service.js', () => ({
  default: { getNextProjectNumber: jest.fn().mockResolvedValue('P-999') },
}));

// mock cacheManager — getOrSet just calls the producer
const mockGetOrSet = jest.fn(async (_key, producer) => producer());
jest.unstable_mockModule('../../../shared/cache/CacheManager.js', () => ({
  default: { getOrSet: mockGetOrSet, del: jest.fn(), invalidatePattern: jest.fn() },
}));

// mock eventBus
jest.unstable_mockModule('../../../shared/events/EventBus.js', () => ({
  default: { publish: jest.fn() },
}));

// mock EVENT_TYPES
jest.unstable_mockModule('../../../shared/events/eventTypes.js', () => ({
  default: {
    PROJECT_CREATED: 'PROJECT_CREATED',
    PROJECT_DUPLICATED: 'PROJECT_DUPLICATED',
    PROJECT_UPDATED: 'PROJECT_UPDATED',
    PROJECT_DELETED: 'PROJECT_DELETED',
    PROJECT_ARCHIVED: 'PROJECT_ARCHIVED',
    PROJECT_STATUS_CHANGED: 'PROJECT_STATUS_CHANGED',
  },
}));

// mock auditService
jest.unstable_mockModule('../../auth/audit.service.js', () => ({
  default: { logEvent: jest.fn() },
}));

// mock config
jest.unstable_mockModule('../../../config/index.js', () => ({
  default: { redis: { keyPrefix: 'test:' } },
}));

// mock logger
jest.unstable_mockModule('../../../shared/logger/index.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// mock schedule.repository (used inside createFromTemplate)
const mockScheduleRepo = {
  findByProjectId: jest.fn().mockResolvedValue([]),
  create: jest.fn(),
};
jest.unstable_mockModule('../schedule.repository.js', () => ({ default: mockScheduleRepo }));

// mock prepAction.repository (used inside createFromTemplate)
const mockPrepActionRepo = {
  findByProjectId: jest.fn(),
  create: jest.fn(),
};
jest.unstable_mockModule('../prepAction.repository.js', () => ({ default: mockPrepActionRepo }));

// mock project.model (used inside getDashboardSummary + _checkNameUniqueness)
const mockProjectModel = {
  countDocuments: jest.fn(),
  findOne: jest.fn(() => ({ lean: async () => null })),
};
jest.unstable_mockModule('../project.model.js', () => ({ default: mockProjectModel }));

// mock scheduleEntry.model (used inside getDashboardSummary for upcomingMilestones)
const mockScheduleEntryModel = {
  countDocuments: jest.fn(),
};
jest.unstable_mockModule('../scheduleEntry.model.js', () => ({ default: mockScheduleEntryModel }));

const mockTaskFind = jest.fn(() => ({
  sort: jest.fn().mockReturnValue({
    lean: jest.fn().mockResolvedValue([]),
  }),
}));
jest.unstable_mockModule('../../tasks/task.model.js', () => ({
  default: { find: mockTaskFind },
}));

const mockTaskCreate = jest.fn();
const mockTaskCreateSubtask = jest.fn();
jest.unstable_mockModule('../../tasks/task.service.js', () => ({
  default: {
    create: mockTaskCreate,
    createSubtask: mockTaskCreateSubtask,
  },
}));

// ─────────────────────────────────────────────────────────────────────────────

let projectService;

beforeAll(async () => {
  const mod = await import('../project.service.js');
  projectService = mod.default;
});

afterEach(() => {
  jest.clearAllMocks();
});

// ─── B4: createFromTemplate copies prep-actions with correct fields ───────────

describe('B4 — createFromTemplate: prep-action field mapping', () => {
  const templateId = 'tmpl-001';
  const createdBy = 'user-abc';

  const fakeTemplate = {
    _id: templateId,
    name: 'Template A',
    description: 'Desc',
    projectType: 'HVAC_BOILER',
    plannedStartDate: null,
    customerId: { _id: 'cust-1' },
    projectManagerId: { _id: 'pm-1' },
    estimatedBudget: 10000,
    currency: 'CHF',
    notes: null,
    templateId: null,
  };

  const fakeNewProject = { _id: 'new-proj-001' };

  const templateActions = [
    {
      _id: 'act-1',
      actionType: 'FUNDING_APPLICATION',
      title: 'Apply for subsidy',
      description: 'Fill out the form',
      isMandatory: true,
      status: 'CREATED',
    },
    {
      _id: 'act-2',
      actionType: 'MATERIAL_ORDER',
      title: 'Order pipes',
      description: null,
      isMandatory: false,
      status: 'CREATED',
    },
  ];

  beforeAll(() => {
    mockProjectRepo.findById.mockResolvedValue(fakeTemplate);
    mockProjectRepo.create.mockResolvedValue(fakeNewProject);
    mockProjectRepo.findById.mockImplementation((id) => {
      if (id === templateId) return Promise.resolve(fakeTemplate);
      return Promise.resolve(fakeNewProject);
    });
    mockPrepActionRepo.findByProjectId.mockResolvedValue(templateActions);
    mockPrepActionRepo.create.mockResolvedValue({});
    mockScheduleRepo.findByProjectId.mockResolvedValue([]);
  });

  it('calls prepActionRepository.create once per template action', async () => {
    await projectService.createFromTemplate(templateId, { name: 'New Project' }, createdBy);
    expect(mockPrepActionRepo.create).toHaveBeenCalledTimes(2);
  });

  it('maps title (not name) from template action', async () => {
    await projectService.createFromTemplate(templateId, { name: 'New Project' }, createdBy);
    const calls = mockPrepActionRepo.create.mock.calls;
    expect(calls[0][0].title).toBe('Apply for subsidy');
    expect(calls[1][0].title).toBe('Order pipes');
    // must NOT use the (non-existent) name field
    expect(calls[0][0].name).toBeUndefined();
    expect(calls[1][0].name).toBeUndefined();
  });

  it('maps isMandatory from template action', async () => {
    await projectService.createFromTemplate(templateId, { name: 'New Project' }, createdBy);
    const calls = mockPrepActionRepo.create.mock.calls;
    expect(calls[0][0].isMandatory).toBe(true);
    expect(calls[1][0].isMandatory).toBe(false);
  });

  it('sets dueDate to null on the new action', async () => {
    await projectService.createFromTemplate(templateId, { name: 'New Project' }, createdBy);
    const calls = mockPrepActionRepo.create.mock.calls;
    expect(calls[0][0].dueDate).toBeNull();
    expect(calls[1][0].dueDate).toBeNull();
  });

  it('does NOT carry over sortOrder (non-existent field)', async () => {
    await projectService.createFromTemplate(templateId, { name: 'New Project' }, createdBy);
    const calls = mockPrepActionRepo.create.mock.calls;
    expect(calls[0][0].sortOrder).toBeUndefined();
  });

  it('sets projectId to the new project id', async () => {
    await projectService.createFromTemplate(templateId, { name: 'New Project' }, createdBy);
    const calls = mockPrepActionRepo.create.mock.calls;
    expect(calls[0][0].projectId).toBe(fakeNewProject._id);
    expect(calls[1][0].projectId).toBe(fakeNewProject._id);
  });

  it('clones template tasks into the new project and preserves hierarchy', async () => {
    mockTaskFind.mockReturnValueOnce({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            _id: 'task-root',
            title: 'Root task',
            description: 'Prepare',
            priority: 'HIGH',
            assigneeId: 'user-7',
            sortOrder: 0,
            parentTaskId: null,
          },
          {
            _id: 'task-child',
            title: 'Child task',
            description: null,
            priority: 'LOW',
            assigneeId: null,
            sortOrder: 1,
            parentTaskId: 'task-root',
          },
        ]),
      }),
    });
    mockTaskCreate.mockResolvedValueOnce({ _id: 'cloned-root' });
    mockTaskCreateSubtask.mockResolvedValueOnce({ _id: 'cloned-child' });

    await projectService.createFromTemplate(templateId, { name: 'New Project' }, createdBy);

    expect(mockTaskCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Root task',
        description: 'Prepare',
        status: 'OPEN',
        priority: 'HIGH',
        projectId: fakeNewProject._id,
        assigneeId: 'user-7',
        sortOrder: 0,
      }),
      createdBy,
      expect.any(Object),
    );
    expect(mockTaskCreateSubtask).toHaveBeenCalledWith(
      'cloned-root',
      expect.objectContaining({
        title: 'Child task',
        status: 'OPEN',
        priority: 'LOW',
        projectId: fakeNewProject._id,
        assigneeId: null,
        sortOrder: 1,
      }),
      createdBy,
      expect.any(Object),
    );
  });
});

// ─── B5: getDashboardSummary returns upcomingMilestones ───────────────────────

describe('B5 — getDashboardSummary: upcomingMilestones top-level field', () => {
  beforeAll(() => {
    mockProjectRepo.countByStatus.mockResolvedValue([{ status: 'IN_PROGRESS', count: 3 }]);
    mockProjectRepo.countByType.mockResolvedValue([{ projectType: 'HVAC_BOILER', count: 3 }]);
    mockProjectRepo.getBudgetSummary.mockResolvedValue({ estimatedBudgetTotal: 50000, budgetedProjects: 2 });
    // overdue, startingSoon, endingSoon, upcomingMilestones
    mockProjectModel.countDocuments
      .mockResolvedValueOnce(2)   // overdue
      .mockResolvedValueOnce(1)   // startingSoon
      .mockResolvedValueOnce(0);  // endingSoon
    mockScheduleEntryModel.countDocuments.mockResolvedValue(5);
  });

  it('returns upcomingMilestones as a top-level numeric field', async () => {
    const summary = await projectService.getDashboardSummary();
    expect(summary).toHaveProperty('upcomingMilestones');
    expect(typeof summary.upcomingMilestones).toBe('number');
    expect(summary.upcomingMilestones).toBe(5);
  });

  it('still returns risk.overdue (not moved)', async () => {
    // reset and re-run
    jest.clearAllMocks();
    mockProjectRepo.countByStatus.mockResolvedValue([]);
    mockProjectRepo.countByType.mockResolvedValue([]);
    mockProjectRepo.getBudgetSummary.mockResolvedValue({ estimatedBudgetTotal: 0, budgetedProjects: 0 });
    mockProjectModel.countDocuments
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    mockScheduleEntryModel.countDocuments.mockResolvedValue(7);

    const summary = await projectService.getDashboardSummary();
    expect(summary.risk.overdue).toBe(4);
    expect(summary.upcomingMilestones).toBe(7);
  });
});

// ─── PROJ-007 AC-3 — denormalized customerName on create ──────────────────────
describe('create — denormalized customerName (PROJ-007 AC-3)', () => {
  it('resolves and stores the customer name for alphabetical sort', async () => {
    mockProjectRepo.findById.mockResolvedValue(null); // name-uniqueness check passes
    mockProjectRepo.create.mockResolvedValue({ _id: 'p-new' });

    await projectService.create(
      { name: 'New Build', customerId: 'cust-9', projectType: 'HVAC_BOILER', projectManagerId: 'pm-9' },
      'user-1',
      {},
    );

    const createArg = mockProjectRepo.create.mock.calls[0][0];
    expect(createArg.customerName).toBe('Acme AG');
  });
});
