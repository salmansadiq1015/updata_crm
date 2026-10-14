import { describe, expect, it } from '@jest/globals';
import { createLead, updateLead } from '../../src/modules/crm/lead.validation.js';

const validateCreate = (contact) => createLead.body.validate(
  { name: 'Muster GmbH', ...contact },
  { abortEarly: false, stripUnknown: true, convert: true },
);

const validateUpdate = (contact) => updateLead.body.validate(
  contact,
  { abortEarly: false, stripUnknown: true, convert: true },
);

describe('lead email and phone validation', () => {
  it.each([
    '044/123 45 67',
    "079'123'45'67",
    '+41 44 123 45 67',
    '0041 44 123 45 67',
    '+41 (0)44 123 45 67',
    '+49 30 1234567',
    '0033 1 23 45 67 89',
  ])('accepts a dialable, explicit phone format: %s', (phone) => {
    expect(validateCreate({ phone }).error).toBeUndefined();
    expect(validateUpdate({ mobile: phone }).error).toBeUndefined();
  });

  it.each([
    'call me',
    '123456789',
    '44 123 45 67',
    '+41 44 123',
    '+41 044 123 45 67',
  ])('rejects an invalid or ambiguous phone format: %s', (phone) => {
    expect(validateCreate({ phone }).error?.details[0].type).toBe('string.phone');
    expect(validateUpdate({ mobile: phone }).error?.details[0].type).toBe('string.phone');
  });

  it('accepts empty optional contact fields and rejects malformed email addresses', () => {
    expect(validateCreate({ email: '', phone: null, mobile: null }).error).toBeUndefined();
    expect(validateUpdate({ email: null, phone: '', mobile: '' }).error).toBeUndefined();
    expect(validateCreate({ email: 'sales@example.com' }).error).toBeUndefined();
    expect(validateCreate({ email: 'sales@example' }).error?.details[0].type).toBe('string.email');
    expect(validateUpdate({ email: 'not-an-email' }).error?.details[0].type).toBe('string.email');
  });
});
