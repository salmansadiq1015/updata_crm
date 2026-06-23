import { describe, expect, test } from '@jest/globals';
import TableRenderer from '../renderer/renderers/TableRenderer.js';
import { createFakeDoc, createFakePageManager } from './helpers/fakeDoc.js';

function render(data, language = 'de', config = {}) {
  const doc = createFakeDoc();
  const pm = createFakePageManager();
  new TableRenderer().draw(doc, pm, {}, data, language, config);
  return doc.__renderedText();
}

describe('TableRenderer unit column (DOC-001)', () => {
  const items = [
    { position: 1, description: 'Boiler service', unit: 'Stk', quantity: 1, unitPrice: 1200, total: 1200 },
  ];

  test('default table includes a unit column header', () => {
    const text = render({ lineItems: items }, 'de');
    expect(text).toContain('Einheit');
  });

  test('default table renders the unit value for each line item', () => {
    const text = render({ lineItems: items }, 'de');
    expect(text).toContain('Stk');
  });

  test('renders the unit value regardless of language', () => {
    const text = render({ lineItems: items }, 'en');
    expect(text).toContain('Stk');
  });
});
