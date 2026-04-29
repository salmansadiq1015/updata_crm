import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';

let Customer, Site, Installation, EntityNote, AuditLog, Role, User;

beforeAll(async () => {
  await connectTestDb();
  await import('../../src/modules/auth/user.model.js');
  await import('../../src/modules/auth/role.model.js');
  await import('../../src/modules/auth/auditLog.model.js');
  await import('../../src/modules/crm/customer.model.js');
  await import('../../src/modules/crm/site.model.js');
  await import('../../src/modules/crm/installation.model.js');
  await import('../../src/modules/crm/entityNote.model.js');
  Customer = mongoose.model('Customer');
  Site = mongoose.model('Site');
  Installation = mongoose.model('Installation');
  EntityNote = mongoose.model('EntityNote');
  AuditLog = mongoose.model('AuditLog');
  Role = mongoose.model('Role');
  User = mongoose.model('User');
});

afterEach(async () => { await clearTestDb(); });
afterAll(async () => { await disconnectTestDb(); });

let counter = 0;
function seq() { return ++counter; }

async function seedUser() {
  const role = await Role.create({ name: `R_${seq()}`, permissions: [] });
  return User.create({
    email: `u${seq()}@test.ch`,
    passwordHash: '$2b$04$dummyhashpaddedenoughtopassvalidation',
    firstName: 'T',
    lastName: 'U',
    role: role._id,
    status: 'active',
  });
}

async function seedCustomer(overrides = {}) {
  const user = overrides.createdBy || (await seedUser())._id;
  const n = seq();
  return Customer.create({
    customerNumber: `K-${10000 + n}`,
    name: `Customer ${n}`,
    type: 'business',
    street: 'Bahnhofstrasse 1',
    postalCode: '8001',
    city: 'Zürich',
    canton: 'ZH',
    country: 'CH',
    createdBy: user,
    ...overrides,
  });
}

async function seedSite(customerId, overrides = {}) {
  const user = overrides.createdBy || (await seedUser())._id;
  const n = seq();
  return Site.create({
    customerId,
    siteNumber: `S-${n}`,
    name: `Site ${n}`,
    postalCode: '3000',
    city: 'Bern',
    canton: 'BE',
    createdBy: user,
    ...overrides,
  });
}

describe('Customer Model', () => {
  test('creates a customer with required fields', async () => {
    const c = await seedCustomer();
    expect(c._id).toBeDefined();
    expect(c.status).toBe('active');
    expect(c.country).toBe('CH');
  });

  test('enforces unique customerNumber', async () => {
    await seedCustomer({ customerNumber: 'K-DUP' });
    await expect(seedCustomer({ customerNumber: 'K-DUP' })).rejects.toThrow();
  });

  test('soft-delete hides customer from default queries', async () => {
    const c = await seedCustomer();
    await Customer.findByIdAndUpdate(c._id, { isDeleted: true, deletedAt: new Date() });
    expect(await Customer.findById(c._id)).toBeNull();
  });

  test('archive sets status to archived', async () => {
    const c = await seedCustomer();
    await Customer.findByIdAndUpdate(c._id, { status: 'archived' });
    const found = await Customer.findById(c._id).lean();
    expect(found.status).toBe('archived');
  });
});

describe('Site Model', () => {
  test('creates a site linked to customer', async () => {
    const c = await seedCustomer();
    const s = await seedSite(c._id);
    expect(s.customerId.toString()).toBe(c._id.toString());
    expect(s.status).toBe('active');
  });

  test('default site type is residential', async () => {
    const c = await seedCustomer();
    const s = await seedSite(c._id);
    expect(s.siteType).toBe('residential');
  });
});

