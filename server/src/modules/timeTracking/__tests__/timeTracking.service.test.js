import { jest, describe, it, beforeAll, beforeEach, expect } from '@jest/globals';

const mockTimeEntryFind = jest.fn();
const mockTimeEntryService = {
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  release: jest.fn(),
  override: jest.fn(),
};
const mockLeaveFind = jest.fn();
const mockLeaveFindOne = jest.fn();
const mockLeaveFindById = jest.fn();
const mockLeaveCreate = jest.fn();
const mockVacationFind = jest.fn();
const mockVacationFindOneAndUpdate = jest.fn();
const mockAvailabilityFind = jest.fn();
const mockAvailabilityBulkWrite = jest.fn();
const mockAvailabilityDeleteMany = jest.fn();
const mockAssignmentFind = jest.fn();
const mockUserFind = jest.fn();
const mockAuditLogEvent = jest.fn();
const mockEventPublish = jest.fn();
const mockSendNotification = jest.fn();

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

jest.unstable_mockModule('../../mobile/timeEntry.model.js', () => ({
  default: { find: mockTimeEntryFind },
}));

jest.unstable_mockModule('../../mobile/timeEntry.service.js', () => ({
  default: mockTimeEntryService,
}));

jest.unstable_mockModule('../leaveRequest.model.js', () => ({
  default: {
    find: mockLeaveFind,
    findOne: mockLeaveFindOne,
    findById: mockLeaveFindById,
    create: mockLeaveCreate,
  },
}));

jest.unstable_mockModule('../vacationBalance.model.js', () => ({
  default: {
    find: mockVacationFind,
    findOneAndUpdate: mockVacationFindOneAndUpdate,
  },
}));

jest.unstable_mockModule('../../deploy/employeeAvailability.model.js', () => ({
  default: {
    find: mockAvailabilityFind,
    bulkWrite: mockAvailabilityBulkWrite,
    deleteMany: mockAvailabilityDeleteMany,
  },
}));

jest.unstable_mockModule('../../deploy/assignment.model.js', () => ({
  default: { find: mockAssignmentFind },
}));

jest.unstable_mockModule('../../auth/user.model.js', () => ({
  default: { find: mockUserFind },
}));

jest.unstable_mockModule('../../auth/audit.service.js', () => ({
  default: { logEvent: mockAuditLogEvent },
}));

jest.unstable_mockModule('../../../shared/events/EventBus.js', () => ({
  default: { publish: mockEventPublish },
}));

jest.unstable_mockModule('../../../shared/logger/index.js', () => ({
  default: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

jest.unstable_mockModule('../../mobile/notification.service.js', () => ({
  default: { sendNotification: mockSendNotification },
}));

let timeTrackingService;

beforeAll(async () => {
  const mod = await import('../timeTracking.service.js');
  timeTrackingService = mod.default;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockTimeEntryFind.mockReturnValue(queryStub([]));
  mockLeaveFind.mockReturnValue(queryStub([]));
  mockLeaveFindOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
  mockVacationFind.mockReturnValue(queryStub([]));
  mockAvailabilityFind.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
  mockAssignmentFind.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) });
  mockUserFind.mockReturnValue(queryStub([]));
  mockAvailabilityBulkWrite.mockResolvedValue({});
  mockAvailabilityDeleteMany.mockResolvedValue({});
  mockSendNotification.mockResolvedValue({});
});

