import { describe, expect, test } from '@jest/globals';
import { createCustomerSchema, updateCustomerSchema } from '../../src/modules/crm/customer.validation.js';

const validCompany = {
  name: 'Muster AG',
  type: 'business',
  ownerName: 'Max Muster',
  uidNumber: 'CHE-123.456.789',
  street: 'Bahnhofstrasse 1',
  postalCode: '8001',
  city: 'Zurich',
  canton: 'ZH',
  country: 'CH',
};

describe('CRM customer validation', () => {
  test('requires owner name and UID number for company creation', () => {
    const { error } = createCustomerSchema.body.validate({
      ...validCompany,
      ownerName: '',
      uidNumber: '',
    }, { abortEarly: false });

    expect(error).toBeDefined();
    expect(error.details.map((detail) => detail.path.join('.'))).toEqual(
      expect.arrayContaining(['ownerName', 'uidNumber']),
    );
  });

  test('allows company creation when owner name and UID number are present', () => {
    const { error, value } = createCustomerSchema.body.validate(validCompany, { abortEarly: false });

    expect(error).toBeUndefined();
    expect(value).toMatchObject({
      type: 'business',
      ownerName: 'Max Muster',
      uidNumber: 'CHE-123.456.789',
    });
  });

  test('keeps private customer creation free from company-only fields', () => {
    const { error } = createCustomerSchema.body.validate({
      name: 'Max Muster',
      type: 'private',
      street: 'Bahnhofstrasse 1',
      postalCode: '8001',
      city: 'Zurich',
      country: 'CH',
    }, { abortEarly: false });

    expect(error).toBeUndefined();
  });

  test('requires company identity fields when an update changes type to business', () => {
    const { error } = updateCustomerSchema.body.validate({ type: 'business' }, { abortEarly: false });

    expect(error).toBeDefined();
    expect(error.details.map((detail) => detail.path.join('.'))).toEqual(
      expect.arrayContaining(['ownerName', 'uidNumber']),
    );
  });
});
