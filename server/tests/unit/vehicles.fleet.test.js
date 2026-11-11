import {
  afterAll, beforeAll, beforeEach, describe, expect, jest, test,
} from '@jest/globals';
import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';

const audit = jest.fn();
jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({
  default: { logEvent: audit, queryByEntity: jest.fn(async () => []), withUserNames: jest.fn(async (e) => e) },
}));
const uploaded = [];
jest.unstable_mockModule('../../src/modules/files/file.service.js', () => ({
  default: {
    upload: jest.fn(async (args) => { uploaded.push(args); return { _id: new mongoose.Types.ObjectId() }; }),
    getDownloadUrl: jest.fn(async (id) => `https://files.test/${id}`),
    delete: jest.fn(async () => ({})),
  },
}));

if (!mongoose.models.User) {
  mongoose.model('User', new mongoose.Schema({ firstName: String, lastName: String, email: String, phone: String, mobile: String, avatarFileId: mongoose.Schema.Types.ObjectId }));
}
const User = mongoose.model('User');

const { default: service } = await import('../../src/modules/vehicles/vehicle.service.js');
const { default: Vehicle } = await import('../../src/modules/vehicles/vehicle.model.js');
const { vehicleAlerts, healthOf } = await import('../../src/modules/vehicles/vehicle.alerts.js');
const { plateKeyOf } = await import('../../src/modules/vehicles/vehicle.constants.js');

const userId = new mongoose.Types.ObjectId();
const DAY = 86_400_000;

beforeAll(connectTestDb, 120_000);
afterAll(disconnectTestDb);
beforeEach(async () => { await clearTestDb(); audit.mockClear(); uploaded.length = 0; });

describe('vehicle master data', () => {
  test('plate key ignores spacing and case; duplicates are refused with 409', async () => {
    expect(plateKeyOf('zh 128-540')).toBe('ZH128540');
    const v = await service.create({ kennzeichen: 'ZH 128 540', assetType: 'van', make: 'VW' }, userId);
    expect(v.plateKey).toBe('ZH128540');
    await expect(service.create({ kennzeichen: 'zh128540' }, userId)).rejects.toMatchObject({ statusCode: 409 });
    const other = await service.create({ kennzeichen: 'BE 1' }, userId);
    await expect(service.update(other._id, { kennzeichen: 'ZH-128-540' }, userId)).rejects.toMatchObject({ statusCode: 409 });
    const renamed = await service.update(other._id, { kennzeichen: 'BE 2' }, userId);
    expect(renamed.plateKey).toBe('BE2');
  });

  test('empty form values clear fields and the audit lists only real changes', async () => {
    const v = await service.create({ kennzeichen: 'AG 1', label: 'Pool', color: 'Blue' }, userId);
    const updated = await service.update(v._id, { label: 'Pool', color: '' }, userId);
    expect(updated.color).toBeNull();
    const updateAudit = audit.mock.calls.map((c) => c[0]).find((e) => e.eventType === 'vehicle.updated');
    expect(updateAudit.details.changedFields).toEqual(['color']);
  });

  test('search escapes regex input and matches plates without spaces', async () => {
    await service.create({ kennzeichen: 'ZH 401 992', make: 'Renault', model: 'Zoe' }, userId);
    await service.create({ kennzeichen: 'BE 245 118', make: 'Ford' }, userId);
    expect((await service.list({ search: 'zh401' })).items).toHaveLength(1);
    expect((await service.list({ search: 'zoe' })).items).toHaveLength(1);
    await expect(service.list({ search: '(.*' })).resolves.toMatchObject({ total: 0 });
  });

  test('list paginates, hides retired by default and soft-deleted always', async () => {
    for (let i = 0; i < 7; i += 1) await service.create({ kennzeichen: `LU ${i}` }, userId);
    const retired = await service.create({ kennzeichen: 'LU 99', status: 'retired' }, userId);
    const gone = await service.create({ kennzeichen: 'LU 98' }, userId);
    await service.remove(gone._id, userId);
    const page = await service.list({ limit: 3, page: 2 });
    expect(page).toMatchObject({ total: 7, page: 2, limit: 3, pages: 3 });
    expect(page.items).toHaveLength(3);
    expect((await service.list({ status: 'retired' })).items.map((v) => String(v._id))).toEqual([String(retired._id)]);
    expect((await service.list({ status: 'all' })).total).toBe(8);
  });
});