describe('timeTrackingService workforce overview', () => {
  it('calculates target, actual, overtime, leave counts, and project grouping', async () => {
    const employeeId = '665f1d5f0f1d5f0f1d5f0001';
    const projectId = '665f1d5f0f1d5f0f1d5f1001';
    const customerId = '665f1d5f0f1d5f0f1d5f2001';

    mockUserFind.mockReturnValue(queryStub([
      {
        _id: employeeId,
        firstName: 'Hans',
        lastName: 'Mueller',
        email: 'hans@example.test',
        department: 'Service',
      },
    ]));
    mockTimeEntryFind.mockReturnValue(queryStub([
      {
        _id: '665f1d5f0f1d5f0f1d5f3001',
        technicianId: { _id: employeeId, firstName: 'Hans', lastName: 'Mueller' },
        date: new Date('2026-06-01T00:00:00.000Z'),
        startTime: new Date('2026-06-01T07:00:00.000Z'),
        endTime: new Date('2026-06-01T16:00:00.000Z'),
        netDurationMin: 540,
        activityType: 'ONSITE_WORK',
        releaseStatus: 'PENDING',
        orderId: {
          _id: '665f1d5f0f1d5f0f1d5f4001',
          assignmentNumber: 'ASG-1',
          title: 'Boiler service',
          projectId: { _id: projectId, projectNumber: 'P-1', name: 'Heating project' },
          customerId: { _id: customerId, name: 'ACME AG' },
        },
      },
    ]));
    mockAvailabilityFind.mockReturnValue({ lean: jest.fn().mockResolvedValue([
      {
        employeeId,
        date: new Date('2026-06-01T00:00:00.000Z'),
        availabilityType: 'WORKING',
        workStart: '08:00',
        workEnd: '16:00',
      },
    ]) });
    mockLeaveFind.mockReturnValue(queryStub([
      {
        _id: '665f1d5f0f1d5f0f1d5f5001',
        employeeId,
        leaveType: 'VACATION',
        status: 'PENDING',
        startDate: new Date('2026-06-01T00:00:00.000Z'),
        endDate: new Date('2026-06-01T23:59:59.999Z'),
        requestedDays: 1,
      },
    ]));

    const result = await timeTrackingService.getOverview({
      dateFrom: '2026-06-01',
      dateTo: '2026-06-01',
    });

    expect(result.totals).toEqual(expect.objectContaining({
      targetHours: 8,
      actualHours: 9,
      overtimeHours: 1,
      deficitHours: 0,
      pendingEntries: 1,
      pendingLeaveRequests: 1,
    }));
    expect(result.byEmployee[0]).toEqual(expect.objectContaining({
      employeeId,
      employeeName: 'Hans Mueller',
      targetHours: 8,
      actualHours: 9,
      overtimeHours: 1,
    }));
    expect(result.groupings.project[0]).toEqual(expect.objectContaining({
      key: projectId,
      label: 'P-1',
      actualHours: 9,
    }));
  });
});

describe('timeTrackingService leave approval', () => {
  it('approves pending leave and syncs it into employee availability', async () => {
    const leaveRequestId = '665f1d5f0f1d5f0f1d5f6001';
    const employeeId = '665f1d5f0f1d5f0f1d5f0001';
    const reviewerId = '665f1d5f0f1d5f0f1d5f9001';
    const request = {
      _id: leaveRequestId,
      employeeId,
      leaveType: 'VACATION',
      startDate: new Date(2026, 5, 1, 0, 0, 0, 0),
      endDate: new Date(2026, 5, 2, 23, 59, 59, 999),
      reason: 'Family holiday',
      status: 'PENDING',
      save: jest.fn().mockResolvedValue(true),
    };
    const approved = {
      ...request,
      status: 'APPROVED',
      employeeId: { _id: employeeId, firstName: 'Hans', lastName: 'Mueller' },
      reviewedBy: { _id: reviewerId, firstName: 'Admin', lastName: 'User' },
    };

    mockLeaveFindById
      .mockReturnValueOnce(request)
      .mockReturnValueOnce(queryStub(approved));

    const result = await timeTrackingService.approveLeaveRequest(
      leaveRequestId,
      { decisionNote: 'Approved' },
      reviewerId,
      { ipAddress: '127.0.0.1', userAgent: 'jest' },
    );

    expect(request.status).toBe('APPROVED');
    expect(request.reviewedBy).toBe(reviewerId);
    expect(request.decisionNote).toBe('Approved');
    expect(request.save).toHaveBeenCalled();
    expect(mockAvailabilityBulkWrite).toHaveBeenCalledWith([
      expect.objectContaining({
        updateOne: expect.objectContaining({
          filter: expect.objectContaining({ employeeId: request.employeeId }),
          update: expect.objectContaining({
            $set: expect.objectContaining({
              availabilityType: 'VACATION',
              workStart: null,
              workEnd: null,
            }),
          }),
          upsert: true,
        }),
      }),
      expect.objectContaining({
        updateOne: expect.objectContaining({
          filter: expect.objectContaining({ employeeId: request.employeeId }),
          update: expect.objectContaining({
            $set: expect.objectContaining({ availabilityType: 'VACATION' }),
          }),
          upsert: true,
        }),
      }),
    ]);
    expect(mockSendNotification).toHaveBeenCalledWith(employeeId, expect.objectContaining({
      notificationType: 'LEAVE_APPROVED',
    }));
    expect(mockEventPublish).toHaveBeenCalledWith(
      'time.leave_request.approved',
      expect.objectContaining({ leaveRequestId, employeeId }),
      { source: 'time-tracking' },
    );
    expect(result).toEqual(expect.objectContaining({ status: 'APPROVED' }));
  });
});

