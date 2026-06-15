import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';
import { PERMISSIONS } from '../../src/shared/constants/roles.js';

let Customer, Site, Installation, MaintenanceInterval, MaintenanceSettings, EntityNote, EntityImage, SparePart, AuditLog, Permission, Role, User;
let customerService, contactService, siteService, installationService, maintenanceIntervalService;
let maintenanceSettingsService, entityNoteService, entityImageService, sparePartService, cacheManager, eventBus;
let MaintenanceCheckWorker;
let appConfig;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const crmModuleDir = path.resolve(__dirname, '../../src/modules/crm');

beforeAll(async () => {
  await connectTestDb();
  await import('../../src/modules/auth/user.model.js');
  await import('../../src/modules/auth/role.model.js');
  await import('../../src/modules/auth/permission.model.js');
  await import('../../src/modules/auth/auditLog.model.js');
  await import('../../src/modules/crm/customer.model.js');
  await import('../../src/modules/crm/site.model.js');
  await import('../../src/modules/crm/installation.model.js');
  await import('../../src/modules/crm/maintenanceInterval.model.js');
  await import('../../src/modules/crm/maintenanceSettings.model.js');
  await import('../../src/modules/crm/entityNote.model.js');
  await import('../../src/modules/crm/entityImage.model.js');
  await import('../../src/modules/crm/sparePart.model.js');
  Customer = mongoose.model('Customer');
  Site = mongoose.model('Site');
  Installation = mongoose.model('Installation');
  MaintenanceInterval = mongoose.model('MaintenanceInterval');
  MaintenanceSettings = mongoose.model('MaintenanceSettings');
  EntityNote = mongoose.model('EntityNote');
  EntityImage = mongoose.model('EntityImage');
  SparePart = mongoose.model('SparePart');
  AuditLog = mongoose.model('AuditLog');
  Permission = mongoose.model('Permission');
  Role = mongoose.model('Role');
  User = mongoose.model('User');
  ({ default: customerService } = await import('../../src/modules/crm/customer.service.js'));
  ({ default: contactService } = await import('../../src/modules/crm/contact.service.js'));
  ({ default: siteService } = await import('../../src/modules/crm/site.service.js'));
  ({ default: installationService } = await import('../../src/modules/crm/installation.service.js'));
  ({ default: maintenanceIntervalService } = await import('../../src/modules/crm/maintenanceInterval.service.js'));
  ({ default: maintenanceSettingsService } = await import('../../src/modules/crm/maintenanceSettings.service.js'));
  ({ default: entityNoteService } = await import('../../src/modules/crm/entityNote.service.js'));
  ({ default: entityImageService } = await import('../../src/modules/crm/entityImage.service.js'));
  ({ default: sparePartService } = await import('../../src/modules/crm/sparePart.service.js'));
  ({ default: cacheManager } = await import('../../src/shared/cache/CacheManager.js'));
  ({ default: eventBus } = await import('../../src/shared/events/EventBus.js'));
  ({ MaintenanceCheckWorker } = await import('../../src/jobs/maintenanceCheck.job.js'));
  ({ default: appConfig } = await import('../../src/config/index.js'));
});

afterEach(async () => {
  jest.restoreAllMocks();
  cacheManager.l1.flush();
  await clearTestDb();
});
afterAll(async () => { await disconnectTestDb(); });

let counter = 0;
function seq() { return ++counter; }

function collectRouteFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return collectRouteFiles(fullPath);
    }
    return entry.isFile() && entry.name.endsWith('.routes.js') ? [fullPath] : [];
  });
}

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

