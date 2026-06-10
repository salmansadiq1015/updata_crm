import { jest, describe, it, beforeAll, beforeEach, expect } from '@jest/globals';

const mockUserFindById = jest.fn();
const mockFindConflicting = jest.fn();
const mockFindByEmployeeAndDateRange = jest.fn();
const mockFindAbsences = jest.fn();
const mockIsAvailable = jest.fn();

function queryStub(value) {
  const stub = { select: jest.fn(), lean: jest.fn() };
  stub.select.mockReturnValue(stub);
  stub.lean.mockResolvedValue(value);
  return stub;
}

jest.unstable_mockModule('../../auth/user.model.js', () => ({
  default: { findById: mockUserFindById },
}));

jest.unstable_mockModule('../assignment.repository.js', () => ({
  default: {
    findConflicting: mockFindConflicting,
    findByEmployeeAndDateRange: mockFindByEmployeeAndDateRange,
  },
}));

jest.unstable_mockModule('../availability.repository.js', () => ({
  default: {
    findAbsences: mockFindAbsences,
    isAvailable: mockIsAvailable,
  },
}));

jest.unstable_mockModule('../../../shared/cache/CacheManager.js', () => ({
  default: { del: jest.fn(), getOrSet: jest.fn() },
}));

jest.unstable_mockModule('../../../shared/events/EventBus.js', () => ({
  default: { publish: jest.fn() },
}));

jest.unstable_mockModule('../../../shared/events/eventTypes.js', () => ({
  default: { SCHEDULE_CONFLICT_DETECTED: 'SCHEDULE_CONFLICT_DETECTED' },
}));

jest.unstable_mockModule('../../auth/audit.service.js', () => ({
  default: { logEvent: jest.fn() },
}));

jest.unstable_mockModule('../../../shared/logger/index.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

let conflictService;

beforeAll(async () => {
  const mod = await import('../conflict.service.js');
  conflictService = mod.default;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockFindConflicting.mockResolvedValue([]);
  mockFindByEmployeeAndDateRange.mockResolvedValue([]);
  mockFindAbsences.mockResolvedValue([]);
  mockIsAvailable.mockResolvedValue(null);
});

describe('conflictService.detectConflicts capability matching', () => {
  it('reports skill and certification gaps as soft conflicts', async () => {
    mockUserFindById.mockReturnValue(queryStub({
      _id: 'employee-1',
      status: 'active',
      schedulingSkills: ['heating'],
      schedulingCertifications: ['suvapro'],
    }));

    const conflicts = await conflictService.detectConflicts(
      'employee-1',
      new Date('2026-06-01T08:00:00.000Z'),
      new Date('2026-06-01T10:00:00.000Z'),
      null,
      {
        requiredSkills: ['heating', 'welding'],
        recommendedSkills: ['solar'],
        requiredCertifications: ['suvapro', 'electrical'],
      },
    );

    expect(conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        conflictType: 'SKILL_MISMATCH',
        severity: 'SOFT',
        description: expect.stringContaining('welding'),
      }),
      expect.objectContaining({
        conflictType: 'CERTIFICATION_MISSING',
        severity: 'SOFT',
        description: expect.stringContaining('electrical'),
      }),
    ]));
  });

  it('does not report capability conflicts when employee capabilities match', async () => {
    mockUserFindById.mockReturnValue(queryStub({
      _id: 'employee-1',
      status: 'active',
      schedulingSkills: ['heating', 'welding'],
      schedulingCertifications: ['suvapro', 'electrical'],
    }));

    const conflicts = await conflictService.detectConflicts(
      'employee-1',
      new Date('2026-06-01T08:00:00.000Z'),
      new Date('2026-06-01T10:00:00.000Z'),
      null,
      {
        requiredSkills: ['HEATING', 'welding'],
        requiredCertifications: ['suvapro', 'Electrical'],
      },
    );

    expect(conflicts).toEqual([]);
  });
});