describe('timeTrackingService time entry import', () => {
  it('validates a CSV import during dry run without creating entries', async () => {
    const userId = '665f1d5f0f1d5f0f1d5f9001';
    const orderId = '665f1d5f0f1d5f0f1d5f4001';
    const csv = [
      'orderId,technicianId,date,startTime,endTime,breakDurationMin,activityType,note',
      `${orderId},,2026-06-29,08:00,17:00,30,ONSITE_WORK,Imported service visit`,
    ].join('\n');

    mockAssignmentFind.mockReturnValue(queryStub([{ _id: orderId }]));
    mockUserFind.mockReturnValue(queryStub([{ _id: userId }]));

    const result = await timeTrackingService.importTimeEntriesCsv(
      { buffer: Buffer.from(csv) },
      { dryRun: true },
      userId,
      { ipAddress: '127.0.0.1', userAgent: 'jest' },
    );

    expect(result).toEqual(expect.objectContaining({
      dryRun: true,
      totalRows: 1,
      validRows: 1,
      failed: 0,
    }));
    expect(mockTimeEntryService.create).not.toHaveBeenCalled();
  });

  it('creates validated CSV rows when import is committed', async () => {
    const userId = '665f1d5f0f1d5f0f1d5f9001';
    const technicianId = '665f1d5f0f1d5f0f1d5f0001';
    const orderId = '665f1d5f0f1d5f0f1d5f4001';
    const csv = [
      'orderId,technicianId,date,startTime,endTime,breakDurationMin,activityType,note',
      `${orderId},${technicianId},2026-06-29,08:00,17:00,30,TRAVEL,Imported travel time`,
    ].join('\n');

    mockAssignmentFind.mockReturnValue(queryStub([{ _id: orderId }]));
    mockUserFind.mockReturnValue(queryStub([{ _id: technicianId }]));
    mockTimeEntryService.create.mockResolvedValue({ _id: '665f1d5f0f1d5f0f1d5f3001' });

    const result = await timeTrackingService.importTimeEntriesCsv(
      { buffer: Buffer.from(csv) },
      { dryRun: false },
      userId,
      { ipAddress: '127.0.0.1', userAgent: 'jest' },
    );

    expect(result).toEqual(expect.objectContaining({
      dryRun: false,
      totalRows: 1,
      validRows: 1,
      created: 1,
      failed: 0,
    }));
    expect(mockTimeEntryService.create).toHaveBeenCalledWith(
      orderId,
      expect.objectContaining({
        breakDurationMin: 30,
        activityType: 'TRAVEL',
        note: 'Imported travel time',
      }),
      technicianId,
      expect.objectContaining({ source: 'time-tracking-import' }),
    );
    expect(mockAuditLogEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'time-entry.imported',
      module: 'time-tracking',
    }));
  });

  it('returns row errors and skips writes for invalid CSV rows', async () => {
    const userId = '665f1d5f0f1d5f0f1d5f9001';
    const csv = [
      'orderId,technicianId,date,startTime,endTime,breakDurationMin,activityType,note',
      'bad-id,,2026-06-29,17:00,08:00,0,UNKNOWN,Invalid row',
    ].join('\n');

    const result = await timeTrackingService.importTimeEntriesCsv(
      { buffer: Buffer.from(csv) },
      { dryRun: false },
      userId,
      { ipAddress: '127.0.0.1', userAgent: 'jest' },
    );

    expect(result.failed).toBe(1);
    expect(result.rowErrors).toEqual(expect.arrayContaining([
      expect.objectContaining({ row: 2, field: 'orderId' }),
      expect.objectContaining({ row: 2, field: 'endTime' }),
      expect.objectContaining({ row: 2, field: 'activityType' }),
    ]));
    expect(mockTimeEntryService.create).not.toHaveBeenCalled();
  });
});
