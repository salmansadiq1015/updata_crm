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

let Customer, Contact, Site, Installation, EntityNote, User, Role;
let crmAddressBookService;
let syncService;
let parseNameplateText;

beforeAll(async () => {
  await connectTestDb();
  await import('../../src/modules/auth/user.model.js');
  await import('../../src/modules/auth/role.model.js');
  await import('../../src/modules/crm/customer.model.js');
  await import('../../src/modules/crm/contact.model.js');
  await import('../../src/modules/crm/site.model.js');
  await import('../../src/modules/crm/installation.model.js');
  await import('../../src/modules/crm/entityNote.model.js');

  Customer = mongoose.model('Customer');
  Contact = mongoose.model('Contact');
  Site = mongoose.model('Site');
  Installation = mongoose.model('Installation');
  EntityNote = mongoose.model('EntityNote');
  User = mongoose.model('User');
  Role = mongoose.model('Role');
  ({ default: crmAddressBookService } = await import('../../src/modules/mobile/crmAddressBook.service.js'));
  ({ default: syncService } = await import('../../src/modules/mobile/sync.service.js'));
  ({ parseNameplateText } = await import('../../src/modules/mobile/nameplateOcr.service.js'));
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
  const role = await Role.create({ name: `MobileCrmRole${seq()}`, permissions: [] });
  return User.create({
    email: `mobile.crm.${seq()}@test.ch`,
    passwordHash: '$2b$04$dummyhashpaddedenoughtopassvalidation',
    firstName: 'Mobile',
    lastName: 'Tester',
    role: role._id,
    status: 'active',
  });
}

async function seedAddressBook() {
  const user = await seedUser();
  const n = seq();
  const customer = await Customer.create({
    customerNumber: `K-MOB-${n}`,
    name: `Mobile Customer ${n}`,
    type: 'business',
    street: 'Technikweg 1',
    postalCode: '8001',
    city: 'Zuerich',
    canton: 'ZH',
    country: 'CH',
    phone: '+41441234567',
    email: `customer.${n}@test.ch`,
    createdBy: user._id,
  });

  const contact = await Contact.create({
    customerId: customer._id,
    firstName: 'Anna',
    lastName: `Meier${n}`,
    email: `anna.${n}@test.ch`,
    mobile: '+41791234567',
    isPrimary: true,
  });

  const site = await Site.create({
    customerId: customer._id,
    siteNumber: `S-MOB-${n}`,
    name: `Plant Room ${n}`,
    street: 'Heizraum 2',
    postalCode: '8001',
    city: 'Zuerich',
    canton: 'ZH',
    createdBy: user._id,
  });

  const installation = await Installation.create({
    installationNumber: `A-MOB-${n}`,
    siteId: site._id,
    type: 'boiler',
    manufacturer: 'Viessmann',
    model: 'Vitocrossal',
    serialNumber: `SN-${n}`,
    powerOutputKw: 24,
    fuelType: 'gas',
    yearOfManufacture: 2024,
    createdBy: user._id,
  });

  return { user, customer, contact, site, installation };
}

describe('Mobile CRM address book sync', () => {
  test('returns compact initial customer, contact, site, and installation cache', async () => {
    const seeded = await seedAddressBook();

    const result = await crmAddressBookService.listChanges(null);

    expect(result.customers).toHaveLength(1);
    expect(result.contacts).toHaveLength(1);
    expect(result.sites).toHaveLength(1);
    expect(result.installations).toHaveLength(1);
    expect(result.customers[0]).toMatchObject({
      id: String(seeded.customer._id),
      customer_number: seeded.customer.customerNumber,
      name: seeded.customer.name,
      postal_code: '8001',
    });
    expect(result.contacts[0]).toMatchObject({
      customer_id: String(seeded.customer._id),
      is_primary: true,
    });
    expect(result.installations[0]).toMatchObject({
      site_id: String(seeded.site._id),
      customer_id: String(seeded.customer._id),
      system_type: 'boiler',
      power_output_kw: 24,
    });
    expect(result.deleted.notes).toEqual([]);
  });

  test('syncs warning and pinned CRM notes with the mobile address book', async () => {
    const seeded = await seedAddressBook();
    await EntityNote.create({
      entityType: 'site',
      entityId: seeded.site._id,
      text: 'Oil tank access requires caretaker key',
      category: 'access_info',
      isPinned: true,
      isWarning: true,
      authorId: seeded.user._id,
      editableUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const result = await crmAddressBookService.listChanges(null);

    expect(result.notes).toHaveLength(1);
    expect(result.notes[0]).toMatchObject({
      entity_type: 'site',
      entity_id: String(seeded.site._id),
      text: 'Oil tank access requires caretaker key',
      category: 'access_info',
      is_pinned: true,
      is_warning: true,
    });
  });

  test('returns a coherent parent customer payload when only an installation changes', async () => {
    const seeded = await seedAddressBook();
    const since = new Date(Date.now() - 1000);
    await Installation.findByIdAndUpdate(seeded.installation._id, { model: 'Updated Mobile Boiler' });

    const result = await crmAddressBookService.listChanges(since.toISOString());

    expect(result.customers.map((item) => item.id)).toContain(String(seeded.customer._id));
    expect(result.sites.map((item) => item.id)).toContain(String(seeded.site._id));
    expect(result.installations[0]).toMatchObject({
      id: String(seeded.installation._id),
      model: 'Updated Mobile Boiler',
    });
  });

  test('returns parent payload when only an installation note changes', async () => {
    const seeded = await seedAddressBook();
    const since = new Date(Date.now() - 1000);

    await EntityNote.create({
      entityType: 'installation',
      entityId: seeded.installation._id,
      text: 'Flue gas warning visible onsite',
      category: 'warning',
      isWarning: true,
      authorId: seeded.user._id,
      editableUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const result = await crmAddressBookService.listChanges(since.toISOString());

    expect(result.customers.map((item) => item.id)).toContain(String(seeded.customer._id));
    expect(result.sites.map((item) => item.id)).toContain(String(seeded.site._id));
    expect(result.installations.map((item) => item.id)).toContain(String(seeded.installation._id));
    expect(result.notes).toEqual([
      expect.objectContaining({
        entity_type: 'installation',
        entity_id: String(seeded.installation._id),
        text: 'Flue gas warning visible onsite',
        is_warning: true,
      }),
    ]);
  });

  test('emits tombstones for removed CRM records during delta sync', async () => {
    const seeded = await seedAddressBook();
    const since = new Date(Date.now() - 1000);
    await Contact.findByIdAndUpdate(seeded.contact._id, {
      isDeleted: true,
      deletedAt: new Date(),
    });

    const result = await crmAddressBookService.listChanges(since.toISOString());

    expect(result.deleted.contacts).toContain(String(seeded.contact._id));
    expect(result.customers.map((item) => item.id)).toContain(String(seeded.customer._id));
  });

  test('processes offline installation capture creates during full sync', async () => {
    const seeded = await seedAddressBook();
    const user = await seedUser();

    const result = await syncService.fullSync(user._id, {
      lastSyncTimestamp: null,
      outbound: {
        installationCaptures: [{
          localId: 'local-installation-1',
          operation: 'CREATE',
          siteId: String(seeded.site._id),
          data: {
            type: 'heat_pump',
            manufacturer: 'Stiebel Eltron',
            model: 'WPL 25',
            serialNumber: 'HP-001',
          },
        }],
      },
    });

    expect(result.outboundResults.installationCaptures).toHaveLength(1);
    expect(result.outboundResults.installationCaptures[0]).toMatchObject({
      localId: 'local-installation-1',
      status: 'SUCCESS',
    });

    const created = await Installation.findOne({ serialNumber: 'HP-001' }).lean();
    expect(created).toMatchObject({
      type: 'heat_pump',
      manufacturer: 'Stiebel Eltron',
      model: 'WPL 25',
    });
  });

  test('processes offline mobile CRM notes during full sync', async () => {
    const seeded = await seedAddressBook();
    const user = await seedUser();

    const result = await syncService.fullSync(user._id, {
      lastSyncTimestamp: null,
      outbound: {
        notes: [{
          localId: 'local-note-1',
          entity_type: 'installation',
          entity_id: String(seeded.installation._id),
          data: {
            text: 'Customer reports occasional reset alarm',
            category: 'warning',
            isWarning: true,
            isPinned: true,
          },
        }],
      },
    });

    expect(result.outboundResults.notes).toEqual([
      expect.objectContaining({
        localId: 'local-note-1',
        status: 'SUCCESS',
      }),
    ]);

    const note = await EntityNote.findOne({ entityId: seeded.installation._id }).lean();
    expect(note).toMatchObject({
      entityType: 'installation',
      text: 'Customer reports occasional reset alarm',
      category: 'warning',
      isWarning: true,
      isPinned: true,
    });
  });

  test('reports installation update conflicts when offline base version is stale', async () => {
    const seeded = await seedAddressBook();
    const user = await seedUser();
    const baseUpdatedAt = new Date(Date.now() - 60_000).toISOString();
    await Installation.findByIdAndUpdate(seeded.installation._id, { model: 'Server Updated Model' });

    const result = await syncService.fullSync(user._id, {
      lastSyncTimestamp: null,
      outbound: {
        installationCaptures: [{
          localId: 'local-update-1',
          operation: 'UPDATE',
          installationId: String(seeded.installation._id),
          baseUpdatedAt,
          data: { model: 'Offline Model' },
        }],
      },
    });

    expect(result.outboundResults.conflicts).toEqual([
      expect.objectContaining({
        localId: 'local-update-1',
        serverId: String(seeded.installation._id),
        entityType: 'INSTALLATION_CAPTURE',
        status: 'CONFLICT',
      }),
    ]);

    const unchanged = await Installation.findById(seeded.installation._id).lean();
    expect(unchanged.model).toBe('Server Updated Model');
  });

  test('extracts structured installation fields from nameplate OCR text', () => {
    const result = parseNameplateText(`
      Hersteller: Viessmann
      Modell: Vitocrossal 300
      Seriennummer: VC300-998877
      Leistung: 24.5 kW
      Baujahr: 2024
      Brennstoff: Gas
    `);

    expect(result.fields).toMatchObject({
      manufacturer: 'Viessmann',
      model: 'Vitocrossal 300',
      serialNumber: 'VC300-998877',
      powerOutputKw: 24.5,
      yearOfManufacture: 2024,
      fuelType: 'gas',
    });
    expect(result.lowConfidenceFields).toEqual(expect.arrayContaining(['powerOutputKw', 'yearOfManufacture']));
  });
});
