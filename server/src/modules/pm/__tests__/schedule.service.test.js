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
const mockAddJob = jest.fn();
jest.unstable_mockModule('../../../shared/queue/QueueManager.js', () => ({
  default: { addJob: mockAddJob },
}));

// Mock documentGeneration.service (dynamically imported by sendConfirmation to
// produce the appointment-confirmation PDF — PROJ-004 AC-3)
const mockGenerateDoc = jest.fn(async () => ({ _id: 'gendoc-1', fileId: 'file-1', fileName: 'conf.pdf' }));
jest.unstable_mockModule('../../doctpl/documentGeneration.service.js', () => ({
  default: { generate: mockGenerateDoc },
}));

// Mock project.model.js (dynamically imported inside sendConfirmation)
jest.unstable_mockModule('../project.model.js', () => ({
  default: {
    findById: jest.fn(() => ({
      select: () => ({ lean: async () => ({ name: 'Proj', projectNumber: 'P-1' }) }),
    })),
  },
}));

// Mock config
jest.unstable_mockModule('../../../config/index.js', () => ({
  default: { redis: { keyPrefix: 'test:' }, pm: { scheduleConfirmationLeadDays: 5 } },
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

describe('detectConflicts', () => {
  const day = (s) => new Date(`2026-01-${s}T00:00:00Z`);

  it('flags a predecessor violation (entry starts before predecessor end)', async () => {
    const entries = [
      { _id: 'p1', entryType: 'PHASE', startDate: day('01'), endDate: day('10') },
      { _id: 'p2', entryType: 'PHASE', startDate: day('05'), endDate: day('15'), predecessorId: 'p1' },
    ];
    mockFindByProjectId.mockResolvedValue(entries);

    const { conflicts } = await scheduleService.detectConflicts('proj-1');

    const c = conflicts.find((x) => x.entryId === 'p2');
    expect(c).toBeDefined();
    expect(c.reasons).toContainEqual({ type: 'predecessor_violation', otherEntryId: 'p1' });
  });

  it('flags a resource overlap for the same responsible party', async () => {
    const entries = [
      { _id: 'a', entryType: 'PHASE', startDate: day('01'), endDate: day('10'), partnerCompanyId: 'partner-x' },
      { _id: 'b', entryType: 'PHASE', startDate: day('05'), endDate: day('12'), partnerCompanyId: 'partner-x' },
    ];
    mockFindByProjectId.mockResolvedValue(entries);

    const { conflicts } = await scheduleService.detectConflicts('proj-1');

    const a = conflicts.find((x) => x.entryId === 'a');
    const b = conflicts.find((x) => x.entryId === 'b');
    expect(a.reasons).toContainEqual({ type: 'resource_overlap', otherEntryId: 'b' });
    expect(b.reasons).toContainEqual({ type: 'resource_overlap', otherEntryId: 'a' });
  });

  it('does not flag non-overlapping ranges or different parties', async () => {
    const entries = [
      // back-to-back (strict overlap → no conflict), same predecessor relation valid
      { _id: 'p1', entryType: 'PHASE', startDate: day('01'), endDate: day('05') },
      { _id: 'p2', entryType: 'PHASE', startDate: day('05'), endDate: day('10'), predecessorId: 'p1' },
      // overlapping in time but DIFFERENT responsible parties → no conflict
      { _id: 'r1', entryType: 'PHASE', startDate: day('01'), endDate: day('10'), partnerCompanyId: 'partner-a' },
      { _id: 'r2', entryType: 'PHASE', startDate: day('02'), endDate: day('09'), partnerCompanyId: 'partner-b' },
      { _id: 'r3', entryType: 'PHASE', startDate: day('02'), endDate: day('09'), responsibleTeamId: 'team-c' },
    ];
    mockFindByProjectId.mockResolvedValue(entries);

    const { conflicts } = await scheduleService.detectConflicts('proj-1');

    expect(conflicts).toEqual([]);
  });
});

describe('sendBulkConfirmations', () => {
  const daysFromNow = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d;
  };

  it('returns per-item statuses (sent + short_notice + error) without aborting the batch', async () => {
    // entry-ok: far out → sends; entry-short: tomorrow → short notice; entry-missing: not found → error.
    mockFindById.mockImplementation(async (id) => {
      if (id === 'entry-ok') return { _id: 'entry-ok', projectId: 'proj-1', entryType: 'MILESTONE', milestoneDate: daysFromNow(30), name: 'OK' };
      if (id === 'entry-short') return { _id: 'entry-short', projectId: 'proj-1', entryType: 'MILESTONE', milestoneDate: daysFromNow(1), name: 'Soon' };
      return null; // entry-missing → NotFoundError
    });
    mockCreateConfirmation.mockResolvedValue({ _id: 'conf' });

    const items = [
      { entryId: 'entry-ok', partnerCompanyId: 'p1', partnerContactEmail: 'a@x.com' },
      { entryId: 'entry-short', partnerCompanyId: 'p1', partnerContactEmail: 'b@x.com' },
      { entryId: 'entry-missing', partnerCompanyId: 'p1', partnerContactEmail: 'c@x.com' },
    ];

    const { results, summary } = await scheduleService.sendBulkConfirmations(items, 'user-1');

    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({ entryId: 'entry-ok', status: 'sent' });
    expect(results[1]).toMatchObject({ entryId: 'entry-short', status: 'short_notice', leadDays: 5 });
    expect(results[1].businessDays).toBeDefined();
    expect(results[2]).toMatchObject({ entryId: 'entry-missing', status: 'error' });
    expect(results[2].message).toEqual(expect.any(String));

    expect(summary).toEqual({ sent: 1, shortNotice: 1, error: 1 });
    // Only the successful item enqueued an email — batch was not aborted by the error.
    expect(mockAddJob).toHaveBeenCalledTimes(1);
  });

  it('sends short-notice items when acknowledged', async () => {
    mockFindById.mockResolvedValue({ _id: 'e', projectId: 'proj-1', entryType: 'MILESTONE', milestoneDate: daysFromNow(1), name: 'Soon' });
    mockCreateConfirmation.mockResolvedValue({ _id: 'conf' });

    const { results, summary } = await scheduleService.sendBulkConfirmations(
      [{ entryId: 'e', partnerCompanyId: 'p1', partnerContactEmail: 'a@x.com', acknowledgeShortNotice: true }],
      'user-1',
    );

    expect(results[0]).toMatchObject({ entryId: 'e', status: 'sent' });
    expect(summary).toEqual({ sent: 1, shortNotice: 0, error: 0 });
  });
});

describe('sendConfirmation — configurable lead-time soft warning', () => {
  const daysFromNow = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d;
  };

  const sendData = {
    partnerCompanyId: 'partner-1',
    partnerContactEmail: 'p@example.com',
    partnerName: 'Partner',
  };

  it('throws a shortNotice ConflictError when under the lead-time and not acknowledged', async () => {
    // Milestone tomorrow → ~1 business day, well under the 5-day lead time.
    mockFindById.mockResolvedValue({
      _id: 'entry-1', projectId: 'proj-1', entryType: 'MILESTONE',
      milestoneDate: daysFromNow(1), name: 'Kickoff',
    });

    await expect(
      scheduleService.sendConfirmation('entry-1', sendData, 'user-1'),
    ).rejects.toMatchObject({
      statusCode: 409,
      data: { shortNotice: true, leadDays: 5 },
    });

    // Must not enqueue an email or create a confirmation when blocked.
    expect(mockAddJob).not.toHaveBeenCalled();
    expect(mockCreateConfirmation).not.toHaveBeenCalled();
  });

  it('sends (enqueues email) when under the lead-time but acknowledged', async () => {
    mockFindById.mockResolvedValue({
      _id: 'entry-1', projectId: 'proj-1', entryType: 'MILESTONE',
      milestoneDate: daysFromNow(1), name: 'Kickoff',
    });
    mockCreateConfirmation.mockResolvedValue({ _id: 'conf-1' });

    const result = await scheduleService.sendConfirmation(
      'entry-1', { ...sendData, acknowledgeShortNotice: true }, 'user-1',
    );

    expect(result).toMatchObject({ _id: 'conf-1' });
    expect(mockCreateConfirmation).toHaveBeenCalledTimes(1);
    expect(mockAddJob).toHaveBeenCalledTimes(1);
    expect(mockAddJob).toHaveBeenCalledWith(
      'auth-email', 'send-partner-confirmation', expect.objectContaining({ email: 'p@example.com' }),
    );
  });

  it('sends without acknowledgment when over the lead-time threshold', async () => {
    // Milestone ~30 calendar days out → comfortably over 5 business days.
    mockFindById.mockResolvedValue({
      _id: 'entry-2', projectId: 'proj-1', entryType: 'MILESTONE',
      milestoneDate: daysFromNow(30), name: 'Handover',
    });
    mockCreateConfirmation.mockResolvedValue({ _id: 'conf-2' });

    const result = await scheduleService.sendConfirmation('entry-2', sendData, 'user-1');

    expect(result).toMatchObject({ _id: 'conf-2' });
    expect(mockCreateConfirmation).toHaveBeenCalledTimes(1);
    expect(mockAddJob).toHaveBeenCalledTimes(1);
  });
});
