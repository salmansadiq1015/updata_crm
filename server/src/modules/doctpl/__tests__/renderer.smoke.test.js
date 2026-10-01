import { describe, expect, test } from '@jest/globals';
import DocumentRenderer from '../renderer/DocumentRenderer.js';

const ciConfig = {
  companyName: 'Updata',
  companyDetails: {
    address: { street: 'Bahnhofstrasse 1', zip: '3000', city: 'Bern' },
    bankDetails: { iban: 'CH4431999123000889012', qrIban: 'CH4431999123000889012' },
    vatNumber: 'CHE-123.456.789 MWST',
  },
};

function section(type, position, extra = {}) {
  return { id: type, name: type, type, position, isVisible: true, isConditional: false, ...extra };
}

function isPdf(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length > 800 && buffer.slice(0, 5).toString() === '%PDF-';
}

describe('DocumentRenderer end-to-end (DOC-006)', () => {
  test('renders a quotation to a valid multi-section PDF buffer', async () => {
    const template = {
      templateType: 'quotation',
      layout: { pageSize: 'A4', margins: { top: 25, bottom: 20, left: 20, right: 15 } },
      sections: [section('header', 0), section('body', 1), section('table', 2), section('totals', 3), section('footer', 99)],
      textBlocks: { de: { footer: 'Updata AG | CHE-123.456.789 MWST' } },
      tableColumns: [],
    };
    const data = {
      templateType: 'quotation',
      documentNumber: 'OFF-2026-0042',
      customer: { name: 'Muster AG', addressLine1: 'Bahnhofstrasse 1', zip: '8001', city: 'Zürich' },
      introduction: 'Gerne unterbreiten wir Ihnen folgende Offerte.',
      lineItems: [
        { position: 1, description: 'Boiler service', unit: 'Stk', quantity: 1, unitPrice: 1200, total: 1200 },
        { position: 2, description: 'Material', unit: 'Stk', quantity: 2, unitPrice: 150, total: 300 },
      ],
      subtotal: 1500,
      vatBreakdown: [{ rate: 0.081, amount: 121.5 }],
      grandTotal: 1621.5,
    };
    const { buffer, pageCount } = await new DocumentRenderer().renderWithMetadata(template, ciConfig, data, 'de');
    expect(isPdf(buffer)).toBe(true);
    expect(pageCount).toBeGreaterThanOrEqual(1);
  });

  test('paginates a 60-item line table across multiple pages', async () => {
    const template = {
      templateType: 'quotation',
      layout: { margins: { top: 25, bottom: 20, left: 20, right: 15 } },
      sections: [section('header', 0), section('table', 2), section('totals', 3), section('footer', 99)],
      textBlocks: { de: { footer: 'footer' } },
    };
    const lineItems = Array.from({ length: 60 }, (_, i) => ({
      position: i + 1, description: `Item ${i + 1}`, unit: 'Stk', quantity: 1, unitPrice: 10, total: 10,
    }));
    const data = { templateType: 'quotation', documentNumber: 'OFF-1', customer: { name: 'X' }, lineItems, subtotal: 600, grandTotal: 600 };
    const { buffer, pageCount } = await new DocumentRenderer().renderWithMetadata(template, ciConfig, data, 'de');
    expect(isPdf(buffer)).toBe(true);
    expect(pageCount).toBeGreaterThan(1);
  });

  test('renders a service report with the structured report section', async () => {
    const template = {
      templateType: 'service_report',
      layout: { margins: { top: 25, bottom: 20, left: 20, right: 15 } },
      sections: [section('header', 0), section('body', 1), section('report', 2), section('footer', 99)],
      textBlocks: { de: { footer: 'footer' } },
    };
    const data = {
      templateType: 'service_report',
      documentNumber: 'SB-2026-0001',
      customer: { name: 'Muster AG' },
      equipment: { name: 'Vitodens 200', serialNumber: 'SN-1' },
      findings: 'OK',
      workPerformed: 'Cleaned',
      technician: { name: 'Hans Muster' },
    };
    const { buffer } = await new DocumentRenderer().renderWithMetadata(template, ciConfig, data, 'de');
    expect(isPdf(buffer)).toBe(true);
  });

  test('throws when an invoice qr_bill section lacks valid QR data', async () => {
    const template = {
      templateType: 'invoice_standard',
      layout: { margins: { top: 25, bottom: 20, left: 20, right: 15 } },
      sections: [section('header', 0), section('qr_bill', 7), section('footer', 99)],
      textBlocks: { de: { footer: 'footer' } },
    };
    const data = {
      templateType: 'invoice_standard',
      documentNumber: 'RE-2026-0002',
      customer: { name: 'Muster AG' },
      qrBill: { iban: '', amount: 0, reference: '' },
    };
    await expect(new DocumentRenderer().renderWithMetadata(template, ciConfig, data, 'de')).rejects.toThrow(/QR-bill/i);
  });
});