async function seedSchedulingRecipient() {
  const permission = await Permission.create({
    module: 'scheduling',
    action: 'read',
    description: 'Read scheduling dashboard',
  });
  const role = await Role.create({ name: `Scheduler_${seq()}`, permissions: [permission._id] });
  return User.create({
    email: `scheduler${seq()}@test.ch`,
    passwordHash: '$2b$04$dummyhashpaddedenoughtopassvalidation',
    firstName: 'Schedule',
    lastName: 'User',
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
      { returnDocument: 'after' },
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

describe('CRM Note and Image Contracts', () => {
  test('notes cannot be updated after the 24-hour edit window', async () => {
    const user = await seedUser();
    const customer = await seedCustomer({ createdBy: user._id });
    const note = await EntityNote.create({
      entityType: 'customer',
      entityId: customer._id,
      text: 'Locked note',
      authorId: user._id,
      editableUntil: new Date(Date.now() - 1000),
    });

    await expect(entityNoteService.update(note._id, { text: 'Changed' }, user._id))
      .rejects
      .toThrow('Note can only be edited within 24 hours of creation');
  });

  test('image upload is rejected once an entity already has 50 images', async () => {
    const user = await seedUser();
    const customer = await seedCustomer({ createdBy: user._id });
    const existingImages = Array.from({ length: 50 }, (_, index) => ({
      entityType: 'customer',
      entityId: customer._id,
      fileId: new mongoose.Types.ObjectId(),
      sortOrder: index,
      uploadedBy: user._id,
    }));
    await EntityImage.insertMany(existingImages);

    await expect(entityImageService.create('customer', customer._id, {
      buffer: Buffer.from('not used because cap is checked first'),
      originalName: 'blocked.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 16,
    }, user._id))
      .rejects
      .toThrow('Maximum of 50 images per entity reached');
  });
});

describe('CRM Spare Part Import Contracts', () => {
  test('spare part CSV import creates rows and upserts existing rows when requested', async () => {
    const user = await seedUser();
    const initialCsv = Buffer.from([
      'PartNumber;Name;Category;Manufacturer;CurrentStock;MinStockLevel',
      'SP-1001;Water filter;filter;Hoval;3;1',
    ].join('\n'));
    const created = await sparePartService.importCsv(initialCsv, { upsert: false }, user._id);

    expect(created).toMatchObject({ processed: 1, created: 1, updated: 0, failed: 0 });

    const updateCsv = Buffer.from([
      'PartNumber;Name;Category;Manufacturer;CurrentStock;MinStockLevel',
      'SP-1001;Water filter premium;filter;Hoval;7;2',
    ].join('\n'));
    const updated = await sparePartService.importCsv(updateCsv, { upsert: true }, user._id);
    const stored = await SparePart.findOne({ partNumber: 'SP-1001' }).lean();

    expect(updated.processed).toBe(1);
    expect(updated.updated).toBe(1);
    expect(stored).toMatchObject({
      name: 'Water filter premium',
      currentStock: 7,
      minStockLevel: 2,
    });
  });

  test('spare part CSV import rejects invalid rows before writing', async () => {
    const user = await seedUser();
    const invalidCsv = Buffer.from([
      'PartNumber;Name;Category;CurrentStock',
      'SP-1002;Broken row;invalid_category;4',
    ].join('\n'));

    await expect(sparePartService.importCsv(invalidCsv, { upsert: false }, user._id))
      .rejects
      .toThrow('Invalid spare parts CSV');
    expect(await SparePart.countDocuments()).toBe(0);
  });

  test('linked installation spare part can be flagged for ordering', async () => {
    const user = await seedUser();
    const customer = await seedCustomer({ createdBy: user._id });
    const site = await seedSite(customer._id, { createdBy: user._id });
    const installation = await Installation.create({
      installationNumber: `I-${seq()}`,
      siteId: site._id,
      type: 'boiler',
      manufacturer: 'Hoval',
      model: 'UltraGas',
      createdBy: user._id,
    });
    const sparePart = await sparePartService.create({
      partNumber: `SP-${seq()}`,
      name: 'Ignition electrode',
      category: 'igniter',
      manufacturer: 'Hoval',
      currentStock: 0,
    }, user._id);

    await sparePartService.linkToInstallation({
      installationId: installation._id,
      sparePartId: sparePart._id,
      quantity: 1,
    }, user._id);

    const flagged = await sparePartService.flagForOrdering(
      installation._id,
      sparePart._id,
      { quantity: 2, urgency: 'urgent', notes: 'Failed during service visit' },
      user._id,
    );
    const linked = await sparePartService.getByInstallation(installation._id);

    expect(flagged).toMatchObject({
      needsOrdering: true,
      orderQuantity: 2,
      orderUrgency: 'urgent',
      orderStatus: 'requested',
    });
    expect(linked[0]).toMatchObject({
      needsOrdering: true,
      orderQuantity: 2,
    });
  });

  test('duplicate installation spare-part links return a conflict error', async () => {
    const user = await seedUser();
    const customer = await seedCustomer({ createdBy: user._id });
    const site = await seedSite(customer._id, { createdBy: user._id });
    const installation = await Installation.create({
      installationNumber: `I-${seq()}`,
      siteId: site._id,
      type: 'boiler',
      manufacturer: 'Hoval',
      model: 'UltraGas',
      createdBy: user._id,
    });
    const sparePart = await sparePartService.create({
      partNumber: `SP-${seq()}`,
      name: 'Gas valve',
      category: 'valve',
      manufacturer: 'Hoval',
    }, user._id);
    const payload = {
      installationId: installation._id,
      sparePartId: sparePart._id,
      quantity: 1,
    };

    await sparePartService.linkToInstallation(payload, user._id);
    await expect(sparePartService.linkToInstallation(payload, user._id))
      .rejects
      .toThrow('Spare part is already linked to this installation');
  });

  test('procurement dashboard lists open requests and receiving updates inventory', async () => {
    const user = await seedUser();
    const customer = await seedCustomer({ createdBy: user._id });
    const site = await seedSite(customer._id, { createdBy: user._id });
    const installation = await Installation.create({
      installationNumber: `I-${seq()}`,
      siteId: site._id,
      type: 'boiler',
      manufacturer: 'Hoval',
      model: 'UltraGas',
      createdBy: user._id,
    });
    const sparePart = await sparePartService.create({
      partNumber: `SP-${seq()}`,
      name: 'Burner gasket',
      category: 'gasket',
      manufacturer: 'Hoval',
      currentStock: 1,
    }, user._id);

    await sparePartService.linkToInstallation({
      installationId: installation._id,
      sparePartId: sparePart._id,
      quantity: 1,
    }, user._id);
    await sparePartService.flagForOrdering(
      installation._id,
      sparePart._id,
      { quantity: 3, urgency: 'high' },
      user._id,
    );

    const open = await sparePartService.listOrderRequests({ status: 'open', limit: 10 });
    expect(open.data).toHaveLength(1);
    expect(open.data[0]).toMatchObject({
      orderStatus: 'requested',
      orderQuantity: 3,
      orderUrgency: 'high',
    });

    const received = await sparePartService.updateOrderStatus(
      installation._id,
      sparePart._id,
      { status: 'received', receivedQuantity: 3 },
      user._id,
    );
    const stocked = await SparePart.findById(sparePart._id).lean();
    const afterReceive = await sparePartService.listOrderRequests({ status: 'open', limit: 10 });

    expect(received).toMatchObject({
      needsOrdering: false,
      orderStatus: 'received',
    });
    expect(stocked.currentStock).toBe(4);
    expect(afterReceive.data).toHaveLength(0);
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

describe('CRM Route Permissions', () => {
  test('all crm route guards use seeded permission constants', () => {
    const routeFiles = collectRouteFiles(crmModuleDir);
    const knownPermissions = new Set(Object.values(PERMISSIONS));
    const guardedPermissions = new Set();

    for (const routeFile of routeFiles) {
      const source = readFileSync(routeFile, 'utf8');
      for (const match of source.matchAll(/requirePermission\(['"`](crm:[^'"`]+)['"`]\)/g)) {
        guardedPermissions.add(match[1]);
      }
    }

    expect(routeFiles.length).toBeGreaterThan(0);
    expect([...guardedPermissions].sort()).toEqual([
      'crm:admin',
      'crm:delete',
      'crm:read',
      'crm:write',
    ]);
    for (const permission of guardedPermissions) {
      expect(knownPermissions.has(permission)).toBe(true);
    }
  });
});

describe('CRM Service Contracts', () => {
  test('customer creation surfaces duplicate warnings while allowing save', async () => {
    const user = await seedUser();
    await customerService.create({
      name: 'Meier Immobilien AG',
      type: 'business',
      street: 'Bahnhofstrasse 1',
      postalCode: '8001',
      city: 'Zürich',
      canton: 'ZH',
      phone: '+41 44 123 45 67',
      email: 'info@meier.test',
    }, user._id);

    const duplicate = await customerService.create({
      name: 'Meier Immobilien AG',
      type: 'business',
      street: 'Bahnhofstrasse 2',
      postalCode: '8001',
      city: 'Zürich',
      canton: 'ZH',
    }, user._id);

    expect(duplicate.customerNumber).toMatch(/^K-\d{5}$/);
    expect(duplicate.duplicateWarning).toBe(true);
    expect(duplicate.duplicateCandidates).toHaveLength(1);
  });

  test('customer list includes page-scoped site, installation, and last service computed fields', async () => {
    const user = await seedUser();
    const customer = await seedCustomer({ createdBy: user._id });
    const site = await seedSite(customer._id, { createdBy: user._id });
    const installation = await Installation.create({
      installationNumber: 'A-99991',
      siteId: site._id,
      type: 'boiler',
      manufacturer: 'Viessmann',
      model: 'Vitodens 200-W',
      createdBy: user._id,
    });
    await MaintenanceInterval.create({
      installationId: installation._id,
      maintenanceType: 'annual_service',
      frequencyMonths: 12,
      lastServiceDate: new Date('2026-01-15T00:00:00.000Z'),
      nextDueDate: new Date('2027-01-15T00:00:00.000Z'),
      maintenanceStatus: 'ok',
    });

    const result = await customerService.list({ limit: 25, sortBy: 'createdAt', sortOrder: 'desc' });
    const listed = result.data.find((row) => String(row._id) === String(customer._id));

    expect(listed).toMatchObject({
      totalSitesCount: 1,
      totalInstallationsCount: 1,
    });
    expect(new Date(listed.lastServiceDate).toISOString()).toBe('2026-01-15T00:00:00.000Z');
  });

  test('customer merge reassigns contacts and sites then archives the duplicate', async () => {
    const user = await seedUser();
    const source = await seedCustomer({ createdBy: user._id, name: 'Duplicate AG', customerNumber: 'K-91001' });
    const target = await seedCustomer({ createdBy: user._id, name: 'Survivor AG', customerNumber: 'K-91002' });
    const contact = await contactService.create(source._id, {
      firstName: 'Anna',
      lastName: 'Meier',
      email: 'anna.meier@example.test',
    }, user._id);
    const site = await seedSite(source._id, { createdBy: user._id });

    await customerService.merge(source._id, target._id, user._id);

    const [archivedSource, movedContact, movedSite] = await Promise.all([
      Customer.findById(source._id).lean(),
      mongoose.model('Contact').findById(contact._id).lean(),
      Site.findById(site._id).lean(),
    ]);

    expect(archivedSource.status).toBe('archived');
    expect(String(archivedSource.mergedIntoId)).toBe(String(target._id));
    expect(String(movedContact.customerId)).toBe(String(target._id));
    expect(String(movedSite.customerId)).toBe(String(target._id));
  });

  test('contact primary changes keep exactly one primary contact per customer', async () => {
    const user = await seedUser();
    const customer = await seedCustomer({ createdBy: user._id });

    const first = await contactService.create(customer._id, {
      firstName: 'First',
      lastName: 'Contact',
    }, user._id);
    const second = await contactService.create(customer._id, {
      firstName: 'Second',
      lastName: 'Contact',
      isPrimary: true,
    }, user._id);

    const contacts = await mongoose.model('Contact').find({ customerId: customer._id }).lean();
    expect(contacts.filter((contact) => contact.isPrimary)).toHaveLength(1);
    expect(contacts.find((contact) => String(contact._id) === String(first._id)).isPrimary).toBe(false);
    expect(contacts.find((contact) => String(contact._id) === String(second._id)).isPrimary).toBe(true);
  });

  test('contact overview filters by customer type and includes relationship counts', async () => {
    const user = await seedUser();
    const [Project, Quotation, Order] = await Promise.all([
      import('../../src/modules/pm/project.model.js').then((module) => module.default),
      import('../../src/modules/qop/quotation.model.js').then((module) => module.default),
      import('../../src/modules/qop/order.model.js').then((module) => module.default),
    ]);
    const privateCustomer = await seedCustomer({
      createdBy: user._id,
      name: 'Jonas Mueller',
      type: 'private',
      customerNumber: 'K-92001',
    });
    const businessCustomer = await seedCustomer({
      createdBy: user._id,
      name: 'Meier Immobilien AG',
      type: 'business',
      customerNumber: 'K-92002',
    });

    await contactService.create(privateCustomer._id, {
      firstName: 'Jonas',
      lastName: 'Mueller',
      email: 'jonas@example.test',
    }, user._id);
    const businessContact = await contactService.create(businessCustomer._id, {
      firstName: 'Anna',
      lastName: 'Meier',
      email: 'anna@meier.example.test',
    }, user._id);

    await Project.create({
      projectNumber: 'P-92002',
      name: 'Heating replacement',
      projectType: 'RENOVATION',
      customerId: businessCustomer._id,
      projectManagerId: user._id,
      createdBy: user._id,
    });
    await Quotation.create({
      quotationNumber: 'ANG-92002',
      customerId: businessCustomer._id,
      customerName: businessCustomer.name,
      contactId: businessContact._id,
      validUntil: new Date(Date.now() + 86400000),
      createdBy: user._id,
    });
    await Order.create({
      orderNumber: 'AUF-92002',
      customerId: businessCustomer._id,
      customerName: businessCustomer.name,
      contactId: businessContact._id,
      createdBy: user._id,
    });

    const result = await contactService.listOverview({ type: 'business', limit: 10 });

    expect(result.summary).toMatchObject({ total: 2, private: 1, business: 1 });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      firstName: 'Anna',
      contactType: 'business',
      related: {
        projectCount: 1,
        quotationCount: 1,
        orderCount: 1,
        directQuotationCount: 1,
        directOrderCount: 1,
      },
    });
    expect(result.data[0].customer).toMatchObject({
      name: 'Meier Immobilien AG',
      type: 'business',
    });
  });

  test('archiving a primary contact promotes another customer contact', async () => {
    const user = await seedUser();
    const customer = await seedCustomer({ createdBy: user._id });
    const first = await contactService.create(customer._id, {
      firstName: 'Primary',
      lastName: 'Contact',
    }, user._id);
    const second = await contactService.create(customer._id, {
      firstName: 'Backup',
      lastName: 'Contact',
    }, user._id);

    await contactService.delete(first._id, user._id);

    const [archived, promoted] = await Promise.all([
      mongoose.model('Contact').findById(first._id).setOptions({ includeDeleted: true }).lean(),
      mongoose.model('Contact').findById(second._id).lean(),
    ]);
    expect(archived.isDeleted).toBe(true);
    expect(promoted.isPrimary).toBe(true);
  });

  test('site creation rejects archived customers', async () => {
    const user = await seedUser();
    const customer = await seedCustomer({ createdBy: user._id, status: 'archived' });

    await expect(siteService.create(customer._id, {
      name: 'Archived customer site',
      street: 'Hauptstrasse 1',
      postalCode: '3000',
      city: 'Bern',
    }, user._id)).rejects.toThrow('Cannot create a site for an archived customer');
  });

  test('site deactivation cascades active installations out of active maintenance', async () => {
    const user = await seedUser();
    const customer = await seedCustomer({ createdBy: user._id });
    const site = await seedSite(customer._id, { createdBy: user._id });
    const installation = await Installation.create({
      installationNumber: 'A-99992',
      siteId: site._id,
      type: 'heat_pump',
      manufacturer: 'CTA',
      model: 'Aeroheat',
      createdBy: user._id,
    });
    await MaintenanceInterval.create({
      installationId: installation._id,
      maintenanceType: 'annual_service',
      frequencyMonths: 12,
      nextDueDate: new Date('2026-06-01T00:00:00.000Z'),
      maintenanceStatus: 'due',
    });

    await siteService.deactivate(site._id, user._id);

    const [updatedSite, updatedInstallation, updatedInterval] = await Promise.all([
      Site.findById(site._id).lean(),
      Installation.findById(installation._id).lean(),
      MaintenanceInterval.findOne({ installationId: installation._id }).lean(),
    ]);

    expect(updatedSite.status).toBe('inactive');
    expect(updatedInstallation.status).toBe('decommissioned');
    expect(updatedInstallation.decommissionReason).toBe('Site deactivated');
    expect(updatedInterval.maintenanceStatus).toBe('ok');
  });

  test('installation creation applies default maintenance template by type', async () => {
    const user = await seedUser();
    const customer = await seedCustomer({ createdBy: user._id });
    const site = await seedSite(customer._id, { createdBy: user._id });

    // Use a relative commissioning date so nextDueDate (=+6 months) always sits
    // outside the 30-day "due" lookahead window — otherwise the test ages into a
    // 'due' status once "now" comes within 30 days of a hardcoded due date.
    const commissioningDate = new Date();
    commissioningDate.setUTCHours(0, 0, 0, 0);
    const installation = await installationService.create(site._id, {
      type: 'ventilation',
      manufacturer: 'Zehnder',
      model: 'ComfoAir',
      commissioningDate,
    }, user._id);

    const intervals = await MaintenanceInterval.find({ installationId: installation._id }).lean();
    expect(intervals).toHaveLength(1);
    expect(intervals[0]).toMatchObject({
      maintenanceType: 'filter_change',
      frequencyMonths: 6,
      maintenanceStatus: 'ok',
    });
    // Mirror the service's _calculateNextDueDate (setMonth + frequencyMonths) exactly.
    const expectedDue = new Date(commissioningDate);
    expectedDue.setMonth(expectedDue.getMonth() + 6);
    expect(new Date(intervals[0].nextDueDate).toISOString()).toBe(expectedDue.toISOString());
  });

  test('maintenance creation uses commissioning date when no last service date exists', async () => {
    const user = await seedUser();
    const customer = await seedCustomer({ createdBy: user._id });
    const site = await seedSite(customer._id, { createdBy: user._id });
    const installation = await Installation.create({
      installationNumber: 'A-99993',
      siteId: site._id,
      type: 'boiler',
      manufacturer: 'Hoval',
      model: 'UltraGas',
      commissioningDate: new Date('2026-02-10T00:00:00.000Z'),
      createdBy: user._id,
    });

    const interval = await maintenanceIntervalService.create(installation._id, {
      maintenanceType: 'annual_service',
      frequencyMonths: 12,
    }, user._id);

    expect(interval.lastServiceDate).toBeNull();
    expect(new Date(interval.nextDueDate).toISOString()).toBe('2027-02-10T00:00:00.000Z');
  });

  test('maintenance settings persist the escalation threshold', async () => {
    const user = await seedUser();

    const initial = await maintenanceSettingsService.getSettings();
    const updated = await maintenanceSettingsService.updateSettings({ escalationDays: 12 }, user._id);
    const stored = await MaintenanceSettings.findOne({ key: 'default' }).lean();

    expect(initial.escalationDays).toBe(appConfig.maintenance.escalationDays);
    expect(updated).toMatchObject({ escalationDays: 12 });
    expect(String(stored.updatedBy)).toBe(String(user._id));
    expect(stored.escalationDays).toBe(12);
  });

  test('maintenance overdue list filters by status and active installations', async () => {
    const user = await seedUser();
    const customer = await seedCustomer({ createdBy: user._id });
    const site = await seedSite(customer._id, { createdBy: user._id });
    const activeInstallation = await Installation.create({
      installationNumber: 'A-99996',
      siteId: site._id,
      type: 'boiler',
      manufacturer: 'Hoval',
      model: 'UltraGas',
      createdBy: user._id,
    });
    const decommissionedInstallation = await Installation.create({
      installationNumber: 'A-99997',
      siteId: site._id,
      type: 'boiler',
      manufacturer: 'Hoval',
      model: 'UltraGas',
      status: 'decommissioned',
      createdBy: user._id,
    });

    const overdueDate = new Date();
    overdueDate.setDate(overdueDate.getDate() - 7);
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);

    const [activeOverdue] = await MaintenanceInterval.create([
      {
        installationId: activeInstallation._id,
        maintenanceType: 'annual_service',
        frequencyMonths: 12,
        nextDueDate: overdueDate,
        maintenanceStatus: 'overdue',
      },
      {
        installationId: activeInstallation._id,
        maintenanceType: 'filter_change',
        frequencyMonths: 6,
        nextDueDate: dueDate,
        maintenanceStatus: 'due',
      },
      {
        installationId: decommissionedInstallation._id,
        maintenanceType: 'general_inspection',
        frequencyMonths: 24,
        nextDueDate: overdueDate,
        maintenanceStatus: 'overdue',
      },
    ]);

    const result = await maintenanceIntervalService.listOverdue({ limit: 25 });

    expect(result.data.map((interval) => String(interval._id))).toEqual([String(activeOverdue._id)]);
  });

  test('maintenance check marks intervals idempotently while skipping linked service work', async () => {
    const user = await seedUser();
    const schedulingRecipient = await seedSchedulingRecipient();
    const customer = await seedCustomer({ createdBy: user._id });
    const site = await seedSite(customer._id, { createdBy: user._id });
    const installation = await Installation.create({
      installationNumber: 'A-99994',
      siteId: site._id,
      type: 'boiler',
      manufacturer: 'Hoval',
      model: 'UltraGas',
      createdBy: user._id,
    });
    const now = new Date();
    const inTenDays = new Date(now);
    inTenDays.setDate(inTenDays.getDate() + 10);
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const inNinetyDays = new Date(now);
    inNinetyDays.setDate(inNinetyDays.getDate() + 90);

    await MaintenanceInterval.create([
      {
        installationId: installation._id,
        maintenanceType: 'annual_service',
        frequencyMonths: 12,
        nextDueDate: inTenDays,
        maintenanceStatus: 'ok',
      },
      {
        installationId: installation._id,
        maintenanceType: 'filter_change',
        frequencyMonths: 6,
        nextDueDate: yesterday,
        maintenanceStatus: 'due',
      },
      {
        installationId: installation._id,
        maintenanceType: 'general_inspection',
        frequencyMonths: 24,
        nextDueDate: inNinetyDays,
        maintenanceStatus: 'ok',
      },
      {
        installationId: installation._id,
        maintenanceType: 'chimney_sweep',
        frequencyMonths: 12,
        nextDueDate: yesterday,
        maintenanceStatus: 'ok',
        linkedServiceOrderId: new mongoose.Types.ObjectId(),
      },
    ]);
    const publish = jest.spyOn(eventBus, 'publish');
    const worker = new MaintenanceCheckWorker();

    const firstRun = await worker.process({});
    const secondRun = await worker.process({});
    const statuses = await MaintenanceInterval.find({ installationId: installation._id })
      .sort({ maintenanceType: 1 })
      .lean();

    expect(firstRun).toEqual({ updatedDue: 1, updatedOverdue: 1 });
    expect(secondRun).toEqual({ updatedDue: 0, updatedOverdue: 0 });
    expect(statuses.map((interval) => [interval.maintenanceType, interval.maintenanceStatus])).toEqual([
      ['annual_service', 'due'],
      ['chimney_sweep', 'ok'],
      ['filter_change', 'overdue'],
      ['general_inspection', 'ok'],
    ]);
    expect(publish).toHaveBeenCalledWith(
      'maintenance.overdue',
      {
        count: 1,
        assignedTo: [schedulingRecipient._id],
      },
      { source: 'jobs:maintenance-check' },
    );
    expect(publish).toHaveBeenCalledWith(
      'maintenance.due',
      {
        count: 1,
        assignedTo: [schedulingRecipient._id],
      },
      { source: 'jobs:maintenance-check' },
    );
  });

  test('maintenance check honors persisted escalation threshold', async () => {
    const user = await seedUser();
    await MaintenanceSettings.create({ escalationDays: 5, updatedBy: user._id });
    const customer = await seedCustomer({ createdBy: user._id });
    const site = await seedSite(customer._id, { createdBy: user._id });
    const installation = await Installation.create({
      installationNumber: 'A-99998',
      siteId: site._id,
      type: 'boiler',
      manufacturer: 'Hoval',
      model: 'UltraGas',
      createdBy: user._id,
    });
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const [shouldEscalate, shouldWait] = await MaintenanceInterval.create([
      {
        installationId: installation._id,
        maintenanceType: 'annual_service',
        frequencyMonths: 12,
        nextDueDate: tenDaysAgo,
        maintenanceStatus: 'overdue',
        escalated: false,
      },
      {
        installationId: installation._id,
        maintenanceType: 'filter_change',
        frequencyMonths: 6,
        nextDueDate: threeDaysAgo,
        maintenanceStatus: 'overdue',
        escalated: false,
      },
    ]);
    const publish = jest.spyOn(eventBus, 'publish');
    const worker = new MaintenanceCheckWorker();

    const result = await worker.process({});
    const [escalatedInterval, waitingInterval] = await Promise.all([
      MaintenanceInterval.findById(shouldEscalate._id).lean(),
      MaintenanceInterval.findById(shouldWait._id).lean(),
    ]);

    expect(result).toEqual({ updatedDue: 0, updatedOverdue: 0 });
    expect(escalatedInterval.escalated).toBe(true);
    expect(waitingInterval.escalated).toBe(false);
    expect(publish).toHaveBeenCalledWith(
      'maintenance.escalated',
      {
        count: 1,
        daysOverdue: 5,
        assignedTo: [],
      },
      { source: 'jobs:maintenance-check' },
    );
  });

  test('maintenance check honors the configured lookahead window', async () => {
    const originalLookaheadDays = appConfig.maintenance.lookaheadDays;
    appConfig.maintenance.lookaheadDays = 5;
    try {
      const user = await seedUser();
      const customer = await seedCustomer({ createdBy: user._id });
      const site = await seedSite(customer._id, { createdBy: user._id });
      const installation = await Installation.create({
        installationNumber: 'A-99995',
        siteId: site._id,
        type: 'boiler',
        manufacturer: 'Hoval',
        model: 'UltraGas',
        createdBy: user._id,
      });
      const inTenDays = new Date();
      inTenDays.setDate(inTenDays.getDate() + 10);
      await MaintenanceInterval.create({
        installationId: installation._id,
        maintenanceType: 'annual_service',
        frequencyMonths: 12,
        nextDueDate: inTenDays,
        maintenanceStatus: 'ok',
      });

      const worker = new MaintenanceCheckWorker();
      const result = await worker.process({});
      const interval = await MaintenanceInterval.findOne({ installationId: installation._id }).lean();

      expect(result).toEqual({ updatedDue: 0, updatedOverdue: 0 });
      expect(interval.maintenanceStatus).toBe('ok');
    } finally {
      appConfig.maintenance.lookaheadDays = originalLookaheadDays;
    }
  });
});
