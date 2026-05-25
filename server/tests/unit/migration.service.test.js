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

let migrationService;
let Customer;
let Site;
let Installation;
let Quotation;
let Invoice;

beforeAll(async () => {
  await connectTestDb();
  await import('../../src/modules/auth/user.model.js');
  await import('../../src/modules/crm/customer.model.js');
  await import('../../src/modules/crm/contact.model.js');
  await import('../../src/modules/crm/site.model.js');
  await import('../../src/modules/crm/installation.model.js');
  await import('../../src/modules/qop/quotation.model.js');
  await import('../../src/modules/qop/invoice.model.js');
  ({ default: migrationService } = await import('../../src/modules/migration/migration.service.js'));
  Customer = mongoose.model('Customer');
  Site = mongoose.model('Site');
  Installation = mongoose.model('Installation');
  Quotation = mongoose.model('Quotation');
  Invoice = mongoose.model('Invoice');
});

afterEach(async () => {
  await clearTestDb();
});

afterAll(async () => {
  await disconnectTestDb();
});

function user() {
  return { _id: new mongoose.Types.ObjectId() };
}

function sourceData(customerSourceId = 'C-100') {
  return {
    addresses_of: [{
      source_id: customerSourceId,
      company: 'Muster AG',
      street: 'Bahnhofstrasse 1',
      plz: '8001',
      ort: 'Zurich',
      email: 'info@muster.ch',
      phone: '+41 44 123 45 67',
      contactName: 'Anna Muster',
    }],
    plants: [{
      source_id: 'P-100',
      customer_source_id: customerSourceId,
      siteName: 'Muster AG Technikraum',
      anlage_typ: 'kessel',
      hersteller: 'Viessmann',
      modell: 'Vitocrossal',
      serien_nr: 'SER-100',
      baujahr: 2021,
    }],
    quotations: [{
      source_id: 'Q-100',
      customer_source_id: customerSourceId,
      offert_nr: 'OF-100',
      status: 'accepted',
      datum: '2025-01-10',
      gueltig_bis: '2025-02-10',
      lineItems: [{ description: 'Service', quantity: 2, unitPrice: 100, vatRate: 8.1 }],
    }],
    invoices: [{
      source_id: 'I-100',
      customer_source_id: customerSourceId,
      rechnung_nr: 'RE-100',
      status: 'paid',
      datum: '2025-03-01',
      faellig_am: '2025-03-31',
      lineItems: [{ description: 'Service', quantity: 2, unitPrice: 100, vatRate: 8.1 }],
    }],
  };
}

describe('MigrationService', () => {
  test('imports OF addresses, plants, quotations and invoices with traceable progress', async () => {
    const run = await migrationService.createRun({
      runType: 'production',
      environment: 'staging',
      sourceDataDate: new Date('2025-04-01'),
      domains: ['addresses_of', 'plants', 'quotations', 'invoices'],
      sourceData: sourceData(),
    }, user());

    const completed = await migrationService.start(run._id, user());
    const progress = await migrationService.getProgress(run._id);

    expect(completed.status).toBe('completed');
    expect(progress.totals.totalSource).toBe(4);
    expect(progress.totals.failed).toBe(0);
    expect(await Customer.countDocuments()).toBe(1);
    expect(await Site.countDocuments()).toBe(1);
    expect(await Installation.countDocuments()).toBe(1);
    expect(await Quotation.countDocuments()).toBe(1);
    expect(await Invoice.countDocuments()).toBe(1);

    const customer = await Customer.findOne({ 'migration.sourceId': 'C-100' });
    expect(customer.migration.sourceSystem).toBe('of');
    expect(customer.migration.isReadOnly).toBe(true);
  });

  test('fails a domain with blocking referential-integrity validation errors', async () => {
    const run = await migrationService.createRun({
      runType: 'production',
      environment: 'staging',
      sourceDataDate: new Date('2025-04-01'),
      domains: ['invoices'],
      sourceData: {
        invoices: [{ source_id: 'I-BAD', rechnung_nr: 'RE-BAD', lineItems: [{ description: 'Service', quantity: 1, unitPrice: 50 }] }],
      },
    }, user());

    const completed = await migrationService.start(run._id, user());
    const report = await migrationService.validationReport(run._id);

    expect(completed.status).toBe('failed');
    expect(report.totals.failed).toBe(1);
    expect(report.errors.bySeverity).toEqual(expect.arrayContaining([expect.objectContaining({ _id: 'error', count: 1 })]));
  });

  test('rolls back imported production records by soft delete', async () => {
    const run = await migrationService.createRun({
      runType: 'production',
      environment: 'staging',
      sourceDataDate: new Date('2025-04-01'),
      domains: ['addresses_of', 'invoices'],
      sourceData: {
        addresses_of: sourceData('C-ROLL').addresses_of,
        invoices: [{
          source_id: 'I-ROLL',
          customer_source_id: 'C-ROLL',
          rechnung_nr: 'RE-ROLL',
          lineItems: [{ description: 'Rollback service', quantity: 1, unitPrice: 150 }],
        }],
      },
    }, user());

    await migrationService.start(run._id, user());
    const customer = await Customer.findOne({ 'migration.sourceId': 'C-ROLL' });
    const invoice = await Invoice.findOne({ 'migration.sourceId': 'I-ROLL' });

    const result = await migrationService.rollback(run._id, { rollbackType: 'full' }, user());
    const deletedCustomer = await Customer.findById(customer._id).setOptions({ includeDeleted: true });
    const deletedInvoice = await Invoice.findById(invoice._id).setOptions({ includeDeleted: true });

    expect(result.rolledBack).toBeGreaterThanOrEqual(2);
    expect(deletedCustomer.isDeleted).toBe(true);
    expect(deletedInvoice.isDeleted).toBe(true);
  });
});
