import { jest, describe, it, beforeAll, afterEach, expect } from '@jest/globals';

// Mock scheduleRepository
const mockFindByProjectId = jest.fn();
const mockFindConfirmationsByEntry = jest.fn();
const mockFindConfirmationsByEntryIds = jest.fn();
const mockFindById = jest.fn();
const mockCreate = jest.fn();
const mockUpdateById = jest.fn();
const mockSoftDelete = jest.fn();
const mockFindDependents = jest.fn();
const mockCreateConfirmation = jest.fn();
const mockFindConfirmationById = jest.fn();
const mockUpdateConfirmationById = jest.fn();

jest.unstable_mockModule('../schedule.repository.js', () => ({
  default: {
    findByProjectId: mockFindByProjectId,
    findConfirmationsByEntry: mockFindConfirmationsByEntry,
    findConfirmationsByEntryIds: mockFindConfirmationsByEntryIds,
    findById: mockFindById,
    create: mockCreate,
    updateById: mockUpdateById,
    softDelete: mockSoftDelete,
    findDependents: mockFindDependents,
    createConfirmation: mockCreateConfirmation,
    findConfirmationById: mockFindConfirmationById,
    updateConfirmationById: mockUpdateConfirmationById,
  },
}));

// Mock cacheManager — getOrSet just invokes the producer fn
const mockGetOrSet = jest.fn(async (_key, producer, _ttl) => producer());
const mockDel = jest.fn();
const mockInvalidatePattern = jest.fn();

jest.unstable_mockModule('../../../shared/cache/CacheManager.js', () => ({
  default: {
    getOrSet: mockGetOrSet,
    del: mockDel,
    invalidatePattern: mockInvalidatePattern,
  },
}));

// Mock auditService
// schedule.service.js (in pm/) imports '../auth/audit.service.js'
// From __tests__/ that resolves to '../../auth/audit.service.js'
jest.unstable_mockModule('../../auth/audit.service.js', () => ({
  default: { logEvent: jest.fn() },
}));

// Mock eventBus
jest.unstable_mockModule('../../../shared/events/EventBus.js', () => ({
  default: { publish: jest.fn() },
}));

// Mock EVENT_TYPES
jest.unstable_mockModule('../../../shared/events/eventTypes.js', () => ({
  default: {
    SCHEDULE_ENTRY_CREATED: 'SCHEDULE_ENTRY_CREATED',
    SCHEDULE_ENTRY_UPDATED: 'SCHEDULE_ENTRY_UPDATED',
    SCHEDULE_ENTRY_DELETED: 'SCHEDULE_ENTRY_DELETED',
    SCHEDULE_ENTRIES_CASCADED: 'SCHEDULE_ENTRIES_CASCADED',
    PARTNER_CONFIRMATION_SENT: 'PARTNER_CONFIRMATION_SENT',
    PARTNER_CONFIRMATION_RESPONSE: 'PARTNER_CONFIRMATION_RESPONSE',
  },
}));

// Mock queueManager
jest.unstable_mockModule('../../../shared/queue/QueueManager.js', () => ({
  default: { addJob: jest.fn() },
}));

// Mock config
jest.unstable_mockModule('../../../config/index.js', () => ({
  default: { redis: { keyPrefix: 'test:' } },
}));

// Mock logger
jest.unstable_mockModule('../../../shared/logger/index.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

let scheduleService;

beforeAll(async () => {
  const mod = await import('../schedule.service.js');
  scheduleService = mod.default;
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('getSchedule', () => {
  it('returns entries each with a populated confirmations array', async () => {
    const entries = [
      { _id: 'entry-1', name: 'Phase 1', projectId: 'proj-abc' },
      { _id: 'entry-2', name: 'Milestone A', projectId: 'proj-abc' },
    ];
    const confirmation = {
      _id: 'conf-1',
      scheduleEntryId: 'entry-1',
      confirmationStatus: 'CONFIRMED',
    };

    mockFindByProjectId.mockResolvedValue(entries);
    // Batched lookup returns all confirmations across the project's entries.
    mockFindConfirmationsByEntryIds.mockResolvedValue([confirmation]);

    const result = await scheduleService.getSchedule('proj-abc');

    expect(mockFindByProjectId).toHaveBeenCalledWith('proj-abc');
    // Single batched query (no N+1).
    expect(mockFindConfirmationsByEntryIds).toHaveBeenCalledTimes(1);
    expect(mockFindConfirmationsByEntryIds).toHaveBeenCalledWith(['entry-1', 'entry-2']);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ _id: 'entry-1', name: 'Phase 1' });
    expect(result[0].confirmations).toEqual([confirmation]);
    expect(result[1]).toMatchObject({ _id: 'entry-2', name: 'Milestone A' });
    expect(result[1].confirmations).toEqual([]);
  });

  it('returns an empty array when the project has no entries', async () => {
    mockFindByProjectId.mockResolvedValue([]);

    mockFindConfirmationsByEntryIds.mockResolvedValue([]);

    const result = await scheduleService.getSchedule('proj-empty');

    expect(result).toEqual([]);
  });
});
