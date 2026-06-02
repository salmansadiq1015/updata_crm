/**
 * Tests for listProjectsSchema new fields (date-range, includeDeleted)
 * and for project.service list() passing them through to the repository.
 *
 * The repository's findWithCursor itself needs a real DB to test end-to-end,
 * so we test the validation layer plus service-level pass-through here.
 */
import { jest, describe, it, beforeAll, afterEach, expect } from '@jest/globals';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockFindWithCursor = jest.fn();
const mockProjectRepo = {
  findWithCursor: mockFindWithCursor,
  findById: jest.fn(),
  create: jest.fn(),
  countByStatus: jest.fn().mockResolvedValue([]),
  countByType: jest.fn().mockResolvedValue([]),
  getBudgetSummary: jest.fn().mockResolvedValue({ estimatedBudgetTotal: 0, budgetedProjects: 0 }),
  findUpcomingMilestones: jest.fn().mockResolvedValue([]),
};
jest.unstable_mockModule('../project.repository.js', () => ({ default: mockProjectRepo }));

jest.unstable_mockModule('../counter.service.js', () => ({
  default: { getNextProjectNumber: jest.fn().mockResolvedValue('P-001') },
}));

// cache manager — getOrSet just calls the producer
jest.unstable_mockModule('../../../shared/cache/CacheManager.js', () => ({
  default: {
    getOrSet: jest.fn(async (_key, producer) => producer()),
    del: jest.fn(),
    invalidatePattern: jest.fn(),
  },
}));

jest.unstable_mockModule('../../../shared/events/EventBus.js', () => ({
  default: { publish: jest.fn() },
}));
jest.unstable_mockModule('../../../shared/events/eventTypes.js', () => ({
  default: { PROJECT_CREATED: 'PROJECT_CREATED', PROJECT_UPDATED: 'PROJECT_UPDATED' },
}));
jest.unstable_mockModule('../../auth/audit.service.js', () => ({
  default: { logEvent: jest.fn() },
}));
jest.unstable_mockModule('../../../config/index.js', () => ({
  default: { redis: { keyPrefix: 'test:' } },
}));
jest.unstable_mockModule('../../../shared/logger/index.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// ── Test subjects ──────────────────────────────────────────────────────────

let projectService;
let listProjectsSchema;

beforeAll(async () => {
  const svcMod = await import('../project.service.js');
  projectService = svcMod.default;
  const valMod = await import('../project.validation.js');
  listProjectsSchema = valMod.listProjectsSchema;
});

afterEach(() => {
  jest.clearAllMocks();
});

// ── Validation schema tests ────────────────────────────────────────────────

describe('listProjectsSchema — new fields', () => {
  it('accepts valid plannedStartFrom and plannedStartTo ISO dates', () => {
    const { error, value } = listProjectsSchema.query.validate({
      plannedStartFrom: '2025-01-01',
      plannedStartTo: '2025-12-31',
      limit: 25,
    });
    expect(error).toBeUndefined();
    expect(value.plannedStartFrom).toBeDefined();
    expect(value.plannedStartTo).toBeDefined();
  });

  it('accepts includeDeleted: true', () => {
    const { error, value } = listProjectsSchema.query.validate({
      includeDeleted: true,
      limit: 25,
    });
    expect(error).toBeUndefined();
    expect(value.includeDeleted).toBe(true);
  });

  it('defaults includeDeleted to false when absent', () => {
    const { error, value } = listProjectsSchema.query.validate({ limit: 25 });
    expect(error).toBeUndefined();
    expect(value.includeDeleted).toBe(false);
  });

  it('rejects non-ISO plannedStartFrom', () => {
    const { error } = listProjectsSchema.query.validate({
      plannedStartFrom: 'not-a-date',
      limit: 25,
    });
    expect(error).toBeDefined();
  });

  it('accepts projectManagerId and customerId objectId filters', () => {
    const { error } = listProjectsSchema.query.validate({
      projectManagerId: '507f1f77bcf86cd799439011',
      customerId: '507f1f77bcf86cd799439012',
      limit: 25,
    });
    expect(error).toBeUndefined();
  });
});

// ── Service pass-through tests ─────────────────────────────────────────────

describe('projectService.list — passes new params to repository', () => {
  beforeAll(() => {
    mockFindWithCursor.mockResolvedValue({ data: [], pagination: { hasMore: false, cursor: null } });
  });

  it('passes plannedStartFrom and plannedStartTo to findWithCursor', async () => {
    await projectService.list({
      limit: 25,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      plannedStartFrom: '2025-01-01',
      plannedStartTo: '2025-06-30',
    });

    expect(mockFindWithCursor).toHaveBeenCalledWith(
      expect.objectContaining({
        plannedStartFrom: '2025-01-01',
        plannedStartTo: '2025-06-30',
      }),
    );
  });

  it('passes includeDeleted: true to findWithCursor', async () => {
    await projectService.list({
      limit: 25,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      includeDeleted: true,
    });

    expect(mockFindWithCursor).toHaveBeenCalledWith(
      expect.objectContaining({ includeDeleted: true }),
    );
  });

  it('passes sortBy and sortOrder to findWithCursor', async () => {
    await projectService.list({
      limit: 10,
      sortBy: 'name',
      sortOrder: 'asc',
    });

    expect(mockFindWithCursor).toHaveBeenCalledWith(
      expect.objectContaining({ sortBy: 'name', sortOrder: 'asc' }),
    );
  });
});
