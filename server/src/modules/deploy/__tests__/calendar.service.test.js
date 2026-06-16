import { jest, describe, it, beforeAll, beforeEach, expect } from '@jest/globals';

const mockGetOrSet = jest.fn();
const mockFindByDateRange = jest.fn();
const mockFindByEmployeesAndDateRange = jest.fn();
const mockFindByWeekRange = jest.fn();
const mockFindInternalTeamEntriesInRange = jest.fn();
const mockUserFind = jest.fn();

function queryStub(value) {
  const stub = {
    select: jest.fn(),
    sort: jest.fn(),
    limit: jest.fn(),
    lean: jest.fn(),
  };
  stub.select.mockReturnValue(stub);
  stub.sort.mockReturnValue(stub);
  stub.limit.mockReturnValue(stub);
  stub.lean.mockResolvedValue(value);
  return stub;
}

jest.unstable_mockModule('../../../shared/cache/CacheManager.js', () => ({
  default: {
    getOrSet: mockGetOrSet,
  },
}));

jest.unstable_mockModule('../../../shared/logger/index.js', () => ({
  default: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

jest.unstable_mockModule('../assignment.repository.js', () => ({
  default: { findByDateRange: mockFindByDateRange },
}));

jest.unstable_mockModule('../availability.repository.js', () => ({
  default: { findByEmployeesAndDateRange: mockFindByEmployeesAndDateRange },
}));

jest.unstable_mockModule('../coarse.repository.js', () => ({
  default: { findByWeekRange: mockFindByWeekRange },
}));

jest.unstable_mockModule('../../pm/schedule.service.js', () => ({
  default: { findInternalTeamEntriesInRange: mockFindInternalTeamEntriesInRange },
}));

jest.unstable_mockModule('../../auth/user.model.js', () => ({
  default: { find: mockUserFind },
}));

let calendarService;

beforeAll(async () => {
  const mod = await import('../calendar.service.js');
  calendarService = mod.default;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetOrSet.mockImplementation((_key, loader) => loader());
  mockFindByDateRange.mockResolvedValue([]);
  mockFindByEmployeesAndDateRange.mockResolvedValue([]);
  mockFindByWeekRange.mockResolvedValue([]);
  mockFindInternalTeamEntriesInRange.mockResolvedValue([]);
});

describe('calendarService.getCalendarData availability loading', () => {
  it('loads availability for visible employees when no employee filter is active', async () => {
    const employeeId = '665f1d5f0f1d5f0f1d5f0001';
    mockUserFind.mockReturnValue(queryStub([
      {
        _id: employeeId,
        firstName: 'Hans',
        lastName: 'Mueller',
      },
    ]));
    mockFindByEmployeesAndDateRange.mockResolvedValue([
      {
        employeeId,
        date: new Date('2026-06-01T00:00:00.000Z'),
        availabilityType: 'VACATION',
      },
    ]);

    const result = await calendarService.getCalendarData(
      '2026-06-01T08:00:00.000Z',
      '2026-06-01T12:00:00.000Z',
      {},
    );

    const expectedStart = new Date('2026-06-01T08:00:00.000Z');
    expectedStart.setHours(0, 0, 0, 0);
    const expectedEnd = new Date('2026-06-01T12:00:00.000Z');
    expectedEnd.setHours(23, 59, 59, 999);

    expect(mockFindByEmployeesAndDateRange).toHaveBeenCalledWith(
      [employeeId],
      expectedStart,
      expectedEnd,
    );
    expect(result[0].availability).toEqual([
      expect.objectContaining({ availabilityType: 'VACATION' }),
    ]);
  });
});
