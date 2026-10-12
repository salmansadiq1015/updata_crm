import { describe, test, expect } from '@jest/globals';
import {
  normalizeName,
  normalizePhone,
  normalizeWebsiteDomain,
  normalizeBusiness,
  buildMapsUrl,
} from '../engine/normalizer.js';

describe('normalizeName', () => {
  test('trims, collapses whitespace, lowercases, folds diacritics', () => {
    expect(normalizeName('  Café   Zürich  ')).toBe('cafe zurich');
  });

  test('maps German ß → ss', () => {
    expect(normalizeName('Großstraße')).toBe('grossstrasse');
  });

  test('non-string → empty string', () => {
    expect(normalizeName(null)).toBe('');
    expect(normalizeName(undefined)).toBe('');
    expect(normalizeName(42)).toBe('');
  });
});

describe('normalizePhone', () => {
  test('CH national 079... → +4179... with national 0-form', () => {
    expect(normalizePhone('079 123 45 67')).toEqual({
      e164: '+41791234567',
      national: '0791234567',
      valid: true,
    });
  });

  test('already-international CH number is preserved', () => {
    const res = normalizePhone('+41 44 123 45 67');
    expect(res.e164).toBe('+41441234567');
    expect(res.valid).toBe(true);
  });

  test('00 international prefix → +', () => {
    expect(normalizePhone('0041 79 123 45 67').e164).toBe('+41791234567');
  });

  test('+1 US number passes through (region stays default CH)', () => {
    const res = normalizePhone('+1 (212) 555-0100');
    expect(res.e164).toBe('+12125550100');
    expect(res.valid).toBe(true);
    expect(res.national).toBeNull(); // not derivable outside the region
  });

  test('garbage / too-short input is invalid', () => {
    expect(normalizePhone('not a phone')).toEqual({ e164: null, national: null, valid: false });
    expect(normalizePhone('12345')).toEqual({ e164: null, national: null, valid: false });
    expect(normalizePhone('')).toEqual({ e164: null, national: null, valid: false });
    expect(normalizePhone(null)).toEqual({ e164: null, national: null, valid: false });
  });
});

describe('normalizeWebsiteDomain', () => {
  test('strips scheme, www, path and query; lowercases', () => {
    expect(normalizeWebsiteDomain('https://www.Example.com/path?q=1')).toBe('example.com');
  });

  test('handles bare and www variants', () => {
    expect(normalizeWebsiteDomain('www.example.com')).toBe('example.com');
    expect(normalizeWebsiteDomain('example.com')).toBe('example.com');
  });

  test('keeps non-www subdomains and multi-part TLDs', () => {
    expect(normalizeWebsiteDomain('http://sub.example.co.uk/x')).toBe('sub.example.co.uk');
  });

  test('invalid input → null', () => {
    expect(normalizeWebsiteDomain('not a url')).toBeNull();
    expect(normalizeWebsiteDomain('')).toBeNull();
    expect(normalizeWebsiteDomain(null)).toBeNull();
  });
});

describe('buildMapsUrl', () => {
  test('canonical lat,lng + query_place_id format', () => {
    expect(buildMapsUrl({ lat: 47.3769, lng: 8.5417, placeId: 'ChIJabc' })).toBe(
      'https://www.google.com/maps/search/?api=1&query=47.3769,8.5417&query_place_id=ChIJabc',
    );
  });

  test('coordinates only (no place id)', () => {
    expect(buildMapsUrl({ lat: 47.3769, lng: 8.5417 })).toBe(
      'https://www.google.com/maps/search/?api=1&query=47.3769,8.5417',
    );
  });

  test('returns null without coordinates or place id', () => {
    expect(buildMapsUrl({})).toBeNull();
    expect(buildMapsUrl()).toBeNull();
  });
});

