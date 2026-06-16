import { jest, describe, it, beforeAll, beforeEach, expect } from '@jest/globals';

const mockUserFind = jest.fn();
const mockFindByDateRange = jest.fn();
const mockFindByEmployeesAndDateRange = jest.fn();

function queryStub(value) {
  const stub = {
    select: jest.fn(),
    populate: jest.fn(),
    sort: jest.fn(),
    limit: jest.fn(),
    lean: jest.fn(),
  };
  stub.select.mockReturnValue(stub);
  stub.populate.mockReturnValue(stub);
  stub.sort.mockReturnValue(stub);
  stub.limit.mockReturnValue(stub);
  stub.lean.mockResolvedValue(value);
  return stub;
}

jest.unstable_mockModule('../../auth/user.model.js', () => ({
  default: { find: mockUserFind },
}));

jest.unstable_mockModule('../assignment.repository.js', () => ({
  default: { findByDateRange: mockFindByDateRange },
}));

jest.unstable_mockModule('../availability.repository.js', () => ({
  default: { findByEmployeesAndDateRange: mockFindByEmployeesAndDateRange },
}));

let employeeService;

beforeAll(async () => {
  const mod = await import('../employee.service.js');
  employeeService = mod.default;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockFindByDateRange.mockResolvedValue([]);
  mockFindByEmployeesAndDateRange.mockResolvedValue([]);
});

describe('deploy employee service', () => {
  it('returns scheduling-aware availability, workload, roles, and qualification warnings', async () => {
    const employeeId = '665f1d5f0f1d5f0f1d5f0001';

    mockUserFind.mockReturnValue(queryStub([
      {
        _id: employeeId,
        firstName: 'Hans',
        lastName: 'Mueller',
        email: 'hans@example.test',
        department: 'Service',
        position: 'Technician',
        role: { name: 'Disponent' },
        schedulingSkills: ['heating'],
        schedulingCertifications: ['suvapro'],
      },
    ]));
    mockFindByDateRange.mockResolvedValue([
      {
        _id: '665f1d5f0f1d5f0f1d5f1001',
        employeeId,
        assignmentNumber: 'ASG-1',
        title: 'Boiler service',
        status: 'PLANNED',
        startDatetime: new Date('2026-06-01T08:30:00.000Z'),
        endDatetime: new Date('2026-06-01T10:00:00.000Z'),
      },
    ]);
    mockFindByEmployeesAndDateRange.mockResolvedValue([
      {
        employeeId,
        date: new Date('2026-06-01T00:00:00.000Z'),
        availabilityType: 'VACATION',
      },
    ]);

    const result = await employeeService.list({
      startDatetime: '2026-06-01T08:00:00.000Z',
      endDatetime: '2026-06-01T12:00:00.000Z',
      requiredSkills: 'heating,welding',
      requiredCertifications: 'suvapro,electrical',
      limit: 80,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({
      _id: employeeId,
      fullName: 'Hans Mueller',
      position: 'Technician',
      department: 'Service',
      roleName: 'Disponent',
    }));
    expect(result[0].availability.status).toBe('UNAVAILABLE');
    expect(result[0].availability.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({ conflictType: 'ABSENCE', severity: 'HARD' }),
      expect.objectContaining({ conflictType: 'DOUBLE_BOOKING', severity: 'SOFT' }),
      expect.objectContaining({ conflictType: 'SKILL_MISMATCH', severity: 'SOFT' }),
      expect.objectContaining({ conflictType: 'CERTIFICATION_MISSING', severity: 'SOFT' }),
    ]));
    expect(result[0].workload).toEqual(expect.objectContaining({
      assignedHours: 1.5,
      assignmentCount: 1,
    }));
  });
});