describe('alerts and stats', () => {
  test('date and meter thresholds produce overdue / due soon, worst first', () => {
    const now = new Date('2026-06-01T10:00:00Z');
    const alerts = vehicleAlerts({
      status: 'available',
      insuranceExpiry: new Date(now.getTime() + 10 * DAY),
      inspectionDue: new Date(now.getTime() - 2 * DAY),
      nextServiceDate: new Date(now.getTime() + 90 * DAY),
      mileageKm: 99_000, nextServiceKm: 100_000, meterUnit: 'km',
    }, now);
    expect(alerts.map((a) => [a.field, a.level])).toEqual([
      ['inspectionDue', 'overdue'], ['insuranceExpiry', 'due_soon'], ['nextServiceKm', 'due_soon'],
    ]);
    expect(healthOf(alerts)).toBe('overdue');
    expect(vehicleAlerts({ status: 'retired', inspectionDue: now }, now)).toEqual([]);
    // Machinery is metered in hours with its own window.
    expect(vehicleAlerts({ status: 'available', mileageKm: 900, nextServiceKm: 1000, meterUnit: 'h' }, now)).toEqual([]);
    expect(vehicleAlerts({ status: 'available', mileageKm: 960, nextServiceKm: 1000, meterUnit: 'h' }, now)[0].level).toBe('due_soon');
  });

  test('attention filter and stats agree with the alert rules', async () => {
    const soon = new Date(Date.now() + 5 * DAY);
    const past = new Date(Date.now() - 5 * DAY);
    await service.create({ kennzeichen: 'A 1', status: 'in_use', insuranceExpiry: soon }, userId);
    await service.create({ kennzeichen: 'A 2', inspectionDue: past }, userId);
    await service.create({ kennzeichen: 'A 3', mileageKm: 10_500, nextServiceKm: 10_000 }, userId);
    await service.create({ kennzeichen: 'A 4', nextServiceDate: new Date(Date.now() + 200 * DAY) }, userId);
    await service.create({ kennzeichen: 'A 5', status: 'retired', inspectionDue: past }, userId);

    const attention = await service.list({ attention: true });
    expect(attention.items.map((v) => v.kennzeichen).sort()).toEqual(['A 1', 'A 2', 'A 3']);
    expect(attention.items.every((v) => v.alerts.length > 0)).toBe(true);

    const stats = await service.stats();
    expect(stats).toMatchObject({ total: 4, retired: 1, attention: 3, overdue: 2, utilization: 25 });
  });
});

describe('logs keep the vehicle in sync', () => {
  test('service log updates last service, meter and next service; delete recomputes', async () => {
    const v = await service.create({ kennzeichen: 'SO 1', mileageKm: 1000 }, userId);
    const older = await service.addService(v._id, { date: '2026-01-10', description: 'A', mileageKm: 900, garage: 'Old' }, userId);
    const newer = await service.addService(v._id, {
      date: '2026-03-10', description: 'B', mileageKm: 1500, garage: 'New', cost: 300, nextServiceKm: 20_000,
    }, userId);
    let fresh = await service.getById(v._id);
    expect(fresh).toMatchObject({ lastServiceGarage: 'New', mileageKm: 1500, nextServiceKm: 20_000 });
    await service.deleteService(v._id, newer._id, userId);
    fresh = await service.getById(v._id);
    expect(fresh.lastServiceGarage).toBe('Old');
    await service.deleteService(v._id, older._id, userId);
    expect((await service.getById(v._id)).lastServiceDate).toBeNull();
    await expect(service.deleteService(v._id, older._id, userId)).rejects.toMatchObject({ statusCode: 404 });
  });

  test('costs sum with service costs per currency and compute consumption', async () => {
    const v = await service.create({ kennzeichen: 'TG 1', mileageKm: 10_000 }, userId);
    await service.addCost(v._id, { type: 'fuel', date: '2026-02-01', amount: 100, quantity: 50, quantityUnit: 'l', meterReading: 10_000 }, userId);
    await service.addCost(v._id, { type: 'fuel', date: '2026-02-15', amount: 80, quantity: 40, quantityUnit: 'l', meterReading: 10_500 }, userId);
    await service.addCost(v._id, { type: 'toll', date: '2026-02-16', amount: 40, currency: 'EUR' }, userId);
    await service.addService(v._id, { date: '2026-02-20', description: 'Tyres', cost: 500 }, userId);

    const { items, summary } = await service.listCosts(v._id);
    expect(items).toHaveLength(3);
    expect(summary.totals).toEqual([{ currency: 'CHF', amount: 680 }, { currency: 'EUR', amount: 40 }]);
    expect(summary.byType.find((r) => r.type === 'service')).toMatchObject({ amount: 500 });
    expect(summary.consumption[0]).toMatchObject({ unit: 'l', fills: 2, per100: 8 });
    expect((await service.getById(v._id)).mileageKm).toBe(10_500);
  });
});

