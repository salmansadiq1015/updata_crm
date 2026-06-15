import { createCustomerSchema, updateCustomerSchema } from '../validations/customer';

const baseCompany = {
  name: 'Muster AG',
  type: 'business',
  ownerName: 'Max Muster',
  uidNumber: 'CHE-123.456.789',
  street: 'Bahnhofstrasse 1',
  postalCode: '8001',
  city: 'Zurich',
  country: 'CH',
};

describe('customer validation', () => {
  it('requires owner name and UID for company customers', () => {
    const result = createCustomerSchema.safeParse({
      ...baseCompany,
      ownerName: '',
      uidNumber: '',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toEqual(expect.arrayContaining(['ownerName', 'uidNumber']));
    }
  });

  it('allows private customers without company-only fields', () => {
    const result = createCustomerSchema.safeParse({
      name: 'Max Muster',
      type: 'private',
      street: 'Bahnhofstrasse 1',
      postalCode: '8001',
      city: 'Zurich',
      country: 'CH',
    });

    expect(result.success).toBe(true);
  });

  it('requires company identity fields when changing type to business', () => {
    const result = updateCustomerSchema.safeParse({ type: 'business' });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toEqual(expect.arrayContaining(['ownerName', 'uidNumber']));
    }
  });
});
