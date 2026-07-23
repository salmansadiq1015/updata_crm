import { describe, expect, test } from '@jest/globals';
import HeaderRenderer from '../renderer/renderers/HeaderRenderer.js';
import { createFakeDoc, createFakePageManager } from './helpers/fakeDoc.js';

const ciConfig = {
  companyName: 'MB Boiler & Heizung AG',
  companyDetails: { address: { street: 'Bahnhofstrasse 1', zip: '8001', city: 'Zürich' } },
};

function render(data, language = 'de') {
  const doc = createFakeDoc();
  const pm = createFakePageManager();
  new HeaderRenderer().draw(doc, pm, ciConfig, data, language, { templateType: data.templateType });
  return doc.__renderedText();
}

describe('HeaderRenderer order-confirmation fields (DOC-002)', () => {
  test('renders the source quotation reference when provided', () => {
    const text = render({
      templateType: 'order_confirmation',
      documentNumber: 'AB-2026-0007',
      sourceQuotationRef: 'OFF-2026-0042',
      customer: { name: 'Muster AG' },
    });
    expect(text).toContain('OFF-2026-0042');
  });

  test('renders the requested delivery date prominently when provided', () => {
    const text = render({
      templateType: 'order_confirmation',
      documentNumber: 'AB-2026-0007',
      requestedDeliveryDate: '2026-08-01',
      customer: { name: 'Muster AG' },
    });
    expect(text).toContain('2026-08-01');
  });

  test('omits the new fields when not provided (quotation)', () => {
    const text = render({
      templateType: 'quotation',
      documentNumber: 'OFF-2026-0042',
      customer: { name: 'Muster AG' },
    });
    // labels for the new fields should not appear
    expect(text).not.toMatch(/Ref\. Offerte|Liefertermin/);
  });
});
