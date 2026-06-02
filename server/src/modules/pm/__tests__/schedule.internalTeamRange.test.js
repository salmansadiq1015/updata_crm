import { jest, describe, it, beforeAll, afterEach, expect } from '@jest/globals';

// Mock scheduleRepository — only the methods schedule.service.js touches.
const mockFindInternalTeamEntriesInRange = jest.fn();

jest.unstable_mockModule('../schedule.repository.js', () => ({
  default: {
    findInternalTeamEntriesInRange: mockFindInternalTeamEntriesInRange,
    findByProjectId: jest.fn(),
    findConfirmationsByEntryIds: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    updateById: jest.fn(),
    softDelete: jest.fn(),
    findDependents: jest.fn(),
    createConfirmation: jest.fn(),
    findConfirmationById: jest.fn(),
    updateConfirmationById: jest.fn(),
  },
}));

// getOrSet just invokes the producer fn
jest.unstable_mockModule('../../../shared/cache/CacheManager.js', () => ({
  default: {
    getOrSet: jest.fn(async (_key, producer) => producer()),
    del: jest.fn(),
    invalidatePattern: jest.fn(),
  },
}));

jest.unstable_mockModule('../../auth/audit.service.js', () => ({
  default: { logEvent: jest.fn() },
}));

jest.unstable_mockModule('../../../shared/events/EventBus.js', () => ({
  default: { publish: jest.fn() },
}));

jest.unstable_mockModule('../../../shared/events/eventTypes.js', () => ({
  default: {
    SCHEDULE_ENTRY_CREATED: 'schedule_entry.created',
    SCHEDULE_ENTRY_UPDATED: 'schedule_entry.updated',
    SCHEDULE_ENTRY_DELETED: 'schedule_entry.deleted',
    SCHEDULE_ENTRIES_CASCADED: 'schedule_entries.cascaded',
    PARTNER_CONFIRMATION_SENT: 'partner_confirmation.sent',
    PARTNER_CONFIRMATION_RESPONSE: 'partner_confirmation.response',
  },
}));

jest.unstable_mockModule('../../../shared/queue/QueueManager.js', () => ({
  default: { addJob: jest.fn() },
}));

jest.unstable_mockModule('../project.model.js', () => ({
  default: { findById: jest.fn() },
}));

jest.unstable_mockModule('../../../config/index.js', () => ({
  default: { redis: { keyPrefix: 'test:' }, pm: { scheduleConfirmationLeadDays: 5 } },
}));

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

describe('findInternalTeamEntriesInRange', () => {
  const from = new Date('2026-06-01T00:00:00Z');
  const to = new Date('2026-06-30T23:59:59Z');

  it('passes Date bounds + userIds through to the repository', async () => {
    mockFindInternalTeamEntriesInRange.mockResolvedValue([]);

    await scheduleService.findInternalTeamEntriesInRange(
      '2026-06-01T00:00:00Z',
      to,
      ['user-1', 'user-2'],
    );

    expect(mockFindInternalTeamEntriesInRange).toHaveBeenCalledTimes(1);
    const args = mockFindInternalTeamEntriesInRange.mock.calls[0];
    expect(args[0]).toBeInstanceOf(Date);
    expect(args[0].getTime()).toBe(from.getTime());
    expect(args[1]).toBe(to);
    expect(args[2]).toEqual(['user-1', 'user-2']);
  });

  it('maps a PHASE entry into the deploy read-only item shape', async () => {
    mockFindInternalTeamEntriesInRange.mockResolvedValue([
      {
        _id: 'entry-phase',
        name: 'Rohinstallation',
        entryType: 'PHASE',
        startDate: new Date('2026-06-10T00:00:00Z'),
        endDate: new Date('2026-06-15T00:00:00Z'),
        status: 'PLANNED',
        responsibleTeamId: { _id: 'user-99', firstName: 'Hans', lastName: 'Muster' },
        projectId: { _id: 'proj-1', name: 'Spital Bern', projectNumber: 'P-2026-001' },
      },
    ]);

    const [item] = await scheduleService.findInternalTeamEntriesInRange(from, to);

    expect(item).toMatchObject({
      _id: 'entry-phase',
      source: 'pm_schedule',
      readOnly: true,
      employeeId: 'user-99',
      employeeName: 'Hans Muster',
      title: 'Rohinstallation · P-2026-001',
      isFullDay: true,
      status: 'PLANNED',
      entryType: 'PHASE',
      assignmentType: 'PROJECT_WORK',
      projectId: 'proj-1',
      projectNumber: 'P-2026-001',
      projectName: 'Spital Bern',
    });
    expect(new Date(item.startDatetime).getTime()).toBe(new Date('2026-06-10T00:00:00Z').getTime());
    expect(new Date(item.endDatetime).getTime()).toBe(new Date('2026-06-15T00:00:00Z').getTime());
  });

  it('maps a MILESTONE entry as a single-day item (start === end)', async () => {
    mockFindInternalTeamEntriesInRange.mockResolvedValue([
      {
        _id: 'entry-ms',
        name: 'Abnahme',
        entryType: 'MILESTONE',
        milestoneDate: new Date('2026-06-20T00:00:00Z'),
        status: 'PLANNED',
        responsibleTeamId: 'user-77',
        projectId: 'proj-2',
      },
    ]);

    const [item] = await scheduleService.findInternalTeamEntriesInRange(from, to);

    expect(item.source).toBe('pm_schedule');
    expect(item.entryType).toBe('MILESTONE');
    expect(item.employeeId).toBe('user-77');
    // No populated project → title is just the entry name.
    expect(item.title).toBe('Abnahme');
    expect(item.projectId).toBe('proj-2');
    expect(new Date(item.startDatetime).getTime()).toBe(new Date(item.endDatetime).getTime());
  });

  it('returns an empty array when the repository finds nothing', async () => {
    mockFindInternalTeamEntriesInRange.mockResolvedValue([]);
    const result = await scheduleService.findInternalTeamEntriesInRange(from, to);
    expect(result).toEqual([]);
  });
});
