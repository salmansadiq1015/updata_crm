import { jest, describe, it, beforeAll, afterEach, expect } from '@jest/globals';

const mockProjectRepo = {
  findById: jest.fn(),
  findByIdWithDeleted: jest.fn(),
  softDelete: jest.fn(),
  restore: jest.fn(),
  archive: jest.fn(),
};
jest.unstable_mockModule('../project.repository.js', () => ({ default: mockProjectRepo }));

jest.unstable_mockModule('../counter.service.js', () => ({
  default: { getNextProjectNumber: jest.fn() },
}));
jest.unstable_mockModule('../../../shared/cache/CacheManager.js', () => ({
  default: { getOrSet: jest.fn(async (_k, p) => p()), del: jest.fn(), invalidatePattern: jest.fn() },
}));
jest.unstable_mockModule('../../../shared/events/EventBus.js', () => ({ default: { publish: jest.fn() } }));
jest.unstable_mockModule('../../../shared/events/eventTypes.js', () => ({
  default: { PROJECT_DELETED: 'PROJECT_DELETED', PROJECT_ARCHIVED: 'PROJECT_ARCHIVED', PROJECT_RESTORED: 'PROJECT_RESTORED' },
}));
jest.unstable_mockModule('../../auth/audit.service.js', () => ({ default: { logEvent: jest.fn() } }));
jest.unstable_mockModule('../../../config/index.js', () => ({ default: { redis: { keyPrefix: 'test:' } } }));
jest.unstable_mockModule('../../../shared/logger/index.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

let projectService;
let ConflictError;

beforeAll(async () => {
  projectService = (await import('../project.service.js')).default;
  ({ ConflictError } = await import('../../../shared/errors/AppError.js'));
});

afterEach(() => jest.clearAllMocks());

describe('projectService.archive (PROJ-001 AC-7)', () => {
  it('archives a non-draft project via repo.archive (status only, not soft-deleted)', async () => {
    mockProjectRepo.findById
      .mockResolvedValueOnce({ _id: 'p1', status: 'IN_PROGRESS', projectNumber: 'PRJ-1' })
      .mockResolvedValueOnce({ _id: 'p1', status: 'ARCHIVED', projectNumber: 'PRJ-1' });
    mockProjectRepo.archive.mockResolvedValue({ _id: 'p1', status: 'ARCHIVED' });

    await projectService.archive('p1', 'user-1', {});

    expect(mockProjectRepo.archive).toHaveBeenCalledWith('p1');
    expect(mockProjectRepo.softDelete).not.toHaveBeenCalled();
  });

  it('rejects archiving an already-archived project', async () => {
    mockProjectRepo.findById.mockResolvedValue({ _id: 'p1', status: 'ARCHIVED' });
    await expect(projectService.archive('p1', 'user-1', {})).rejects.toBeInstanceOf(ConflictError);
    expect(mockProjectRepo.archive).not.toHaveBeenCalled();
  });
});

describe('projectService.restore (PROJ-001 AC-6)', () => {
  it('restores a soft-deleted project via repo.restore', async () => {
    mockProjectRepo.findByIdWithDeleted.mockResolvedValue({ _id: 'p1', status: 'DRAFT', isDeleted: true, projectNumber: 'PRJ-1' });
    mockProjectRepo.findById.mockResolvedValue({ _id: 'p1', status: 'DRAFT', isDeleted: false });
    mockProjectRepo.restore.mockResolvedValue({ _id: 'p1', isDeleted: false });

    await projectService.restore('p1', 'user-1', {});

    expect(mockProjectRepo.restore).toHaveBeenCalledWith('p1');
  });

  it('rejects restoring a project that is not deleted', async () => {
    mockProjectRepo.findByIdWithDeleted.mockResolvedValue({ _id: 'p1', status: 'DRAFT', isDeleted: false });
    await expect(projectService.restore('p1', 'user-1', {})).rejects.toBeInstanceOf(ConflictError);
    expect(mockProjectRepo.restore).not.toHaveBeenCalled();
  });
});
