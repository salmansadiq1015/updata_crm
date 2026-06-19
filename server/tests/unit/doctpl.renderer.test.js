import { jest, describe, test, expect } from '@jest/globals';
import { t, LABELS } from '../../src/modules/doctpl/renderer/i18n.js';
import PageManager from '../../src/modules/doctpl/renderer/PageManager.js';
import DocumentRenderer from '../../src/modules/doctpl/renderer/DocumentRenderer.js';
import TotalsRenderer from '../../src/modules/doctpl/renderer/renderers/TotalsRenderer.js';
import { pdfColors } from '../../src/modules/doctpl/renderer/renderers/colors.js';
import { pdfFonts, registerCiFonts } from '../../src/modules/doctpl/renderer/renderers/fonts.js';

// --- i18n tests ---
describe('i18n t()', () => {
  test('resolves label for known language', () => {
    expect(t('de', 'subtotal')).toBe('Zwischensumme');
    expect(t('fr', 'subtotal')).toBe('Sous-total');
    expect(t('en', 'grandTotal')).toBe('Grand Total');
    expect(t('it', 'vat')).toBe('IVA');
  });
  test('falls back to de for unknown language', () => {
    expect(t('xx', 'subtotal')).toBe('Zwischensumme');
  });
  test('returns key for unknown key', () => {
    expect(t('de', 'nonexistent_key')).toBe('nonexistent_key');
  });
  test('all 4 languages have grandTotal', () => {
    for (const lang of ['de','fr','it','en']) {
      expect(LABELS[lang].grandTotal).toBeTruthy();
    }
  });
  test('all 4 languages have final invoice deduction labels', () => {
    for (const lang of ['de','fr','it','en']) {
      expect(LABELS[lang].net).toBeTruthy();
      expect(LABELS[lang].vatAmount).toBeTruthy();
      expect(LABELS[lang].grossTotal).toBeTruthy();
    }
  });
  test('all 4 languages cover Module 09 document label requirements', () => {
    const requiredKeys = [
      'position',
      'description',
      'quantity',
      'unitPrice',
      'total',
      'subtotal',
      'vat',
      'grandTotal',
      'paymentTerms',
      'validUntil',
      'date',
      'page',
      'documentNumber',
      'reference',
    ];
    const templateTypes = [
      'quotation',
      'order_confirmation',
      'invoice_standard',
      'invoice_advance',
      'invoice_final',
      'cover_letter',
      'service_report',
      'inspection_certificate',
      'project_appointment_confirmation',
      'project_status_report',
      'project_completion_certificate',
    ];

    for (const lang of ['de','fr','it','en']) {
      for (const key of requiredKeys) {
        expect(LABELS[lang][key]).toBeTruthy();
      }
      for (const templateType of templateTypes) {
        expect(LABELS[lang][`title.${templateType}`]).toBeTruthy();
      }
    }
  });
});

// --- PageManager tests ---
describe('PageManager', () => {
  function makeDoc(height = 841.89, width = 595.28) {
    return {
      page: { height, width },
      y: 0,
      addPage: jest.fn(function() {}),
      on: jest.fn(),
    };
  }

  test('computes contentWidth correctly', () => {
    const doc = makeDoc();
    const pm = new PageManager(doc, { top:25, bottom:20, left:20, right:15 });
    // A4 width 595.28pt minus margins: (20+15)*2.83465 = 99.21
    expect(pm.contentWidth).toBeCloseTo(595.28 - (20 + 15) * 2.83465, 1);
  });

  test('checkSpace returns false when space available', () => {
    const doc = makeDoc();
    const pm = new PageManager(doc, { top:25, bottom:20, left:20, right:15 });
    expect(pm.checkSpace(10)).toBe(false);
  });

  test('checkSpace triggers addPage when insufficient space', () => {
    const doc = makeDoc();
    const pm = new PageManager(doc, { top:25, bottom:20, left:20, right:15 });
    pm.currentY = pm.footerY - 5;
    const result = pm.checkSpace(20);
    expect(result).toBe(true);
    expect(doc.addPage).toHaveBeenCalled();
    expect(pm.pageCount).toBe(2);
  });

  test('moveDown increments currentY', () => {
    const doc = makeDoc();
    const pm = new PageManager(doc, { top:25, bottom:20, left:20, right:15 });
    const startY = pm.currentY;
    pm.moveDown(50);
    expect(pm.currentY).toBe(startY + 50);
  });
});

