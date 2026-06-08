import { jest, describe, it, beforeAll, afterEach, expect } from '@jest/globals';

const mockProjectRepo = { findById: jest.fn() };
jest.unstable_mockModule('../project.repository.js', () => ({ default: mockProjectRepo }));

jest.unstable_mockModule('../counter.service.js', () => ({ default: { getNextProjectNumber: jest.fn() } }));
jest.unstable_mockModule('../../../shared/cache/CacheManager.js', () => ({
  default: { getOrSet: jest.fn(async (_k, p) => p()), del: jest.fn(), invalidatePattern: jest.fn() },
}));
jest.unstable_mockModule('../../../shared/events/EventBus.js', () => ({ default: { publish: jest.fn() } }));
jest.unstable_mockModule('../../../shared/events/eventTypes.js', () => ({ default: {} }));

const mockQueryByEntity = jest.fn();
jest.unstable_mockModule('../../auth/audit.service.js', () => ({
  default: { logEvent: jest.fn(), queryByEntity: mockQueryByEntity },
}));

// User model (lazily imported to resolve actor names)
const mockUserFind = jest.fn();
jest.unstable_mockModule('../../auth/user.model.js', () => ({
  default: { find: mockUserFind },
}));
jest.unstable_mockModule('../../../config/index.js', () => ({ default: { redis: { keyPrefix: 'test:' } } }));
jest.unstable_mockModule('../../../shared/logger/index.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

let projectService;

beforeAll(async () => {
  projectService = (await import('../project.service.js')).default;
});

afterEach(() => jest.clearAllMocks());

describe('projectService.getActivity (PROJ-005 AC-6)', () => {
  it('returns the audit timeline scoped to the project, with resolved actor names', async () => {
    mockProjectRepo.findById.mockResolvedValue({ _id: 'p1', projectNumber: 'PRJ-1' });
    mockQueryByEntity.mockResolvedValue([
      { eventType: 'project_document.generated', userId: 'u1', timestamp: new Date() },
    ]);
    mockUserFind.mockReturnValue({
      select: () => ({ lean: async () => [{ _id: 'u1', firstName: 'Anna', lastName: 'Meier' }] }),
    });

    const result = await projectService.getActivity('p1');

    expect(mockQueryByEntity).toHaveBeenCalledTimes(1);
    const arg = mockQueryByEntity.mock.calls[0][0];
    expect(arg).toMatchObject({ module: 'pm', detailsKey: 'projectId' });
    // entityId includes the string project id (and/or its ObjectId form)
    expect(arg.entityId.map(String)).toContain('p1');
    expect(result).toHaveLength(1);
    // actor name resolved from the user model
    expect(result[0].userName).toBe('Anna Meier');
  });

  it('throws NotFound when the project does not exist', async () => {
    mockProjectRepo.findById.mockResolvedValue(null);
    const { NotFoundError } = await import('../../../shared/errors/AppError.js');
    await expect(projectService.getActivity('missing')).rejects.toBeInstanceOf(NotFoundError);
  });
});
