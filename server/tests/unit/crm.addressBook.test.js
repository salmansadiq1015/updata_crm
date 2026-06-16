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

let Customer, Contact, Site, Project, Order, Assignment, User, Role;
let addressBookService;

beforeAll(async () => {
  await connectTestDb();
  await import('../../src/modules/auth/user.model.js');
  await import('../../src/modules/auth/role.model.js');
  await import('../../src/modules/crm/customer.model.js');
  await import('../../src/modules/crm/contact.model.js');
  await import('../../src/modules/crm/site.model.js');
  await import('../../src/modules/pm/project.model.js');
  await import('../../src/modules/qop/order.model.js');
  await import('../../src/modules/deploy/assignment.model.js');

  Customer = mongoose.model('Customer');
  Contact = mongoose.model('Contact');
  Site = mongoose.model('Site');
  Project = mongoose.model('Project');
  Order = mongoose.model('Order');
  Assignment = mongoose.model('Assignment');
  User = mongoose.model('User');
  Role = mongoose.model('Role');
  ({ default: addressBookService } = await import('../../src/modules/crm/addressBook.service.js'));
});

afterEach(async () => {
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

async function seedUser() {
  const role = await Role.create({ name: `AddressBookRole${seq()}`, permissions: [] });
  return User.create({
    email: `address.book.${seq()}@test.ch`,
    passwordHash: '$2b$04$dummyhashpaddedenoughtopassvalidation',
    firstName: 'Address',
    lastName: 'Tester',
    role: role._id,
    status: 'active',
  });
}

async function seedAddressBookGraph() {
  const user = await seedUser();
  const n = seq();
  const customer = await Customer.create({
    customerNumber: `K-AB-${n}`,
    name: `Address Customer ${n} AG`,
    ownerName: 'Owner Example',
    type: 'business',
    street: 'Billingstrasse 10',
    postalCode: '8001',
    city: 'Zuerich',
    canton: 'ZH',
    country: 'CH',
    phone: '+41441234567',
    email: `billing.${n}@example.test`,
    createdBy: user._id,
  });
  const contact = await Contact.create({
    customerId: customer._id,
    firstName: 'Sabrina',
    lastName: `Schmid${n}`,
    functionTitle: 'Facility Manager',
    mobile: '+41791234567',
    email: `sabrina.${n}@example.test`,
    isPrimary: true,
  });
  const site = await Site.create({
    customerId: customer._id,
    siteNumber: `O-${n}`,
    name: `Heizraum ${n}`,
    street: 'Objektweg 7',
    postalCode: '8050',
    city: 'Zuerich',
    canton: 'ZH',
    latitude: 47.3769,
    longitude: 8.5417,
    accessInstructions: 'Ring at caretaker.',
    createdBy: user._id,
  });
  const project = await Project.create({
    projectNumber: `P-AB-${n}`,
    name: 'Boiler replacement',
    projectType: 'RENOVATION',
    customerId: customer._id,
    siteId: site._id,
    projectManagerId: user._id,
    createdBy: user._id,
  });
  const order = await Order.create({
    orderNumber: `AUF-AB-${n}`,
    customerId: customer._id,
    customerName: customer.name,
    contactId: contact._id,
    projectId: project._id,
    title: 'Service job',
    createdBy: user._id,
  });
  const assignment = await Assignment.create({
    assignmentNumber: `ASG-AB-${n}`,
    assignmentType: 'SERVICE_CALL',
    title: 'Technician visit',
    customerId: customer._id,
    siteId: site._id,
    orderId: order._id,
    projectId: project._id,
    startDatetime: new Date('2026-06-16T08:00:00.000Z'),
    endDatetime: new Date('2026-06-16T10:00:00.000Z'),
    createdBy: user._id,
  });

  return { user, customer, contact, site, project, order, assignment };
}

describe('CRM address book read model', () => {
  test('lists billing and site addresses from shared CRM data with contacts and relations', async () => {
    const seeded = await seedAddressBookGraph();

    const result = await addressBookService.list({ limit: 20 });

    expect(result.summary).toMatchObject({
      total: 2,
      billing: 1,
      site: 1,
      delivery: 1,
      business: 2,
      withCoordinates: 1,
    });
    expect(result.data.map((entry) => entry.addressType).sort()).toEqual(['billing', 'site']);
    const siteEntry = result.data.find((entry) => entry.addressType === 'site');
    expect(siteEntry).toMatchObject({
      customer: { id: String(seeded.customer._id), name: seeded.customer.name },
      site: { id: String(seeded.site._id), name: seeded.site.name },
      addressUsage: ['site', 'delivery'],
      primaryContact: {
        firstName: 'Sabrina',
        isPrimary: true,
      },
      related: {
        projectCount: 1,
        orderCount: 1,
        assignmentCount: 1,
        jobCount: 2,
      },
    });
    expect(siteEntry.related.firstProject.id).toBe(String(seeded.project._id));
    expect(siteEntry.related.firstOrder.id).toBe(String(seeded.order._id));
    expect(siteEntry.related.firstAssignment.id).toBe(String(seeded.assignment._id));
  });

  test('searching a contact returns the parent customer billing and site addresses', async () => {
    const seeded = await seedAddressBookGraph();

    const result = await addressBookService.list({ search: 'Sabrina', limit: 20 });

    expect(result.data).toHaveLength(2);
    expect(result.data.every((entry) => entry.customer.id === String(seeded.customer._id))).toBe(true);
  });

  test('delivery and coordinate filters return site addresses without duplicate address storage', async () => {
    const seeded = await seedAddressBookGraph();

    const result = await addressBookService.list({
      addressType: 'delivery',
      hasCoordinates: 'with',
      customerType: 'business',
      limit: 20,
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      recordType: 'site',
      addressUsage: ['site', 'delivery'],
      site: { id: String(seeded.site._id) },
      coordinates: {
        latitude: 47.3769,
        longitude: 8.5417,
      },
    });
  });
});
