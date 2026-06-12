import { jest, describe, test, expect } from '@jest/globals';
import { t, LABELS } from '../../src/modules/doctpl/renderer/i18n.js';
import PageManager from '../../src/modules/doctpl/renderer/PageManager.js';
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
