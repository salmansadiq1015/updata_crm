import { describe, expect, test } from '@jest/globals';
import documentGenerationService from '../documentGeneration.service.js';

const ci = {
  companyDetails: { bankDetails: { qrIban: 'CH4431999123000889012', iban: 'CH4431999123000889012' } },
};

describe('documentGeneration _validateRenderData (DOC-006)', () => {
  test('accepts a complete quotation payload', () => {
    expect(() => documentGenerationService._validateRenderData('quotation', {
      documentNumber: 'OFF-1',
      customer: { name: 'Muster AG' },
      lineItems: [{ position: 1, description: 'x', total: 10 }],
    }, ci)).not.toThrow();
  });

  test('rejects a line-item document with no line items', () => {
    let caught;
    try {
      documentGenerationService._validateRenderData('quotation', {
        documentNumber: 'OFF-1',
        customer: { name: 'Muster AG' },
        lineItems: [],
      }, ci);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect((caught.details || []).map((d) => d.field)).toContain('lineItems');
  });

  test('rejects a document missing the document number', () => {
    expect(() => documentGenerationService._validateRenderData('quotation', {
      customer: { name: 'Muster AG' },
      lineItems: [{ total: 10 }],
    }, ci)).toThrow();
  });

  test('rejects an invoice missing dueDate and QR data', () => {
    let caught;
    try {
      documentGenerationService._validateRenderData('invoice_standard', {
        documentNumber: 'RE-1',
        customer: { name: 'Muster AG' },
        lineItems: [{ total: 10 }],
      }, ci);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    const fields = (caught.details || []).map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['dueDate', 'qrBill.iban', 'qrBill.reference']));
  });

  test('accepts a complete invoice payload', () => {
    expect(() => documentGenerationService._validateRenderData('invoice_standard', {
      documentNumber: 'RE-1',
      dueDate: '2026-07-15',
      customer: { name: 'Muster AG' },
      lineItems: [{ total: 10 }],
      qrBill: { iban: 'CH4431999123000889012', amount: 10, reference: 'REF1' },
    }, ci)).not.toThrow();
  });
});

describe('documentGeneration _prepareRenderData (DOC-003)', () => {
  test('derives the QR-bill from CI bank details for invoices', () => {
    const result = documentGenerationService._prepareRenderData('invoice_standard', {
      documentNumber: 'RE-1',
      amountDue: 1081.5,
      customer: { name: 'Muster AG', addressLine1: 'Bahnhofstrasse 1', plz: '8001', city: 'Zürich' },
    }, ci);
    expect(result.qrBill.iban).toBe('CH4431999123000889012');
    expect(result.qrBill.amount).toBe(1081.5);
    expect(result.qrBill.currency).toBe('CHF');
    expect(result.qrBill.reference).toBe('RE-1');
    expect(result.qrBill.debtor.name).toBe('Muster AG');
  });

  test('does not attach a QR-bill to non-invoice documents', () => {
    const result = documentGenerationService._prepareRenderData('quotation', {
      documentNumber: 'OFF-1',
      customer: { name: 'Muster AG' },
    }, ci);
    expect(result.qrBill).toBeUndefined();
  });
});

describe('documentGeneration _buildFilename (DOC-007)', () => {
  test('follows the client convention JJJJ_MM_TT_Objektadresse_Updata_Dokumenttyp_Version', () => {
    const name = documentGenerationService._buildFilename('invoice_standard', {
      documentNumber: 'RE-2026-0042',
      objectAddress: 'Hohestrasse 199, Oberwil',
      customer: { name: 'Müller & Co AG' },
    }, 'de');
    // The date part is the generation date.
    expect(name).toMatch(/^\d{4}_\d{2}_\d{2}_Hohestrasse 199, Oberwil_Updata_Rechnung RG_V1\.pdf$/);
    // Filesystem-hostile characters never survive sanitisation.
    expect(name).not.toMatch(/[/\\:*?"<>|]/);
  });
});
