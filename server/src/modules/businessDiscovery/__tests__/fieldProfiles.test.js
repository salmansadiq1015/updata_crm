import { describe, test, expect } from '@jest/globals';
import { FIELD_PROFILES, fieldMask } from '../provider/fieldProfiles.js';

describe('FIELD_PROFILES', () => {
  test('DISCOVERY_MINIMAL carries identity/location/filter fields, no contact fields', () => {
    const m = FIELD_PROFILES.DISCOVERY_MINIMAL;
    expect(m).toContain('places.id');
    expect(m).toContain('places.displayName');
    expect(m).toContain('places.location');
    expect(m).toContain('places.rating');
    expect(m).toContain('places.userRatingCount');
    expect(m).not.toContain('places.websiteUri');
    expect(m).not.toContain('places.internationalPhoneNumber');
    expect(m).not.toContain('places.addressComponents');
  });

  test('DETAILS_STANDARD extends minimal with contact / hours / price', () => {
    const s = FIELD_PROFILES.DETAILS_STANDARD;
    for (const f of FIELD_PROFILES.DISCOVERY_MINIMAL) expect(s).toContain(f);
    expect(s).toContain('places.nationalPhoneNumber');
    expect(s).toContain('places.internationalPhoneNumber');
    expect(s).toContain('places.websiteUri');
    expect(s).toContain('places.regularOpeningHours');
    expect(s).toContain('places.priceLevel');
  });

  test('DETAILS_IMPORT extends standard with addressComponents', () => {
    const i = FIELD_PROFILES.DETAILS_IMPORT;
    for (const f of FIELD_PROFILES.DETAILS_STANDARD) expect(i).toContain(f);
    expect(i).toContain('places.addressComponents');
  });

  test('profiles are frozen', () => {
    expect(Object.isFrozen(FIELD_PROFILES)).toBe(true);
    expect(Object.isFrozen(FIELD_PROFILES.DISCOVERY_MINIMAL)).toBe(true);
  });
});

describe('fieldMask', () => {
  test('resolves a profile name to a comma-joined header string', () => {
    expect(fieldMask('DISCOVERY_MINIMAL')).toBe(FIELD_PROFILES.DISCOVERY_MINIMAL.join(','));
    expect(fieldMask('DISCOVERY_MINIMAL').startsWith('places.id,')).toBe(true);
  });

  test('accepts an explicit array', () => {
    expect(fieldMask(['places.id', 'places.location'])).toBe('places.id,places.location');
  });

  test('throws INVALID_FIELD_PROFILE on unknown / empty input', () => {
    for (const bad of ['bogus', [], null, 42]) {
      let caught;
      try {
        fieldMask(bad);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(Error);
      expect(caught.code).toBe('INVALID_FIELD_PROFILE');
    }
  });
});
