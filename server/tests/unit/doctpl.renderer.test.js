import { jest, describe, test, expect } from '@jest/globals';
import { t, LABELS } from '../../src/modules/doctpl/renderer/i18n.js';
import PageManager from '../../src/modules/doctpl/renderer/PageManager.js';

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
