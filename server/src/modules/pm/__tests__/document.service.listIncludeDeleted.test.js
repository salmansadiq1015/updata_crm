import { jest, describe, it, beforeAll, afterEach, expect } from '@jest/globals';

// --- Mock document.repository ---
const mockFindByProjectId = jest.fn();
jest.unstable_mockModule('../document.repository.js', () => ({
  default: {
    findByProjectId: mockFindByProjectId,
    findById: jest.fn(),
  },
}));

// --- Mock cacheManager (pass-through producer) ---
const mockGetOrSet = jest.fn(async (_k, producer) => producer());
jest.unstable_mockModule('../../../shared/cache/CacheManager.js', () => ({
  default: { getOrSet: mockGetOrSet, del: jest.fn(), invalidatePattern: jest.fn() },
}));

// --- Mock peripheral deps so the module loads ---
jest.unstable_mockModule('../../auth/audit.service.js', () => ({
  default: { logEvent: jest.fn(), queryByEntity: jest.fn() },
}));
jest.unstable_mockModule('../../../shared/events/EventBus.js', () => ({
  default: { publish: jest.fn() },
}));
jest.unstable_mockModule('../../../shared/events/eventTypes.js', () => ({ default: {} }));
jest.unstable_mockModule('../../../config/index.js', () => ({
  default: { redis: { keyPrefix: 'test:' } },
}));
jest.unstable_mockModule('../../../shared/logger/index.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

let documentService;

beforeAll(async () => {
  documentService = (await import('../document.service.js')).default;
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('documentService.listByProject — includeDeleted (PROJ-006 AC-6)', () => {
  it('passes includeDeleted through to the repository when requested', async () => {
    mockFindByProjectId.mockResolvedValue([]);

    await documentService.listByProject('project-1', { includeDeleted: true });

    expect(mockFindByProjectId).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({ includeDeleted: true }),
    );
  });

  it('uses a distinct cache key when includeDeleted differs', async () => {
    mockFindByProjectId.mockResolvedValue([]);

    await documentService.listByProject('project-1', {});
    await documentService.listByProject('project-1', { includeDeleted: true });

    const keyActive = mockGetOrSet.mock.calls[0][0];
    const keyDeleted = mockGetOrSet.mock.calls[1][0];
    expect(keyActive).not.toEqual(keyDeleted);
  });
});
