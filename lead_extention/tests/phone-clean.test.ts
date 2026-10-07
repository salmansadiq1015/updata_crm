import { describe, expect, it } from 'vitest';
import { cleanPhone } from '../src/shared/utils';

describe('cleanPhone rejects non-phone text, keeps real numbers', () => {
  it('drops Maps text that is not a phone (the production junk)', () => {
    expect(cleanPhone('Hôtel Clarisse · Visited link in your Google Maps session')).toBeNull();
    expect(cleanPhone('Add a label')).toBeNull();
    expect(cleanPhone('Restaurant')).toBeNull();
  });

  it('extracts and keeps plausible phone numbers', () => {
    expect(cleanPhone('+33 1 23 45 67 89')).toBe('+33 1 23 45 67 89');
    expect(cleanPhone('Call: +44 20 7946 0958')).toBe('+44 20 7946 0958');
    expect(cleanPhone('0300 1234567')).toBe('0300 1234567');
  });

  it('caps absurdly long input to the model limit', () => {
    const long = `+1 ${'9'.repeat(80)}`;
    const out = cleanPhone(long, 50);
    expect(out).not.toBeNull();
    expect(out!.length).toBeLessThanOrEqual(50);
  });
});
