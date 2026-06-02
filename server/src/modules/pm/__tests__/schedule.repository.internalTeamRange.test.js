import { jest, describe, it, beforeAll, afterEach, expect } from '@jest/globals';

// Capture the filter passed to ScheduleEntry.find(...) and return a chainable
// query stub (populate → populate → sort → lean).
let capturedFilter = null;
const leanResult = [{ _id: 'x' }];

const makeChain = () => {
  const chain = {};
  chain.populate = jest.fn(() => chain);
  chain.sort = jest.fn(() => chain);
  chain.lean = jest.fn(async () => leanResult);
  return chain;
};

const mockFind = jest.fn((filter) => {
  capturedFilter = filter;
  return makeChain();
});

jest.unstable_mockModule('../scheduleEntry.model.js', () => ({
  default: { find: mockFind },
  ENTRY_TYPES: ['PHASE', 'MILESTONE'],
  RESPONSIBLE_TYPES: ['INTERNAL_TEAM', 'PARTNER_COMPANY'],
  ENTRY_STATUSES: ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'WAIVED'],
}));

jest.unstable_mockModule('../partnerConfirmation.model.js', () => ({
  default: {},
}));

let scheduleRepository;

beforeAll(async () => {
  const mod = await import('../schedule.repository.js');
  scheduleRepository = mod.default;
});

afterEach(() => {
  jest.clearAllMocks();
  capturedFilter = null;
});

describe('scheduleRepository.findInternalTeamEntriesInRange', () => {
  const from = new Date('2026-06-01T00:00:00Z');
  const to = new Date('2026-06-30T00:00:00Z');

  it('filters to INTERNAL_TEAM, non-null team, non-cancelled, within range', async () => {
    await scheduleRepository.findInternalTeamEntriesInRange(from, to);

    expect(mockFind).toHaveBeenCalledTimes(1);
    expect(capturedFilter.responsibleType).toBe('INTERNAL_TEAM');
    expect(capturedFilter.isDeleted).toBe(false);
    expect(capturedFilter.status).toEqual({ $ne: 'CANCELLED' });
    // responsibleTeamId must be non-null (no userIds restriction here)
    expect(capturedFilter.responsibleTeamId).toEqual({ $ne: null });

    // Range intersection: PHASE branch + MILESTONE branch under $or
    expect(Array.isArray(capturedFilter.$or)).toBe(true);
    const phase = capturedFilter.$or.find((c) => c.entryType === 'PHASE');
    const milestone = capturedFilter.$or.find((c) => c.entryType === 'MILESTONE');
    expect(phase.startDate).toEqual({ $lt: to });
    expect(phase.endDate).toEqual({ $gt: from });
    expect(milestone.milestoneDate).toEqual({ $gte: from, $lte: to });
  });

  it('restricts to the given userIds when provided', async () => {
    await scheduleRepository.findInternalTeamEntriesInRange(from, to, ['u1', 'u2']);
    expect(capturedFilter.responsibleTeamId).toEqual({ $in: ['u1', 'u2'] });
  });

  it('excludes partner-responsibility entries (never relaxes responsibleType)', async () => {
    await scheduleRepository.findInternalTeamEntriesInRange(from, to, ['u1']);
    // Even with a userId restriction, responsibleType stays INTERNAL_TEAM.
    expect(capturedFilter.responsibleType).toBe('INTERNAL_TEAM');
  });
});