describe('Installation Model', () => {
  test('creates installation linked to site', async () => {
    const c = await seedCustomer();
    const s = await seedSite(c._id);
    const user = await seedUser();
    const i = await Installation.create({
      installationNumber: `I-${seq()}`,
      siteId: s._id,
      type: 'boiler',
      manufacturer: 'Viessmann',
      model: 'Vitodens 200-W',
      createdBy: user._id,
    });
    expect(i.status).toBe('active');
    expect(i.type).toBe('boiler');
  });

  test('decommission sets status and date', async () => {
    const c = await seedCustomer();
    const s = await seedSite(c._id);
    const user = await seedUser();
    const i = await Installation.create({
      installationNumber: `I-${seq()}`,
      siteId: s._id,
      type: 'heat_pump',
      createdBy: user._id,
    });
    const updated = await Installation.findByIdAndUpdate(
      i._id,
      { status: 'decommissioned', decommissionedDate: new Date(), decommissionReason: 'End of life' },
      { new: true },
    ).lean();
    expect(updated.status).toBe('decommissioned');
    expect(updated.decommissionReason).toBe('End of life');
  });
});

describe('EntityNote Model', () => {
  test('creates a note for a customer entity', async () => {
    const c = await seedCustomer();
    const user = await seedUser();
    const note = await EntityNote.create({
      entityType: 'customer',
      entityId: c._id,
      text: 'Important customer note',
      category: 'general',
      authorId: user._id,
      editableUntil: new Date(Date.now() + 86400000),
    });
    expect(note.entityType).toBe('customer');
    expect(note.text).toBe('Important customer note');
  });

  test('creates a note for a site entity', async () => {
    const c = await seedCustomer();
    const s = await seedSite(c._id);
    const user = await seedUser();
    const note = await EntityNote.create({
      entityType: 'site',
      entityId: s._id,
      text: 'Site access code: 1234',
      category: 'access_info',
      authorId: user._id,
      editableUntil: new Date(Date.now() + 86400000),
    });
    expect(note.category).toBe('access_info');
  });

  test('rejects invalid entityType', async () => {
    const user = await seedUser();
    await expect(EntityNote.create({
      entityType: 'INVALID',
      entityId: new mongoose.Types.ObjectId(),
      text: 'test',
      authorId: user._id,
      editableUntil: new Date(),
    })).rejects.toThrow();
  });

  test('soft-delete hides notes', async () => {
    const c = await seedCustomer();
    const user = await seedUser();
    const note = await EntityNote.create({
      entityType: 'customer',
      entityId: c._id,
      text: 'hidden note',
      authorId: user._id,
      editableUntil: new Date(Date.now() + 86400000),
    });
    await EntityNote.findByIdAndUpdate(note._id, { isDeleted: true, deletedAt: new Date() });
    expect(await EntityNote.findById(note._id)).toBeNull();
  });
});

describe('CRM Activity Queries', () => {
  test('site activity returns audit entries matching siteId', async () => {
    const siteId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    await AuditLog.create([
      { eventType: 'site.updated', userId, ipAddress: '::1', result: 'success', module: 'crm', details: { siteId } },
      { eventType: 'site.created', userId, ipAddress: '::1', result: 'success', module: 'crm', details: { siteId } },
      { eventType: 'customer.created', userId, ipAddress: '::1', result: 'success', module: 'crm', details: { customerId: new mongoose.Types.ObjectId() } },
    ]);
    const entries = await AuditLog.find({ module: 'crm', 'details.siteId': siteId }).lean();
    expect(entries).toHaveLength(2);
  });

  test('installation activity returns audit entries matching installationId', async () => {
    const installationId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    await AuditLog.create([
      { eventType: 'installation.updated', userId, ipAddress: '::1', result: 'success', module: 'crm', details: { installationId } },
      { eventType: 'site.created', userId, ipAddress: '::1', result: 'success', module: 'crm', details: { siteId: new mongoose.Types.ObjectId() } },
    ]);
    const entries = await AuditLog.find({ module: 'crm', 'details.installationId': installationId }).lean();
    expect(entries).toHaveLength(1);
  });
});