describe('bookings', () => {
  test('overlaps are refused, adjacent slots allowed, others need write access', async () => {
    const v = await service.create({ kennzeichen: 'ZG 1' }, userId);
    const me = { _id: userId, canWrite: false };
    await service.addBooking(v._id, { start: '2026-12-01T08:00:00Z', end: '2026-12-01T12:00:00Z' }, me);
    await expect(service.addBooking(v._id, { start: '2026-12-01T11:00:00Z', end: '2026-12-01T13:00:00Z' }, me))
      .rejects.toMatchObject({ statusCode: 409 });
    await service.addBooking(v._id, { start: '2026-12-01T12:00:00Z', end: '2026-12-01T14:00:00Z' }, me);
    await expect(service.addBooking(v._id, { start: '2026-12-02T08:00:00Z', end: '2026-12-02T09:00:00Z', bookedFor: new mongoose.Types.ObjectId() }, me))
      .rejects.toMatchObject({ statusCode: 403 });

    const list = await service.listBookings(v._id, { includePast: true });
    expect(list).toHaveLength(2);
    const stranger = { _id: new mongoose.Types.ObjectId(), canWrite: false };
    await expect(service.cancelBooking(v._id, list[0]._id, stranger)).rejects.toMatchObject({ statusCode: 403 });
    await service.cancelBooking(v._id, list[0]._id, me);
    expect(await service.listBookings(v._id, { includePast: true })).toHaveLength(1);
  });

  test('concurrent bookings of the same slot: exactly one wins', async () => {
    const v = await service.create({ kennzeichen: 'ZG 2' }, userId);
    const me = { _id: userId, canWrite: true };
    const slot = { start: '2026-12-05T08:00:00Z', end: '2026-12-05T10:00:00Z' };
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => service.addBooking(v._id, slot, me)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await service.listBookings(v._id, { includePast: true })).toHaveLength(1);
  });

  test('deleting a vehicle cancels its future bookings; retired vehicles cannot be booked', async () => {
    const v = await service.create({ kennzeichen: 'ZG 3' }, userId);
    await service.addBooking(v._id, { start: new Date(Date.now() + DAY), end: new Date(Date.now() + 2 * DAY) }, { _id: userId });
    await service.remove(v._id, userId);
    expect(await service.listBookings(v._id)).toHaveLength(0);
    const r = await service.create({ kennzeichen: 'ZG 4', status: 'retired' }, userId);
    await expect(service.addBooking(r._id, { start: new Date(Date.now() + DAY), end: new Date(Date.now() + 2 * DAY) }, { _id: userId }))
      .rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('photo and drivers', () => {
  test('photos are re-encoded to WebP and capped in width', async () => {
    const sharp = (await import('sharp')).default;
    const png = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#2563eb' } }).png().toBuffer();
    const v = await service.create({ kennzeichen: 'SG 1' }, userId);
    const withPhoto = await service.setPhoto(v._id, { buffer: png, size: png.length, mimetype: 'image/png' }, userId);
    expect(withPhoto.imageUrl).toMatch(/^https:\/\/files\.test\//);
    expect(uploaded[0].mimeType).toBe('image/webp');
    const meta = await sharp(uploaded[0].buffer).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 1600 });
    await expect(service.setPhoto(v._id, { buffer: Buffer.from('nope'), size: 4, mimetype: 'application/pdf' }, userId))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test('assigning an unknown user is refused; a real one is populated', async () => {
    const v = await service.create({ kennzeichen: 'SH 1' }, userId);
    await expect(service.assignDriver(v._id, new mongoose.Types.ObjectId(), userId)).rejects.toMatchObject({ statusCode: 404 });
    const driver = await User.create({ firstName: 'Anna', lastName: 'Meier' });
    const updated = await service.assignDriver(v._id, driver._id, userId);
    expect(updated.currentDriverId.firstName).toBe('Anna');
    expect((await service.list({ driverId: String(driver._id) })).total).toBe(1);
  });
});

describe('query performance', () => {
  test('list and stats stay fast on a 2,000-vehicle fleet', async () => {
    const docs = Array.from({ length: 2000 }, (_, i) => ({
      kennzeichen: `PF ${i}`, plateKey: `PF${i}`, make: i % 2 ? 'VW' : 'Ford', assetType: i % 3 ? 'van' : 'truck',
      status: ['available', 'in_use', 'workshop'][i % 3], mileageKm: i * 10, nextServiceKm: i * 10 + (i % 50) * 100,
      nextServiceDate: new Date(Date.now() + (i % 120) * DAY),
    }));
    await Vehicle.insertMany(docs);
    await Vehicle.createIndexes();
    await service.list({ limit: 50 }); // warm-up

    const t0 = performance.now();
    const page = await service.list({ limit: 50, search: 'vw' });
    const t1 = performance.now();
    const stats = await service.stats();
    const t2 = performance.now();
    const due = await service.list({ attention: true, limit: 50 });
    const t3 = performance.now();

    expect(page.items).toHaveLength(50);
    expect(stats.total).toBe(2000);
    expect(due.total).toBeGreaterThan(0);
    // Generous ceilings for CI machines; locally these run in a few ms.
    expect(t1 - t0).toBeLessThan(400);
    expect(t2 - t1).toBeLessThan(400);
    expect(t3 - t2).toBeLessThan(400);
    console.log(`fleet perf (2000 vehicles): list+search ${(t1 - t0).toFixed(1)} ms, stats ${(t2 - t1).toFixed(1)} ms, attention ${(t3 - t2).toFixed(1)} ms`);
  });
});
