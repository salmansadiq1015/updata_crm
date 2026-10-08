import { jest, describe, it, expect, beforeAll, beforeEach } from '@jest/globals';

const mockReverse = jest.fn();
jest.unstable_mockModule('../../src/modules/businessDiscovery/provider/NominatimProvider.js', () => ({
  nominatimProvider: { isConfigured: () => true, reverseGeocode: (...args) => mockReverse(...args) },
  default: {},
}));
jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

let sanitizeCity, normalizeCountryCode, resolveLeadAddress, _resetReverseBudget;

const lahoreReverse = {
  result: {
    address_components: [
      { types: ['locality'], long_name: 'Lahore', short_name: 'Lahore' },
      { types: ['country'], long_name: 'Pakistan', short_name: 'PK' },
      { types: ['postal_code'], long_name: '54000', short_name: '54000' },
    ],
    address: { city: 'Lahore', country: 'Pakistan', country_code: 'pk', postcode: '54000' },
  },
};

// Nominatim's raw `address` object is the reliable source (its address_components
// use raw OSM keys, not Google types). This one carries a suburb + state.
const lahoreRichReverse = {
  result: {
    address_components: [],
    address: {
      suburb: 'Johar Town', neighbourhood: 'Block R3',
      city: 'Lahore', state: 'Punjab', country: 'Pakistan', country_code: 'pk', postcode: '54600',
      road: 'Shaukat Khanum Road', house_number: '94',
    },
  },
};

beforeAll(async () => {
  ({ sanitizeCity, normalizeCountryCode, resolveLeadAddress, _resetReverseBudget } =
    await import('../../src/modules/crm/leadLocation.js'));
});

beforeEach(() => {
  mockReverse.mockReset();
  _resetReverseBudget();
});

describe('sanitizeCity', () => {
  it('keeps real city names, drops postal codes and junk', () => {
    expect(sanitizeCity('Lahore')).toBe('Lahore');
    expect(sanitizeCity('54000')).toBeNull();
    expect(sanitizeCity('  54 600 ')).toBeNull();
    expect(sanitizeCity('PRESS CONFERENCE')).toBeNull();
    expect(sanitizeCity('Add a label')).toBeNull();
    expect(sanitizeCity('')).toBeNull();
  });
});

describe('normalizeCountryCode', () => {
  it('maps names and codes, rejects the unknown (never a wrong guess)', () => {
    expect(normalizeCountryCode('Pakistan')).toBe('PK');
    expect(normalizeCountryCode('pk')).toBe('PK');
    expect(normalizeCountryCode('CH')).toBe('CH');
    expect(normalizeCountryCode('PRESS CONFERENCE')).toBeNull();
    expect(normalizeCountryCode(null)).toBeNull();
  });
});

describe('resolveLeadAddress', () => {
  it('reverse-geocodes a postal-code city + missing country from coordinates', async () => {
    mockReverse.mockResolvedValue(lahoreReverse);
    const addr = await resolveLeadAddress({
      city: '54000', postalCode: '54000', country: null, latitude: 31.5204, longitude: 74.3587,
    });
    expect(addr).toMatchObject({ city: 'Lahore', country: 'PK', canton: null });
    expect(mockReverse).toHaveBeenCalledTimes(1);
  });

  it('fills area (neighborhood) + region (state) from coordinates, non-Swiss', async () => {
    mockReverse.mockResolvedValue(lahoreRichReverse);
    const addr = await resolveLeadAddress({
      city: '54600', country: null, latitude: 31.47, longitude: 74.28,
    });
    expect(addr).toMatchObject({
      city: 'Lahore',
      area: 'Johar Town',
      region: 'Punjab', // non-Swiss region kept; canton stays null
      canton: null,
      country: 'PK',
    });
  });

  it('never surfaces a bare postal code as the area', async () => {
    mockReverse.mockResolvedValue({ result: { address: { suburb: '54000', city: 'Lahore', country_code: 'pk' } } });
    const addr = await resolveLeadAddress({ city: null, latitude: 31.5, longitude: 74.3 });
    expect(addr.area).toBeNull();
    expect(addr.city).toBe('Lahore');
  });

  it('uses provided valid city + country without geocoding', async () => {
    const addr = await resolveLeadAddress({ city: 'Lahore', country: 'Pakistan', latitude: 31.52, longitude: 74.35 });
    expect(addr).toMatchObject({ city: 'Lahore', country: 'PK' });
    expect(mockReverse).not.toHaveBeenCalled();
  });

  it('NEVER defaults a non-Swiss lead to CH when the country is unknown', async () => {
    mockReverse.mockResolvedValue({ result: null }); // geocode yields nothing
    const addr = await resolveLeadAddress({ city: 'Somewhere', country: null, latitude: 31.52, longitude: 74.35 });
    expect(addr.country).toBeNull(); // was wrongly 'CH' before the fix
  });

  it('defaults to CH only when coordinates are actually in Switzerland', async () => {
    const addr = await resolveLeadAddress({ city: 'Zürich', country: null, latitude: 47.3769, longitude: 8.5417 });
    expect(addr.country).toBe('CH');
  });

  it('keeps a Swiss canton only for CH leads', async () => {
    const chAddr = await resolveLeadAddress({ city: 'Zürich', state: 'ZH', country: 'CH', latitude: 47.37, longitude: 8.54 });
    expect(chAddr.canton).toBe('ZH');
    const pkAddr = await resolveLeadAddress({ city: 'Lahore', state: 'Punjab', country: 'PK', latitude: 31.52, longitude: 74.35 });
    expect(pkAddr.canton).toBeNull();
  });

  it('caches by rounded coordinates (one geocode for a cluster of nearby leads)', async () => {
    mockReverse.mockResolvedValue(lahoreReverse);
    await resolveLeadAddress({ city: '54000', latitude: 31.5204, longitude: 74.3587 });
    await resolveLeadAddress({ city: '54000', latitude: 31.5211, longitude: 74.3590 }); // ~100m away
    expect(mockReverse).toHaveBeenCalledTimes(1);
  });
});
