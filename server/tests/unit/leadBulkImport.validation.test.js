import { describe, it, expect } from '@jest/globals';
import { bulkImport } from '../../src/modules/crm/lead.validation.js';

// Mirror the `validate` middleware options so the test reflects the real gate.
const validateBody = (body) =>
  bulkImport.body.validate(body, { abortEarly: false, stripUnknown: true, convert: true });

describe('bulkImport validation gate is fault-tolerant per field', () => {
  it('does NOT reject the batch when a row phone exceeds the old 50-char cap', () => {
    // The production regression: one row with phone length > 50 returned
    // "Validation failed: leads.N.phone … must be ≤ 50" and failed all rows.
    const sixty = '1'.repeat(60);
    const { error, value } = validateBody({
      leads: [
        { clientId: 'a', businessName: 'Hotel A', phone: '+33 1 23 45 67 89' },
        { clientId: 'b', businessName: 'Hotel B', phone: sixty },
      ],
    });
    expect(error).toBeUndefined();
    expect(value.leads).toHaveLength(2);
    expect(value.leads[1].phone).toBe(sixty); // accepted; service normalises later
  });

  it('truncates an extreme phone rather than rejecting the batch', () => {
    const { error, value } = validateBody({
      leads: [{ clientId: 'a', businessName: 'Hotel A', phone: 'x'.repeat(200) }],
    });
    expect(error).toBeUndefined();
    expect(value.leads[0].phone).toHaveLength(120);
  });

  it('tolerates a scheme-less website and unparseable numbers (failover → null)', () => {
    const { error, value } = validateBody({
      leads: [{
        clientId: 'a',
        businessName: 'Hotel A',
        website: 'example.com',
        rating: 'N/A',
        latitude: 'oops',
        reviewCount: 'many',
      }],
    });
    expect(error).toBeUndefined();
    expect(value.leads[0].website).toBe('example.com');
    expect(value.leads[0].rating).toBeNull();
    expect(value.leads[0].latitude).toBeNull();
    expect(value.leads[0].reviewCount).toBeNull();
  });

  it('still enforces batch-level caps (1..500 leads)', () => {
    expect(validateBody({ leads: [] }).error).toBeDefined();
    const tooMany = Array.from({ length: 501 }, (_, i) => ({ clientId: String(i), businessName: 'X' }));
    expect(validateBody({ leads: tooMany }).error).toBeDefined();
  });
});
