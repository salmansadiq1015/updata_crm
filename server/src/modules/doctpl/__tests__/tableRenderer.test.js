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

describe('TableRenderer line images (offer product picture)', () => {
  test('embeds an attached line image via doc.image() and still renders the row', () => {
    const doc = createFakeDoc();
    const pm = createFakePageManager();
    const items = [
      { position: 1, description: 'Wärmepumpe Vitocal 250-A', unit: 'Stk', quantity: 1, unitPrice: 17227, total: 17227, imageBuffer: Buffer.from('fake-image-bytes') },
    ];
    new TableRenderer().draw(doc, pm, {}, { lineItems: items }, 'de', {});
    expect(doc.__calls.image.length).toBe(1);
    expect(doc.__renderedText()).toContain('Wärmepumpe Vitocal 250-A');
  });

  test('does not call doc.image() when no line image is attached', () => {
    const doc = createFakeDoc();
    const pm = createFakePageManager();
    const items = [
      { position: 1, description: 'Service', unit: 'Stk', quantity: 1, unitPrice: 100, total: 100 },
    ];
    new TableRenderer().draw(doc, pm, {}, { lineItems: items }, 'de', {});
    expect(doc.__calls.image.length).toBe(0);
  });
});
