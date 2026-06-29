import mongoose from 'mongoose';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from '@jest/globals';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';

let Assignment;
let Permission;
let Role;
let TimeEntry;
let User;
let WorkReport;
let reportService;
let DailyReportReminderWorker;
let ReportEscalationWorker;

beforeAll(async () => {
  await connectTestDb();
  ({ default: Permission } = await import('../../src/modules/auth/permission.model.js'));
  ({ default: Role } = await import('../../src/modules/auth/role.model.js'));
  ({ default: User } = await import('../../src/modules/auth/user.model.js'));
  ({ default: Assignment } = await import('../../src/modules/deploy/assignment.model.js'));
  ({ default: TimeEntry } = await import('../../src/modules/mobile/timeEntry.model.js'));
  ({ default: WorkReport } = await import('../../src/modules/mobile/workReport.model.js'));
  await import('../../src/modules/mobile/notificationPreference.model.js');
  await import('../../src/modules/mobile/notificationLog.model.js');
  ({ default: reportService } = await import('../../src/modules/mobile/report.service.js'));
  ({ default: DailyReportReminderWorker } = await import('../../src/jobs/dailyReportReminder.job.js'));
  ({ default: ReportEscalationWorker } = await import('../../src/jobs/reportEscalation.job.js'));
});

afterEach(async () => {
  await clearTestDb();
});

afterAll(async () => {
  await disconnectTestDb();
});

function objectId() {
  return new mongoose.Types.ObjectId();
}

async function createReport(overrides = {}) {
  return WorkReport.create({
    reportNumber: `WR-${Date.now()}-${Math.random()}`,
    orderId: objectId(),
    reportDate: new Date('2026-06-10T00:00:00.000Z'),
    arrivalTime: new Date('2026-06-10T08:00:00.000Z'),
    departureTime: new Date('2026-06-10T10:30:00.000Z'),
    workPerformed: 'Checked heating system',
    technicianId: objectId(),
    createdBy: objectId(),
    status: 'SUBMITTED',
    submittedAt: new Date('2026-06-10T11:00:00.000Z'),
    editableUntil: new Date('2026-06-11T11:00:00.000Z'),
    ...overrides,
  });
}

async function createMobileUser() {
  const permission = await Permission.create({ module: 'mobile', action: 'read', description: 'Mobile read' });
  const role = await Role.create({ name: `Mobile-${Date.now()}`, permissions: [permission._id] });
  return User.create({
    email: `tech-${Date.now()}@example.com`,
    passwordHash: 'hash',
    firstName: 'Tech',
    lastName: 'User',
    role: role._id,
    status: 'active',
  });
}

