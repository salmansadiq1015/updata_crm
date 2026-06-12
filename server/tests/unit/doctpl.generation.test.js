import { describe, expect, test } from '@jest/globals';
import documentGenerationService from '../../src/modules/doctpl/documentGeneration.service.js';
import templateService from '../../src/modules/doctpl/template.service.js';

const ciConfig = {
  companyName: 'MB Boiler & Heizung AG',
  companyDetails: {
    bankDetails: {
      iban: 'CH4431999123000889012',
      qrIban: 'CH4431999123000889012',
    },
  },
};

describe('DocumentGenerationService payload preparation', () => {
  test('injects QR-bill data for invoice payloads from active CI bank details', () => {
    const data = documentGenerationService._prepareRenderData('invoice_standard', {
      documentNumber: 'INV-2026-0001',
      dueDate: '2026-07-12',
      currency: 'CHF',
      grandTotal: 1250.5,
      customer: {
        name: 'Muster AG',
        addressLine1: 'Bahnhofstrasse 1',
        zip: '8000',
        city: 'Zuerich',
        country: 'CH',
      },
    }, ciConfig);

    expect(data.qrBill).toEqual(expect.objectContaining({
      iban: 'CH4431999123000889012',
      amount: 1250.5,
      currency: 'CHF',
      reference: 'INV-2026-0001',
    }));
    expect(data.qrBill.debtor).toEqual(expect.objectContaining({ name: 'Muster AG' }));
  });

  test('rejects invoice payloads without QR-capable bank details', () => {
    const data = documentGenerationService._prepareRenderData('invoice_standard', {
      documentNumber: 'INV-2026-0002',
      dueDate: '2026-07-12',
      grandTotal: 100,
      customer: { name: 'Muster AG' },
      lineItems: [{ description: 'Service', quantity: 1, unitPrice: 100, total: 100 }],
    }, { companyDetails: { bankDetails: {} } });

    expect(() => documentGenerationService._validateRenderData(
      'invoice_standard',
      data,
      { companyDetails: { bankDetails: {} } },
    )).toThrow('Document payload validation failed');
  });
});

describe('TemplateService version diff collection', () => {
  test('collects scoped template diffs without metadata noise', () => {
    const changes = [];
    templateService._collectDiffs(
      { margins: { top: 25, bottom: 20 }, headerHeight: 45 },
      { margins: { top: 30, bottom: 20 }, headerHeight: 45 },
      'layout',
      changes,
    );

    expect(changes).toEqual([
      { path: 'layout.margins.top', type: 'changed', before: 25, after: 30 },
    ]);
  });
});
