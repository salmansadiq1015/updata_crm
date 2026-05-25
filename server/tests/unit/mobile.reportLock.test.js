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

let WorkReport;
let reportService;

beforeAll(async () => {
  await connectTestDb();
  await import('../../src/modules/auth/user.model.js');
  await import('../../src/modules/deploy/assignment.model.js');
  await import('../../src/modules/mobile/workReport.model.js');
  WorkReport = mongoose.model('WorkReport');
  ({ default: reportService } = await import('../../src/modules/mobile/report.service.js'));
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
    reportDate: new Date(),
    workPerformed: 'Checked heating system',
    technicianId: objectId(),
    createdBy: objectId(),
    status: 'SUBMITTED',
    submittedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
    editableUntil: new Date(Date.now() - 24 * 60 * 60 * 1000),
    ...overrides,
  });
}

describe('mobile work report lock enforcement', () => {
  test('rejects deleting a submitted report after the edit window', async () => {
    const report = await createReport();

    await expect(reportService.delete(report._id, objectId())).rejects.toMatchObject({
      statusCode: 409,
    });

    const unchanged = await WorkReport.findById(report._id).lean();
    expect(unchanged.isDeleted).toBe(false);
  });

  test('rejects bulk delete when any report is locked', async () => {
    const draft = await createReport({ status: 'DRAFT', submittedAt: null, editableUntil: null });
    const locked = await createReport();

    await expect(
      reportService.bulkDelete([draft._id, locked._id], objectId()),
    ).rejects.toMatchObject({ statusCode: 409 });

    const reports = await WorkReport.find({ _id: { $in: [draft._id, locked._id] } }).lean();
    expect(reports.every((report) => report.isDeleted === false)).toBe(true);
  });
});
