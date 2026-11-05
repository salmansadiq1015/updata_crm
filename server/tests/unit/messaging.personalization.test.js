import { describe, expect, it } from '@jest/globals';
import { escapeHtml, extractVariables, leadVariables, renderPersonalized, smsSegments } from '../../src/modules/messaging/personalization.js';

describe('messaging personalization', () => {
  const lead = {
    name: 'Müller & Sons', type: 'business', email: 'hello@example.com', mobile: '+41791234567',
    address: { city: '<Basel>', country: 'CH' }, sourceMetadata: { businessType: 'Heating' },
    providerMeta: { rating: 4.8 }, assignedTo: { firstName: 'Ada', lastName: 'Lovelace' },
  };

  it('resolves each lead independently and escapes untrusted HTML values', () => {
    const values = leadVariables(lead, { companyName: 'Updata', senderName: 'Salman' });
    const output = renderPersonalized('<p>Hello {{businessName}} in {{city}}</p>', values, { html: true, required: ['businessName', 'city'] });
    expect(output.value).toBe('<p>Hello Müller &amp; Sons in &lt;Basel&gt;</p>');
    expect(output.missing).toEqual([]);
    expect(output.unresolved).toEqual([]);
  });

  it('blocks required missing values and leaves unsupported variables detectable', () => {
    const output = renderPersonalized('{{firstName}} {{unknownThing}} {{senderName}}', { firstName: 'Ada' }, { required: ['senderName'] });
    expect(output.missing).toEqual(['senderName']);
    expect(output.unresolved).toEqual(['unknownThing']);
  });

  it('renders lifecycle context with the existing HTML escaping and explicit custom-field values', () => {
    const values = leadVariables({ ...lead, latestCall: { qualificationStatus: 'QUALIFIED' } }, {
      callSummary: 'Requested <demo>', customField: 'Enterprise',
    });
    expect(renderPersonalized('{{qualificationStatus}}: {{callSummary}} / {{customField}}', values, { html: true }))
      .toEqual({ value: 'QUALIFIED: Requested &lt;demo&gt; / Enterprise', missing: [], unresolved: [] });
  });

  it.each([
    ['', 'GSM-7', 0, 0],
    ['^'.repeat(80), 'GSM-7', 160, 1],
    ['€'.repeat(81), 'GSM-7', 162, 2],
    ['`'.repeat(71), 'UCS-2', 71, 2],
    ['🙂'.repeat(35), 'UCS-2', 70, 1],
    ['🙂'.repeat(36), 'UCS-2', 72, 2],
    ['مرحبا', 'UCS-2', 5, 1],
    ['ÄÖÑÜà', 'GSM-7', 5, 1],
  ])('counts encoding units for %s', (text, encoding, units, segments) => {
    expect(smsSegments(text)).toMatchObject({ encoding, units, segments });
  });

  it('extracts variables, escapes HTML, and estimates SMS segments', () => {
    expect(extractVariables('Hi {{firstName}}', '{{city}}')).toEqual(['firstName', 'city']);
    expect(escapeHtml('<a & b>')).toBe('&lt;a &amp; b&gt;');
    expect(smsSegments('a'.repeat(161)).segments).toBe(2);
    expect(smsSegments('🙂'.repeat(71))).toMatchObject({ unicode: true, units: 142, segments: 3 });
  });
});