describe('mobile report workflow completion', () => {
  test('approves and marks an approved report as invoiced with audit metadata', async () => {
    const approver = await createMobileUser();
    const approverId = approver._id;
    const report = await createReport();

    const approved = await reportService.approve(report._id, approverId);
    expect(approved).toMatchObject({
      status: 'APPROVED',
      accountingTransferStatus: 'PENDING',
    });
    expect(approved.approvedBy._id.toString()).toBe(approverId.toString());
    expect(approved.approvedAt).toBeTruthy();

    const invoiced = await reportService.markInvoiced(
      report._id,
      { invoiceReference: 'INV-2026-0001' },
      approverId,
    );
    expect(invoiced).toMatchObject({
      status: 'INVOICED',
      invoiceReference: 'INV-2026-0001',
      accountingTransferStatus: 'TRANSFERRED',
    });
    expect(invoiced.invoicedBy._id.toString()).toBe(approverId.toString());
  });

  test('returns paginated reports, summary metrics, and CSV export rows', async () => {
    await createReport({ reportNumber: 'RPT-A', status: 'APPROVED', billableMinutes: 120 });
    await createReport({
      reportNumber: 'RPT-B',
      status: 'DRAFT',
      submittedAt: null,
      editableUntil: null,
      billableMinutes: 30,
      nonBillableMinutes: 15,
    });

    const page = await reportService.list({ page: 1, pageSize: 1, sortBy: 'reportNumber', sortOrder: 'asc' });
    expect(page.items).toHaveLength(1);
    expect(page.pagination).toMatchObject({ page: 1, pageSize: 1, total: 2, hasNextPage: true });

    const summary = await reportService.getSummary({});
    expect(summary.totals).toMatchObject({
      reports: 2,
      approved: 1,
      draft: 1,
      billableMinutes: 150,
      nonBillableMinutes: 15,
    });

    const exported = await reportService.exportCsv({ type: 'payroll' });
    expect(exported.filename).toContain('work-reports-payroll');
    expect(exported.csv).toContain('reportNumber');
    expect(exported.csv).toContain('RPT-A');
  });

  test('validates and imports report CSV rows by assignment number', async () => {
    const technician = await createMobileUser();
    await Assignment.create({
      assignmentNumber: 'ASN-IMPORT-1',
      employeeId: technician._id,
      assignmentType: 'SERVICE_CALL',
      title: 'Import service visit',
      startDatetime: new Date('2026-06-15T08:00:00.000Z'),
      endDatetime: new Date('2026-06-15T12:00:00.000Z'),
      status: 'PLANNED',
      createdBy: technician._id,
    });
    const csv = [
      'assignmentNumber,reportDate,arrivalTime,departureTime,workPerformed,materialItems,status',
      '"ASN-IMPORT-1","2026-06-15","2026-06-15T08:00:00.000Z","2026-06-15T12:30:00.000Z","Checked burner and safety valve","Burner nozzle|1|pcs;Seal kit|2|pcs","DRAFT"',
    ].join('\n');
    const file = { buffer: Buffer.from(csv), originalname: 'reports.csv', mimetype: 'text/csv' };

    const dryRun = await reportService.importCsv(file, { dryRun: true }, technician._id);
    expect(dryRun).toMatchObject({ dryRun: true, totalRows: 1, validRows: 1, created: 0, failed: 0 });

    const imported = await reportService.importCsv(file, { dryRun: false }, technician._id);
    expect(imported).toMatchObject({ dryRun: false, totalRows: 1, validRows: 1, created: 1, failed: 0 });

    const report = await WorkReport.findOne({ workPerformed: 'Checked burner and safety valve' }).lean();
    expect(report).toMatchObject({
      status: 'DRAFT',
      generationSource: 'SYNC',
      billableMinutes: 270,
    });
    expect(report.materialItems).toHaveLength(2);
  });

  test('generates a draft report from tracked time entries', async () => {
    const technicianId = objectId();
    const orderId = objectId();
    const timeEntry = await TimeEntry.create({
      orderId,
      technicianId,
      date: new Date('2026-06-10T00:00:00.000Z'),
      startTime: new Date('2026-06-10T08:00:00.000Z'),
      endTime: new Date('2026-06-10T09:30:00.000Z'),
      breakDurationMin: 15,
      netDurationMin: 75,
      activityType: 'ONSITE_WORK',
      note: 'Completed burner inspection',
      createdBy: technicianId,
    });

    const report = await reportService.generateFromSources(orderId, {
      generationSource: 'TIME_TRACKING',
      timeEntryIds: [timeEntry._id],
    }, technicianId);

    expect(report).toMatchObject({
      status: 'DRAFT',
      generationSource: 'TIME_TRACKING',
      billableMinutes: 75,
    });
    expect(report.sourceTimeEntryIds.map((id) => id.toString())).toEqual([timeEntry._id.toString()]);
    expect(report.workPerformed).toContain('Completed burner inspection');
  });
});

describe('mobile report reminder jobs', () => {
  test('sends daily reminders to active mobile users with incomplete reports', async () => {
    const user = await createMobileUser();
    await createReport({
      technicianId: user._id,
      createdBy: user._id,
      status: 'DRAFT',
      submittedAt: null,
      editableUntil: null,
    });

    const result = await new DailyReportReminderWorker().process({});
    expect(result).toEqual({ remindersCount: 1 });
  });

  test('escalates overdue assignments without submitted, approved, or invoiced reports', async () => {
    const user = await createMobileUser();
    await Assignment.create({
      assignmentNumber: 'ASN-OVERDUE-1',
      employeeId: user._id,
      assignmentType: 'SERVICE_CALL',
      title: 'Overdue service',
      startDatetime: new Date('2026-06-01T08:00:00.000Z'),
      endDatetime: new Date('2026-06-01T10:00:00.000Z'),
      status: 'PLANNED',
      createdBy: objectId(),
    });

    const result = await new ReportEscalationWorker().process({});
    expect(result).toEqual({ escalationsCount: 1 });
  });
});
