import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, jest, it } from '@jest/globals';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../../tests/setup.js';

// Real models + the real CacheManager (L1 only): range semantics, filters and
// cache invalidation are exercised end to end against MongoDB.
jest.unstable_mockModule('../../../shared/logger/index.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

let Assignment;
let User;
let CoarseAllocation;
let calendarService;
let isoWeekSpans;
let calendarQuerySchema;
let cacheManager;

const oid = () => new mongoose.Types.ObjectId();
let seq = 0;

// A Berlin client's Monday–Sunday week of 2026-11-09 (CET, UTC+1), as sent by the UI.
const WEEK = ['2026-11-08T23:00:00.000Z', '2026-11-15T22:59:59.999Z'];

beforeAll(async () => {
  await connectTestDb();
  for (const model of ['qop/order', 'crm/customer', 'crm/site', 'crm/installation', 'crm/maintenanceInterval', 'pm/project', 'pm/scheduleEntry']) {
    await import(`../../${model}.model.js`);
  }
  ({ default: User } = await import('../../auth/user.model.js'));
  ({ default: Assignment } = await import('../assignment.model.js'));
  ({ default: CoarseAllocation } = await import('../coarseAllocation.model.js'));
  ({ default: calendarService, isoWeekSpans } = await import('../calendar.service.js'));
  ({ calendarQuerySchema } = await import('../calendar.validation.js'));
  ({ default: cacheManager } = await import('../../../shared/cache/CacheManager.js'));
});

afterEach(async () => {
  await clearTestDb();
  cacheManager.l1.flush();
});

afterAll(async () => {
  await disconnectTestDb();
});

async function seedEmployee(overrides = {}) {
  const _id = oid();
  await User.collection.insertOne({
    _id, firstName: 'Hans', lastName: `M${seq += 1}`, email: `e${seq}@test.local`, status: 'active',
    department: 'Montage', isDeleted: false, ...overrides,
  });
  return _id;
}

function assignment(employeeId, start, end, overrides = {}) {
  seq += 1;
  return {
    assignmentNumber: `E-${seq}`, employeeId, assignmentType: 'SERVICE_CALL', title: `A${seq}`,
    startDatetime: new Date(start), endDatetime: new Date(end), createdBy: oid(), ...overrides,
  };
}

const titles = (rows) => rows.flatMap((row) => row.assignments.map((a) => a.title)).sort();

describe('scheduling calendar range semantics', () => {
  it('includes work overlapping the range boundaries and excludes work only touching them', async () => {
    const emp = await seedEmployee();
    await Assignment.create([
      assignment(emp, '2026-11-06T08:00:00Z', '2026-11-10T16:00:00Z', { title: 'spans-start' }),
      assignment(emp, '2026-11-15T20:00:00Z', '2026-11-17T09:00:00Z', { title: 'spans-end' }),
      assignment(emp, '2026-11-01T00:00:00Z', '2026-11-30T00:00:00Z', { title: 'covers-range' }),
      assignment(emp, '2026-11-08T20:00:00Z', '2026-11-08T23:00:00Z', { title: 'ends-at-start' }),
      assignment(emp, '2026-11-15T22:59:59.999Z', '2026-11-16T03:00:00Z', { title: 'starts-at-end' }),
      assignment(emp, '2026-11-11T08:00:00Z', '2026-11-11T09:00:00Z', { title: 'inside', isDeleted: true }),
    ]);

    const rows = await calendarService.getCalendarData(...WEEK, {});
    expect(titles(rows)).toEqual(['covers-range', 'spans-end', 'spans-start']);

    // The spanning items also belong to the adjacent weeks.
    const prev = await calendarService.getCalendarData('2026-11-01T23:00:00.000Z', '2026-11-08T22:59:59.999Z', {});
    expect(titles(prev)).toEqual(['covers-range', 'ends-at-start', 'spans-start']);
  });

  it('covers a DST-change week (Berlin 2026-10-25, 25-hour Sunday) with the client instants as sent', async () => {
    const emp = await seedEmployee();
    await Assignment.create([
      assignment(emp, '2026-10-18T23:30:00Z', '2026-10-19T01:00:00Z', { title: 'monday-00:30-cest' }), // Mon 01:30 CEST
      assignment(emp, '2026-10-25T22:30:00Z', '2026-10-25T23:30:00Z', { title: 'sunday-23:30-cet' }), // Sun 23:30 CET
      assignment(emp, '2026-10-26T00:30:00Z', '2026-10-26T02:00:00Z', { title: 'next-monday' }),
    ]);
    // startOfWeek(Mon 19 Oct, CEST) .. endOfWeek(Sun 25 Oct 23:59:59.999, CET)
    const rows = await calendarService.getCalendarData('2026-10-18T22:00:00.000Z', '2026-10-25T22:59:59.999Z', {});
    expect(titles(rows)).toEqual(['monday-00:30-cest', 'sunday-23:30-cet']);
  });

  it('skips work without an employee row instead of failing the whole calendar', async () => {
    const emp = await seedEmployee();
    await Assignment.create([
      assignment(emp, '2026-11-10T08:00:00Z', '2026-11-10T10:00:00Z', { title: 'employee' }),
      assignment(null, '2026-11-10T08:00:00Z', '2026-11-10T10:00:00Z', {
        title: 'team', assignmentTargetType: 'TEAM', assignmentTargetId: 'montage', assignmentTargetLabel: 'Montage',
      }),
      assignment(oid(), '2026-11-11T08:00:00Z', '2026-11-11T10:00:00Z', { title: 'deleted-user' }),
    ]);

    const rows = await calendarService.getCalendarData(...WEEK, {});
    expect(titles(rows)).toEqual(['employee']);
  });

  it('team filter (department name, as the UI sends it) narrows rows and work to the team', async () => {
    const montage = await seedEmployee({ department: 'Montage' });
    const service = await seedEmployee({ department: 'Service' });
    await Assignment.create([
      assignment(montage, '2026-11-10T08:00:00Z', '2026-11-10T10:00:00Z', { title: 'montage-work' }),
      assignment(service, '2026-11-10T08:00:00Z', '2026-11-10T10:00:00Z', { title: 'service-work' }),
    ]);

    const { error, value } = calendarQuerySchema.query.validate({ startDate: WEEK[0], endDate: WEEK[1], teamId: 'Montage' });
    expect(error).toBeUndefined();

    const rows = await calendarService.getCalendarData(value.startDate, value.endDate, { teamId: value.teamId });
    expect(rows.map((row) => row.employeeId)).toEqual([String(montage)]);
    expect(titles(rows)).toEqual(['montage-work']);

    const empty = await calendarService.getCalendarData(...WEEK, { teamId: 'Nobody' });
    expect(empty).toEqual([]);
  });

  it('returns coarse allocations of the client week only, across an ISO year boundary', async () => {
    const emp = await seedEmployee();
    const projectId = oid();
    const base = { employeeId: emp, projectId, allocationPercent: 50, createdBy: oid() };
    await CoarseAllocation.create([
      { ...base, calendarYear: 2026, calendarWeek: 52 },
      { ...base, calendarYear: 2026, calendarWeek: 53 },
      { ...base, calendarYear: 2027, calendarWeek: 1 },
    ]);
    // Mon 28 Dec 2026 – Sun 3 Jan 2027 (Berlin) is ISO week 2026-W53.
    const rows = await calendarService.getCalendarData('2026-12-27T23:00:00.000Z', '2027-01-03T22:59:59.999Z', {});
    const weeks = rows.flatMap((row) => row.coarseAllocations.map((a) => `${a.calendarYear}-W${a.calendarWeek}`));
    expect(weeks).toEqual(['2026-W53']);
  });

  it('serves a cached range until an assignment write (any path) changes it', async () => {
    const emp = await seedEmployee();
    const [created] = await Assignment.create([assignment(emp, '2026-11-10T08:00:00Z', '2026-11-10T10:00:00Z', { title: 'before' })]);
    expect(titles(await calendarService.getCalendarData(...WEEK, {}))).toEqual(['before']);

    // e.g. a mobile status update or the AI assistant writing through the model
    await Assignment.updateOne({ _id: created._id }, { $set: { title: 'after' } });
    expect(titles(await calendarService.getCalendarData(...WEEK, {}))).toEqual(['after']);
  });
});

describe('isoWeekSpans', () => {
  it.each([
    ['Berlin week (UTC+1)', WEEK, [{ year: 2026, weekFrom: 46, weekTo: 46 }]],
    ['Berlin day', ['2026-11-11T23:00:00.000Z', '2026-11-12T22:59:59.999Z'], [{ year: 2026, weekFrom: 46, weekTo: 46 }]],
    ['New York week (UTC-5)', ['2026-11-09T05:00:00.000Z', '2026-11-16T04:59:59.999Z'], [{ year: 2026, weekFrom: 46, weekTo: 46 }]],
    ['Berlin month Nov 2026', ['2026-10-31T23:00:00.000Z', '2026-11-30T22:59:59.999Z'], [{ year: 2026, weekFrom: 44, weekTo: 49 }]],
    ['Berlin month Jan 2027', ['2026-12-31T23:00:00.000Z', '2027-01-31T22:59:59.999Z'],
      [{ year: 2026, weekFrom: 53, weekTo: 53 }, { year: 2027, weekFrom: 1, weekTo: 4 }]],
    ['short sub-day range', ['2026-11-15T08:00:00.000Z', '2026-11-15T12:00:00.000Z'], [{ year: 2026, weekFrom: 46, weekTo: 46 }]],
  ])('%s', (_label, [start, end], expected) => {
    expect(isoWeekSpans(new Date(start), new Date(end))).toEqual(expected);
  });
});

describe('calendar query validation', () => {
  const validate = (query) => calendarQuerySchema.query.validate(query);

  it('rejects an inverted range, malformed employee ids and oversized ranges', () => {
    expect(validate({ startDate: WEEK[1], endDate: WEEK[0] }).error).toBeDefined();
    expect(validate({ startDate: WEEK[0], endDate: WEEK[1], employeeIds: 'abc' }).error).toBeDefined();
    expect(validate({ startDate: '2026-01-01T00:00:00Z', endDate: '2026-12-31T00:00:00Z' }).error).toBeDefined();
  });

  it('accepts comma-separated ids and normalizes whitespace', () => {
    const a = '665f1d5f0f1d5f0f1d5f0001';
    const b = '665f1d5f0f1d5f0f1d5f0002';
    const { error, value } = validate({ startDate: WEEK[0], endDate: WEEK[1], employeeIds: `${a}, ${b},` });
    expect(error).toBeUndefined();
    expect(value.employeeIds).toBe(`${a},${b}`);
  });
});