describe('CI renderer helpers', () => {
  test('resolves configured colors with stable fallbacks', () => {
    const colors = pdfColors({ colors: { primary: '#0055AA', text: '' } });
    expect(colors.primary).toBe('#0055AA');
    expect(colors.text).toBe('#1A1A1A');
    expect(colors.border).toBe('#E5E7EB');
  });

  test('uses registered CI font names only when buffers are available', () => {
    const doc = { registerFont: jest.fn() };
    const ciConfig = { fontBuffers: { light: Buffer.from('light'), bold: Buffer.from('bold') } };

    registerCiFonts(doc, ciConfig);
    expect(doc.registerFont).toHaveBeenCalledWith('MBB-CI-Light', ciConfig.fontBuffers.light);
    expect(doc.registerFont).toHaveBeenCalledWith('MBB-CI-Bold', ciConfig.fontBuffers.bold);
    expect(pdfFonts(ciConfig)).toEqual({
      body: 'MBB-CI-Light',
      medium: 'Helvetica-Bold',
      bold: 'MBB-CI-Bold',
      italic: 'Helvetica-Oblique',
    });
  });
});

describe('DocumentRenderer acceptance fixtures', () => {
  const ciConfig = {
    companyName: 'MB Boiler & Heizung AG',
    colors: { primary: '#1B3F8B', accent: '#D4002A' },
    companyDetails: {
      vatNumber: 'CHE-123.456.789 MWST',
      bankDetails: { bankName: 'Test Bank' },
      address: { street: 'Boilerstrasse 1', zip: '8001', city: 'Zuerich' },
    },
  };

  const sections = [
    { id: 'header', type: 'header', position: 0, isVisible: true },
    { id: 'body', type: 'body', position: 1, isVisible: true },
    { id: 'table', type: 'table', position: 2, isVisible: true },
    { id: 'totals', type: 'totals', position: 3, isVisible: true },
    { id: 'footer', type: 'footer', position: 99, isVisible: true },
  ];

  const template = (overrides = {}) => ({
    templateType: 'quotation',
    layout: { margins: { top: 25, bottom: 20, left: 20, right: 15 } },
    sections,
    ...overrides,
  });

  const data = (overrides = {}) => ({
    templateType: 'quotation',
    documentNumber: 'OFF-2026-0042',
    documentDate: '2026-06-15',
    validUntil: '2026-07-15',
    currency: 'CHF',
    customer: { name: 'Muster AG', addressLine1: 'Bahnhofstrasse 1', zip: '8001', city: 'Zuerich', country: 'CH' },
    introduction: 'Thank you for your request.',
    lineItems: Array.from({ length: 120 }, (_, index) => ({
      position: index + 1,
      description: `Service line ${index + 1}`,
      quantity: 1,
      unitPrice: 10,
      total: 10,
    })),
    subtotal: 1200,
    vatBreakdown: [{ rate: 0.081, amount: 97.20 }],
    grandTotal: 1297.20,
    ...overrides,
  });

  test('renders large quotation fixtures as multi-page PDFs', async () => {
    const renderer = new DocumentRenderer();
    const result = await renderer.renderWithMetadata(template(), ciConfig, data(), 'en');

    expect(result.buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(result.pageCount).toBeGreaterThan(1);
  });

  test('rejects invoice rendering when QR-bill data is incomplete', async () => {
    const renderer = new DocumentRenderer();
    await expect(renderer.render(
      template({
        templateType: 'invoice_standard',
        sections: [
          { id: 'header', type: 'header', position: 0, isVisible: true },
          { id: 'qr_bill', type: 'qr_bill', position: 1, isVisible: true },
          { id: 'footer', type: 'footer', position: 99, isVisible: true },
        ],
      }),
      ciConfig,
      data({ templateType: 'invoice_standard', qrBill: { iban: 'CH4431999123000889012' } }),
      'en',
    )).rejects.toThrow('QR-bill data is required');
  });

  test('formats final invoice advance deductions with net VAT and total', () => {
    const renderer = new TotalsRenderer();
    const deduction = {
      invoiceNumber: 'AK-2026-0001',
      date: '2026-05-15',
      netAmount: 500,
      vatAmount: 40.5,
      totalAmount: 540.5,
      amount: 540.5,
    };

    expect(renderer._deductionLabel(deduction)).toBe('AK-2026-0001 (2026-05-15)');
    expect(renderer._deductionTotal(deduction, 'CHF')).toBe('-CHF 540.50');
    expect(renderer._deductionDetail(deduction, 'CHF', 'en')).toBe('Net CHF 500.00 | VAT CHF 40.50 | Total CHF 540.50');
  });
});
