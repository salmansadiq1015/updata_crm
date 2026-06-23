import { describe, expect, test } from '@jest/globals';
import TotalsRenderer from '../renderer/renderers/TotalsRenderer.js';
import { createFakeDoc, createFakePageManager } from './helpers/fakeDoc.js';

const ciConfig = {};

function render(data, language = 'de') {
  const doc = createFakeDoc();
  const pm = createFakePageManager();
  new TotalsRenderer().draw(doc, pm, ciConfig, data, language, {});
  return doc.__renderedText();
}

describe('TotalsRenderer advance invoice (DOC-003)', () => {
  test('renders the advance amount with its percentage when provided', () => {
    const text = render({
      currency: 'CHF',
      advancePercentage: 30,
      advanceAmount: 4500,
      grandTotalRounded: 4500,
    });
    expect(text).toMatch(/Akontobetrag/);
    expect(text).toContain('30%');
    expect(text).toContain('4500.00');
  });

  test('falls back to the grand total when only a percentage is provided', () => {
    const text = render({
      currency: 'CHF',
      advancePercentage: 50,
      grandTotal: 1000,
    });
    expect(text).toContain('50%');
    // amount derived from grand total
    expect(text).toContain('1000.00');
  });

  test('omits the advance row for documents without advance fields', () => {
    const text = render({ currency: 'CHF', subtotal: 100, grandTotal: 100 });
    expect(text).not.toMatch(/Akontobetrag/);
  });

  test('localizes the advance label (en)', () => {
    const text = render({ currency: 'CHF', advanceAmount: 200 }, 'en');
    expect(text).toMatch(/Advance amount/i);
  });
});
