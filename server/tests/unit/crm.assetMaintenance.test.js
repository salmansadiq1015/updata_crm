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

let Customer, Site, Installation, MaintenanceInterval, Assignment, Role, User;
let assetMaintenanceService, cacheManager;

beforeAll(async () => {
  await connectTestDb();
  await import('../../src/modules/auth/user.model.js');
  await import('../../src/modules/auth/role.model.js');
  await import('../../src/modules/auth/auditLog.model.js');
  await import('../../src/modules/crm/counter.model.js');
  await import('../../src/modules/crm/customer.model.js');
  await import('../../src/modules/crm/site.model.js');
  await import('../../src/modules/crm/contact.model.js');
  await import('../../src/modules/crm/installation.model.js');
  await import('../../src/modules/crm/maintenanceInterval.model.js');
  await import('../../src/modules/deploy/assignment.model.js');
  await import('../../src/modules/deploy/appointmentDetails.model.js');
  await import('../../src/modules/deploy/conflictRecord.model.js');
  await import('../../src/modules/deploy/employeeAvailability.model.js');

  Customer = mongoose.model('Customer');
  Site = mongoose.model('Site');
  Installation = mongoose.model('Installation');
  MaintenanceInterval = mongoose.model('MaintenanceInterval');
  Assignment = mongoose.model('Assignment');
  Role = mongoose.model('Role');
  User = mongoose.model('User');

  ({ default: assetMaintenanceService } = await import('../../src/modules/crm/assetMaintenance.service.js'));
  ({ default: cacheManager } = await import('../../src/shared/cache/CacheManager.js'));
}, 180000);

afterEach(async () => {
  cacheManager?.l1?.flush();
  await clearTestDb();
});

afterAll(async () => {
  await disconnectTestDb();
});

let counter = 0;
function seq() {
  counter += 1;
  return counter;
}

async function seedUser(overrides = {}) {
  const n = seq();
  const role = await Role.create({ name: `Role_${n}`, permissions: [] });
  return User.create({
    email: `user${n}@test.ch`,
    passwordHash: '$2b$04$dummyhashpaddedenoughtopassvalidation',
    firstName: overrides.firstName || 'Test',
    lastName: overrides.lastName || `User${n}`,
    role: role._id,
    status: 'active',
    ...overrides,
  });
}

async function seedAssetGraph({ customerName = 'Alpha Kunde', maintenanceStatus = 'due', employee } = {}) {
  const createdBy = (await seedUser())._id;
  const n = seq();
  const customer = await Customer.create({
    customerNumber: `K-AM-${n}`,
    name: customerName,
    type: 'business',
    email: `customer${n}@test.ch`,
    phone: '+410000000',
    createdBy,
  });
  const site = await Site.create({
    customerId: customer._id,
    siteNumber: `S-AM-${n}`,
    name: `Site ${n}`,
    city: 'Bern',
    createdBy,
  });
  const installation = await Installation.create({
    installationNumber: `I-AM-${n}`,
    siteId: site._id,
    type: 'boiler',
    manufacturer: 'Viessmann',
    model: `Model ${n}`,
    status: 'active',
    createdBy,
  });
  const interval = await MaintenanceInterval.create({
    installationId: installation._id,
    maintenanceType: 'annual_service',
    frequencyMonths: 12,
    lastServiceDate: new Date('2025-01-01T00:00:00Z'),
    nextDueDate: new Date('2026-01-01T00:00:00Z'),
    maintenanceStatus,
  });

  if (employee) {
    await Assignment.create({
      assignmentNumber: `ASN-TEST-${n}`,
      employeeId: employee._id,
      assignmentType: 'MAINTENANCE',
      title: 'Existing maintenance',
      startDatetime: new Date('2026-02-01T08:00:00Z'),
      endDatetime: new Date('2026-02-01T10:00:00Z'),
      status: 'PLANNED',
      customerId: customer._id,
      siteId: site._id,
      installationId: installation._id,
      maintenanceIntervalId: interval._id,
      createdBy,
    });
  }

  return { customer, site, installation, interval, createdBy };
}

describe('CRM asset maintenance unified workflow', () => {
  test('lists installation and maintenance work items with customer and technician filters', async () => {
    const technician = await seedUser({ firstName: 'Tech', lastName: 'One' });
    await seedAssetGraph({ customerName: 'Alpha Kunde', maintenanceStatus: 'due', employee: technician });
    await seedAssetGraph({ customerName: 'Beta Kunde', maintenanceStatus: 'due' });

    const result = await assetMaintenanceService.listWorkItems({
      customerSearch: 'Alpha',
      maintenanceStatus: 'due',
      technicianId: technician._id,
      limit: 25,
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].customer.name).toBe('Alpha Kunde');
    expect(String(result.data[0].assignment.employeeId)).toBe(String(technician._id));
    expect(result.data[0].maintenance.maintenanceStatus).toBe('due');
  });

  test('schedules a maintenance interval and links the assignment back to the interval', async () => {
    const dispatcher = await seedUser({ firstName: 'Dispatcher', lastName: 'One' });
    const technician = await seedUser({ firstName: 'Tech', lastName: 'Two' });
    const { installation, interval } = await seedAssetGraph({ customerName: 'Schedule Kunde', maintenanceStatus: 'overdue' });

    const result = await assetMaintenanceService.schedule({
      maintenanceIntervalIds: [interval._id],
      employeeIds: [technician._id],
      startDatetime: new Date('2026-03-01T08:00:00Z'),
      endDatetime: new Date('2026-03-01T10:00:00Z'),
      isCustomerAppointment: false,
    }, dispatcher._id);

    expect(result.created).toHaveLength(1);

    const assignment = await Assignment.findOne({ maintenanceIntervalId: interval._id }).lean();
    expect(assignment).toBeTruthy();
    expect(String(assignment.installationId)).toBe(String(installation._id));
    expect(String(assignment.employeeId)).toBe(String(technician._id));

    const updatedInterval = await MaintenanceInterval.findById(interval._id).lean();
    expect(updatedInterval.maintenanceStatus).toBe('scheduled');
    expect(String(updatedInterval.linkedServiceOrderId)).toBe(String(assignment._id));
  });
});
