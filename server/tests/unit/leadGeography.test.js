import { describe, expect, it } from '@jest/globals';
import {
  canonicalizeLeadAddress,
  normalizeCountryCode,
} from '../../src/modules/crm/leadGeography.js';

describe('canonical lead geography', () => {
  it('merges Lahore and Lahore, Pakistan under one canonical Pakistani city', () => {
    const plain = canonicalizeLeadAddress({ city: ' Lahore ', country: 'PK' });
    const suffixed = canonicalizeLeadAddress({ city: 'Lahore, Pakistan', area: 'Lahore' });

    expect(suffixed).toMatchObject({ country: 'PK', city: 'Lahore', area: null });
    expect(suffixed.geography.cityId).toBe(plain.geography.cityId);
    expect(suffixed.geography.reviewRequired).toBe(false);
  });

  it('keeps the same city name in different countries separate', () => {
    const unitedStates = canonicalizeLeadAddress({ city: 'Springfield', country: 'US' });
    const canada = canonicalizeLeadAddress({ city: 'Springfield', country: 'CA' });
    expect(unitedStates.geography.cityId).not.toBe(canada.geography.cityId);
  });

  it('moves arrondissement-shaped city values under their real parent city', () => {
    const fromCity = canonicalizeLeadAddress({ city: 'Paris 10th Arrondissement', country: 'FR' });
    const fromArea = canonicalizeLeadAddress({ city: 'Paris', area: '10th arrondissement of Paris', country: 'France' });
    const compact = canonicalizeLeadAddress({ city: 'Paris', area: 'Paris 10e', country: 'FR' });

    expect(fromCity).toMatchObject({ city: 'Paris', area: '10th Arrondissement' });
    expect(fromCity.geography.locationType).toBe('arrondissement');
    expect(fromCity.geography.cityId).toBe(fromArea.geography.cityId);
    expect(fromCity.geography.areaId).toBe(fromArea.geography.areaId);
    expect(compact.geography.areaId).toBe(fromArea.geography.areaId);
  });

  it('keeps distinct arrondissements as distinct areas', () => {
    const tenth = canonicalizeLeadAddress({ city: 'Paris', area: 'Paris 10e', country: 'FR' });
    const eleventh = canonicalizeLeadAddress({ city: 'Paris', area: 'Paris 11e', country: 'FR' });
    expect(tenth.geography.cityId).toBe(eleventh.geography.cityId);
    expect(tenth.geography.areaId).not.toBe(eleventh.geography.areaId);
  });

  it('scopes the same neighborhood name to its parent city', () => {
    const paris = canonicalizeLeadAddress({ city: 'Paris', area: 'Centre', country: 'FR' });
    const lausanne = canonicalizeLeadAddress({ city: 'Lausanne', area: 'Centre', country: 'CH' });
    expect(paris.geography.areaId).not.toBe(lausanne.geography.areaId);
  });

  it('normalizes accents and case for identity without losing the display value', () => {
    const accented = canonicalizeLeadAddress({ city: 'Málaga', country: 'ES' });
    const ascii = canonicalizeLeadAddress({ city: 'malaga', country: 'Spain' });
    expect(accented.geography.cityId).toBe(ascii.geography.cityId);
    expect(accented.city).toBe('Málaga');
  });

  it('preserves ambiguous area text but prevents it from becoming a filter area', () => {
    const result = canonicalizeLeadAddress({ city: 'Paris', area: '10 Rue Trousseau', country: 'FR' });
    expect(result.area).toBe('10 Rue Trousseau');
    expect(result.geography.areaId).toBeNull();
    expect(result.geography.reviewRequired).toBe(true);
    expect(result.geography.issues).toContain('AMBIGUOUS_AREA');
  });

  it('quarantines an inherited country that has no reliable geographic evidence', () => {
    const result = canonicalizeLeadAddress(
      { city: 'Lahore', country: 'CH' },
      { countryVerified: false, source: 'migration_014' },
    );

    expect(result.country).toBeNull();
    expect(result.city).toBe('Lahore');
    expect(result.geography.countryId).toBeNull();
    expect(result.geography.cityId).toBeNull();
    expect(result.geography.reviewRequired).toBe(true);
    expect(result.geography.issues).toEqual(expect.arrayContaining([
      'UNVERIFIED_COUNTRY',
      'CITY_WITHOUT_COUNTRY',
    ]));
  });

  it('is repeatable and supports localized country names', () => {
    const first = canonicalizeLeadAddress(
      { city: 'Zürich', area: 'Altstadt', country: 'Schweiz' },
      { source: 'test' },
    );
    const second = canonicalizeLeadAddress(first, { source: 'test' });
    expect(second).toEqual(first);
    expect(normalizeCountryCode('المغرب')).toBe('MA');
  });
});
