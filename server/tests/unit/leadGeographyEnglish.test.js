import { jest, describe, expect, it } from '@jest/globals';

jest.unstable_mockModule('../../src/modules/businessDiscovery/provider/NominatimProvider.js', () => ({
  nominatimProvider: { isConfigured: () => false, reverseGeocode: jest.fn() },
}));
jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const {
  canonicalizeLeadAddress, isNonLatinOnly, needsGeoRepair, preferLatinScript,
} = await import('../../src/modules/crm/leadGeography.js');
const { addressFromNominatim } = await import('../../src/modules/crm/leadLocation.js');

describe('English / Latin-script place names', () => {
  it('keeps the Latin name of a bilingual label', () => {
    expect(preferLatinScript('Mohammédia المحمدية')).toBe('Mohammédia');
    expect(preferLatinScript('Bni Yakhlef ⴱⵏⵉ ⵉⵅⵍⴼ بني يخلف')).toBe('Bni Yakhlef');
    expect(preferLatinScript('Pachalik de Mohammédia باشوية المحمدية')).toBe('Pachalik de Mohammédia');
    expect(preferLatinScript('Lahore (لاہور)')).toBe('Lahore');
  });

  it('leaves single-script names untouched', () => {
    expect(preferLatinScript('Le Kremlin-Bicêtre')).toBe('Le Kremlin-Bicêtre');
    expect(preferLatinScript('لاہور')).toBe('لاہور');
    expect(isNonLatinOnly('لاہور کینٹ')).toBe(true);
    expect(isNonLatinOnly('Lahore')).toBe(false);
  });

  it('canonical city of a bilingual label equals its English spelling', () => {
    const a = canonicalizeLeadAddress({ country: 'MA', city: 'Mohammédia المحمدية' });
    const b = canonicalizeLeadAddress({ country: 'MA', city: 'Mohammedia' });
    expect(a.city).toBe('Mohammédia');
    expect(a.geography.cityId).toBe(b.geography.cityId);
  });

  it('strips a space-separated country only when it is the lead country', () => {
    expect(canonicalizeLeadAddress({ country: 'PK', city: 'Lahore Pakistan' }).city).toBe('Lahore');
    expect(canonicalizeLeadAddress({ country: 'US', city: 'New Mexico' }).city).toBe('New Mexico');
  });

  it('flags non-place city values for repair from coordinates', () => {
    for (const junk of ['A Rosewood Hotel · Visited link', 'Bd de Palestine', 'Immeuble Haj Yemmou',
      'au dessus de AttijariWafa banque', 'CENTER 13 carrefour', 'Résidence Lahoussine', '5Th Floor', 'لاہور']) {
      expect(needsGeoRepair(junk)).toBe(true);
    }
    for (const ok of ['Paris', 'Mohammédia المحمدية', 'Charenton-le-Pont', 'Centre', 'Johar Town', 'Saint-Denis']) {
      expect(needsGeoRepair(ok)).toBe(false);
    }
  });
});

// Real Nominatim reverse responses (accept-language=en) for stored leads.
const reverse = (address) => ({ address });

describe('addressFromNominatim', () => {
  it('uses the metro city for a Lahore suburb that OSM tags as a village', () => {
    expect(addressFromNominatim(reverse({
      suburb: 'Bahria Town', village: 'Tarogill', municipality: 'Raiwind Tehsil', county: 'Lahore District', state: 'Punjab', country_code: 'pk',
    }))).toMatchObject({ city: 'Lahore', area: 'Bahria Town', country: 'PK' });
    expect(addressFromNominatim(reverse({
      suburb: 'Wapda Town', village: 'Khumbe', municipality: 'Model Town Tehsil', county: 'Lahore District', country_code: 'pk',
    }))).toMatchObject({ city: 'Lahore', area: 'Wapda Town' });
  });

  it('folds a town named after its district (Lahore Cant) into the metro city', () => {
    expect(addressFromNominatim(reverse({
      suburb: 'Gulberg', town: 'Lahore Cant', municipality: 'Lahore Cantonment Tehsil', county: 'Lahore District', country_code: 'pk',
    }))).toMatchObject({ city: 'Lahore', area: 'Gulberg' });
  });

  it('keeps a real town as its own city and a real city as-is', () => {
    expect(addressFromNominatim(reverse({
      town: 'Bouznika', county: 'Pachalik de Bouznika', state_district: 'Benslimane Province', country_code: 'ma',
    }))).toMatchObject({ city: 'Bouznika', country: 'MA' });
    expect(addressFromNominatim(reverse({
      residential: 'WAPDA Town', suburb: 'Johar Town', city: 'Lahore', county: 'Lahore District', country_code: 'pk',
    }))).toMatchObject({ city: 'Lahore', area: 'Johar Town' });
  });

  it('returns Latin names for bilingual OSM labels and the arrondissement as the Paris area', () => {
    expect(addressFromNominatim(reverse({
      city: 'Mohammedia', county: 'Pachalik de Mohammédia باشوية المحمدية', state: 'Casablanca-Settat', country_code: 'ma',
    }))).toMatchObject({ city: 'Mohammedia', region: 'Casablanca-Settat' });
    const paris = addressFromNominatim(reverse({
      suburb: '8th Arrondissement of Paris', city_district: 'Paris', city: 'Paris', state: 'Ile-de-France', country_code: 'fr',
    }));
    expect(paris).toMatchObject({ city: 'Paris', area: '8th Arrondissement of Paris', country: 'FR' });
    expect(canonicalizeLeadAddress(paris)).toMatchObject({ city: 'Paris', area: '8th Arrondissement' });
  });
});

describe('addressFromNominatim — administrative units', () => {
  it('never reports a tehsil as the city', () => {
    expect(addressFromNominatim(reverse({
      suburb: 'Allama Iqbal Town', municipality: 'Model Town Tehsil', county: 'Lahore District', country_code: 'pk',
    }))).toMatchObject({ city: 'Lahore', area: 'Allama Iqbal Town' });
  });
});
