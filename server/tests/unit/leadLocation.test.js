import { jest, describe, it, expect, beforeAll, beforeEach } from '@jest/globals';

const mockReverse = jest.fn();
jest.unstable_mockModule('../../src/modules/businessDiscovery/provider/NominatimProvider.js', () => ({
  nominatimProvider: { isConfigured: () => true, reverseGeocode: (...args) => mockReverse(...args) },
  default: {},
}));
jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

let sanitizeCity, normalizeCountryCode, resolveLeadAddress, parseLocationString, _resetReverseBudget;

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
  ({ sanitizeCity, normalizeCountryCode, resolveLeadAddress, parseLocationString, _resetReverseBudget } =
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

describe('parseLocationString (selected search location → city/country)', () => {
  it('splits "City, Country" into a reliable city + ISO country', () => {
    expect(parseLocationString('Lahore, Pakistan')).toEqual({ city: 'Lahore', country: 'PK' });
    expect(parseLocationString('Paris, France')).toEqual({ city: 'Paris', country: 'FR' });
    expect(parseLocationString('Casablanca, Casablanca-Settat, Morocco'))
      .toEqual({ city: 'Casablanca', country: 'MA' });
  });

  it('treats a lone place name as the city (no country invented)', () => {
    expect(parseLocationString('Lahore')).toEqual({ city: 'Lahore', country: null });
  });

  it('treats a lone country as the country, never a city', () => {
    expect(parseLocationString('Pakistan')).toEqual({ city: null, country: 'PK' });
  });

  it('never returns a postal code or junk as the city', () => {
    expect(parseLocationString('54000, Pakistan')).toEqual({ city: null, country: 'PK' });
    expect(parseLocationString('')).toEqual({ city: null, country: null });
    expect(parseLocationString(null)).toEqual({ city: null, country: null });
  });

  it('leaves the country null for an unknown place (no wrong guess)', () => {
    expect(parseLocationString('Smalltown, Neverland')).toEqual({ city: 'Smalltown', country: null });
  });
});

describe('resolveLeadAddress — selected-search-location fallback', () => {
  it('resolves a missing extension area even when city/country are already valid', async () => {
    mockReverse.mockResolvedValue(lahoreRichReverse);
    const address = await resolveLeadAddress({ city: 'Lahore', country: 'PK', latitude: 31.47, longitude: 74.28, resolveArea: true });
    expect(address).toMatchObject({ city: 'Lahore', country: 'PK', area: 'Johar Town' });
    expect(address.geography.areaId).toMatch(/^area:/);
    expect(mockReverse).toHaveBeenCalledTimes(1);
  });

  it('recovers an explicit area in the full address without geocoding or substituting the city', async () => {
    const address = await resolveLeadAddress({ city: 'Mohammedia', country: 'MA', formatted: '12 Boulevard, Park Plaza, Mohammedia, Morocco', resolveArea: true });
    expect(address.area).toBe('Park Plaza');
    expect(mockReverse).not.toHaveBeenCalled();
    const noArea = await resolveLeadAddress({ city: 'Mohammedia', country: 'MA', formatted: '12 Boulevard, Mohammedia, Morocco', resolveArea: true });
    expect(noArea.area).toBeNull();
  });

  it('does not geocode null coordinates or erase a valid area when the provider is unavailable', async () => {
    await resolveLeadAddress({ city: 'Mohammedia', country: 'MA', latitude: null, longitude: null, resolveArea: true });
    expect(mockReverse).not.toHaveBeenCalled();
    mockReverse.mockRejectedValue(new Error('provider unavailable'));
    const address = await resolveLeadAddress({ area: 'Park Plaza', city: null, country: 'MA', latitude: 33.68, longitude: -7.38, fallbackCity: 'Mohammedia', resolveArea: true });
    expect(address).toMatchObject({ area: 'Park Plaza', city: 'Mohammedia', country: 'MA' });
  });

  it('does not attach a reverse-geocoded area from a different city', async () => {
    mockReverse.mockResolvedValue(lahoreRichReverse);
    const address = await resolveLeadAddress({ city: 'Mohammedia', country: 'MA', latitude: 33.68, longitude: -7.38, resolveArea: true });
    expect(address).toMatchObject({ city: 'Mohammedia', country: 'MA', area: null });
  });
  it('fills a missing CITY from the search location, keeping the provider country', async () => {
    const addr = await resolveLeadAddress({ city: null, country: 'FR', fallbackLocation: 'Paris, France' });
    expect(addr).toMatchObject({ city: 'Paris', country: 'FR' });
    expect(mockReverse).not.toHaveBeenCalled(); // no coords → no geocode
  });

  it('fills a missing COUNTRY from the search location, keeping the provider city', async () => {
    const addr = await resolveLeadAddress({ city: 'Lahore', country: null, fallbackLocation: 'Lahore, Pakistan' });
    expect(addr).toMatchObject({ city: 'Lahore', country: 'PK' });
  });

  it('fills BOTH city and country from the search location when both are missing', async () => {
    const addr = await resolveLeadAddress({ city: null, country: null, fallbackLocation: 'Lahore, Pakistan' });
    expect(addr).toMatchObject({ city: 'Lahore', country: 'PK' });
  });

  it('NEVER overwrites a valid business-specific city/country with the fallback', async () => {
    const addr = await resolveLeadAddress({ city: 'Karachi', country: 'PK', fallbackLocation: 'Lahore, India' });
    expect(addr).toMatchObject({ city: 'Karachi', country: 'PK' });
  });

  it('accepts structured fallbackCity / fallbackCountry hints', async () => {
    const addr = await resolveLeadAddress({ city: null, country: null, fallbackCity: 'Lahore', fallbackCountry: 'PK' });
    expect(addr).toMatchObject({ city: 'Lahore', country: 'PK' });
  });

  it('leaves an unresolved field empty rather than inventing it (ambiguous location)', async () => {
    // A search location that is only a country can fill the country but not a city.
    const addr = await resolveLeadAddress({ city: null, country: null, fallbackLocation: 'Pakistan' });
    expect(addr.country).toBe('PK');
    expect(addr.city).toBeNull();
  });

  it('prefers coordinates over the search location (coordinates are authoritative)', async () => {
    mockReverse.mockResolvedValue(lahoreReverse); // coords resolve to Lahore / PK
    const addr = await resolveLeadAddress({
      city: null, country: null, latitude: 31.5204, longitude: 74.3587, fallbackLocation: 'Paris, France',
    });
    expect(addr).toMatchObject({ city: 'Lahore', country: 'PK' });
  });

  it('falls back to the search location only when coordinates resolve nothing', async () => {
    mockReverse.mockResolvedValue({ result: null });
    const addr = await resolveLeadAddress({
      city: null, country: null, latitude: 31.5204, longitude: 74.3587, fallbackLocation: 'Lahore, Pakistan',
    });
    expect(addr).toMatchObject({ city: 'Lahore', country: 'PK' });
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

  it('caches repeat pins without assigning one neighbourhood to nearby businesses', async () => {
    mockReverse.mockResolvedValue(lahoreReverse);
    await resolveLeadAddress({ city: '54000', latitude: 31.5204, longitude: 74.3587 });
    await resolveLeadAddress({ city: '54000', latitude: 31.5204, longitude: 74.3587 });
    expect(mockReverse).toHaveBeenCalledTimes(1);
    await resolveLeadAddress({ city: '54000', latitude: 31.5211, longitude: 74.3590 });
    expect(mockReverse).toHaveBeenCalledTimes(2);
  });
});