describe('normalizeBusiness', () => {
  const googlePlace = {
    id: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
    displayName: { text: 'Café Zürich', languageCode: 'de' },
    primaryType: 'cafe',
    types: ['cafe', 'food', 'point_of_interest'],
    nationalPhoneNumber: '044 123 45 67',
    internationalPhoneNumber: '+41 44 123 45 67',
    websiteUri: 'https://www.cafezurich.ch/',
    formattedAddress: 'Bahnhofstrasse 1, 8001 Zürich, Switzerland',
    addressComponents: [
      { longText: '1', shortText: '1', types: ['street_number'] },
      { longText: 'Bahnhofstrasse', shortText: 'Bahnhofstrasse', types: ['route'] },
      { longText: 'Zürich', shortText: 'Zürich', types: ['locality'] },
      { longText: 'Altstadt', shortText: 'Altstadt', types: ['sublocality_level_1'] },
      { longText: 'Zürich', shortText: 'ZH', types: ['administrative_area_level_1'] },
      { longText: '8001', shortText: '8001', types: ['postal_code'] },
      { longText: 'Switzerland', shortText: 'CH', types: ['country'] },
    ],
    location: { latitude: 47.3769, longitude: 8.5417 },
    rating: 4.5,
    userRatingCount: 320,
    priceLevel: 'PRICE_LEVEL_MODERATE',
    businessStatus: 'OPERATIONAL',
    regularOpeningHours: { openNow: true },
  };

  test('maps a Google Places (New) place correctly', () => {
    const b = normalizeBusiness(googlePlace);
    expect(b.name).toBe('Café Zürich');
    expect(b.normalizedName).toBe('cafe zurich');
    expect(b.primaryType).toBe('cafe');
    expect(b.types).toHaveLength(3);
    expect(b.phone).toBe('044 123 45 67');
    expect(b.internationalPhone).toBe('+41 44 123 45 67');
    expect(b.normalizedPhone).toBe('+41441234567');
    expect(b.website).toBe('https://www.cafezurich.ch/');
    expect(b.websiteDomain).toBe('cafezurich.ch');
    expect(b.email).toBeNull(); // Google never supplies it
    expect(b.address).toEqual({
      formatted: 'Bahnhofstrasse 1, 8001 Zürich, Switzerland',
      street: 'Bahnhofstrasse 1',
      area: 'Altstadt',
      city: 'Zürich',
      region: 'Zürich',
      postalCode: '8001',
      country: 'CH',
      canton: 'ZH',
    });
    expect(b.location).toEqual({ type: 'Point', coordinates: [8.5417, 47.3769] });
    expect(b.rating).toBe(4.5);
    expect(b.reviewCount).toBe(320);
    expect(b.priceLevel).toBe('PRICE_LEVEL_MODERATE');
    expect(b.businessStatus).toBe('OPERATIONAL');
    expect(b.openingHours).toEqual({ openNow: true });
    expect(b.mapsUrl).toBe(
      'https://www.google.com/maps/search/?api=1&query=47.3769,8.5417&query_place_id=ChIJN1t_tDeuEmsRUsoyG83frY4',
    );
  });

  test('is defensive about missing fields and never fabricates contact data', () => {
    const b = normalizeBusiness({});
    expect(b.name).toBeNull();
    expect(b.normalizedName).toBeNull();
    expect(b.types).toEqual([]);
    expect(b.phone).toBeNull();
    expect(b.normalizedPhone).toBeNull();
    expect(b.website).toBeNull();
    expect(b.websiteDomain).toBeNull();
    expect(b.email).toBeNull();
    expect(b.location).toBeNull();
    expect(b.mapsUrl).toBeNull();
    expect(b.rating).toBeNull();
  });

  test('maps a generic (non-Google) object shape', () => {
    const b = normalizeBusiness({
      name: 'Foo AG',
      phone: '079 123 45 67',
      website: 'foo.ch',
      location: { coordinates: [8.5, 47.3] }, // GeoJSON [lng, lat]
      address: { city: 'Bern', canton: 'BE' },
    });
    expect(b.name).toBe('Foo AG');
    expect(b.normalizedPhone).toBe('+41791234567');
    expect(b.websiteDomain).toBe('foo.ch');
    expect(b.location).toEqual({ type: 'Point', coordinates: [8.5, 47.3] });
    expect(b.address.city).toBe('Bern');
    expect(b.address.canton).toBe('BE');
  });
});
