import { describe, expect, it } from 'vitest';
import { toExtensionRecord, toCrmImportCsv } from '../src/integration/crm-api';
import { businessCategory, withImportSearchContext } from '../src/shared/business-category';
import type { SearchRecord } from '../src/shared/types';
import type { Lead } from '../src/shared/types';

const lead = (overrides: Partial<Lead> = {}): Lead => ({
  id: 'x1', source: 'google-maps', sourceUrl: 'https://www.google.com/maps/place/Royal',
  googleMapsUrl: 'https://www.google.com/maps/place/Royal+Tree+Hotel', placeIdentifier: 'place-1',
  businessName: 'Royal Tree Hotel', category: 'Hotel', categories: ['Hotel'],
  phone: '+92 300 1234567', internationalPhone: '+923001234567', website: 'https://royal.example',
  emails: [], address: '94 R, Johar Town, Lahore, 54000, Pakistan', street: '94 R',
  area: 'Johar Town', city: 'Lahore', state: 'Punjab', postalCode: '54000', country: 'Pakistan',
  latitude: 31.47, longitude: 74.28, distanceMeters: null, distanceKm: null,
  rating: 4.9, reviewCount: 336,
  ratingBreakdown: { 5: 300, 4: 20, 3: 10, 2: 4, 1: 2 },
  photos: ['https://lh3.googleusercontent.com/p/abc'], businessStatus: 'Open',
  openingHours: ['Mon 9 AM–11 PM', 'Tue 9 AM–11 PM'], priceLevel: null,
  emailSource: null, emailConfidence: null, enrichmentStatus: 'not-requested',
  discoveredAt: '2026-10-07T00:00:00.000Z', updatedAt: '2026-10-07T00:00:00.000Z', searchId: 's1',
  ...overrides,
});

describe('toExtensionRecord — the CRM payload no longer drops rich business data', () => {
  it.each([null, '', '  ', 'Business', 'establishment', 'point_of_interest', 'No reviews', 'No review', 'Online appointments', 'On-site services', 'N°1', 'Nº 1', '4.8 (23)', 'Aucun avis', 'Keine Bewertungen'])('falls back from missing/generic category %s to this lead’s selected Gym task', (category) => {
    const record = toExtensionRecord(lead({ category, categories: [], discoveryCategories: ['Gym'] }));
    expect(record.category).toBe('Gym');
    expect(record.discoveryCategories).toEqual(['Gym']);
  });

  it('rejects a business name or slogan captured as the category', () => {
    expect(toExtensionRecord(lead({ businessName: 'Tech AB', category: 'Tech AB - Smartpartner', categories: [], discoveryCategories: ['Software companies'] })).category).toBe('Software companies');
  });

  it('preserves actual categories and keeps multi-type campaign provenance per lead', () => {
    expect(businessCategory(lead({ category: 'Fitness center', discoveryCategories: ['Gym'] }))).toBe('Fitness center');
    expect(toExtensionRecord(lead({ category: null, categories: [], discoveryCategories: ['Gym'] })).category).toBe('Gym');
    expect(toExtensionRecord(lead({ category: null, categories: [], discoveryCategories: ['Dentist'] })).category).toBe('Dentist');
    expect(toExtensionRecord(lead({ category: null, categories: ['Gym'], discoveryCategories: [] })).category).toBe('Gym');
  });

  it('recovers legacy context from its saved single-type search, without assigning one type to every mixed-campaign lead', () => {
    const savedSearch = { businessType: 'Gym', location: 'Mohammedia, Morocco' } as SearchRecord;
    const historic = lead({ category: null, categories: [], discoveryCategories: [], searchLocation: null });
    const recovered = withImportSearchContext(historic, savedSearch);
    expect(toExtensionRecord(recovered)).toMatchObject({ category: 'Gym', searchLocation: 'Mohammedia, Morocco' });
    expect(withImportSearchContext(historic, { ...savedSearch, businessTypes: ['Gym', 'Dentist'] }).discoveryCategories).toEqual([]);
    expect(withImportSearchContext(historic, { ...savedSearch, businessTypes: ['Gym', 'Dentist'], config: {
      businessType: 'Gym', businessTypes: [], location: 'Mohammedia', radiusKm: null,
      maxResults: 100, queryExpansion: false, enableEnrichment: false, maxPagesPerWebsite: 1,
    } }).discoveryCategories).toEqual([]);
    expect(withImportSearchContext(historic)).toBe(historic);
  });

  it('preserves every rich field in the CSV fallback, including escaped commas and quotes', () => {
    const original = lead({ businessName: 'Gym "A", Studio', category: null, categories: [], discoveryCategories: ['Gym'] });
    const csv = toCrmImportCsv([original]);
    // Decode a quoted RFC4180 row independently of the serializer.
    const cells = csv.split('\r\n')[1].match(/(?:"(?:[^"]|"")*"|[^,]*)(?:,|$)/g)!.slice(0, -1)
      .map((cell) => cell.replace(/,$/, '')).map((cell) => cell.startsWith('"') ? cell.slice(1, -1).replace(/""/g, '"') : cell);
    const headers = csv.replace(/^\uFEFF/, '').split('\r\n')[0].split(',');
    const payload = JSON.parse(cells[headers.indexOf('extensionRecord')]);
    expect(payload).toEqual(toExtensionRecord(original));
    expect(payload).toMatchObject({ category: 'Gym', area: 'Johar Town', rating: 4.9, businessName: 'Gym "A", Studio' });
  });
  it('sends business type, full location, rating distribution, hours, photos and the maps url', () => {
    const record = toExtensionRecord(lead()) as Record<string, unknown>;
    expect(record.category).toBe('Hotel');
    expect(record.area).toBe('Johar Town');
    expect(record.city).toBe('Lahore');
    expect(record.region).toBe('Punjab');
    expect(record.rating).toBe(4.9);
    expect(record.reviewCount).toBe(336);
    // Real per-star counts, keyed 1..5, exactly as the server expects.
    expect(record.ratingDistribution).toMatchObject({ '5': 300, '1': 2 });
    expect(record.businessStatus).toBe('Open');
    expect(record.openingHours).toEqual(['Mon 9 AM–11 PM', 'Tue 9 AM–11 PM']);
    expect(record.photos).toEqual(['https://lh3.googleusercontent.com/p/abc']);
    expect(record.googleMapsUrl).toContain('google.com/maps/place/Royal');
  });

  it('sends the selected search location as the CRM city/country fallback', () => {
    const record = toExtensionRecord(lead({ searchLocation: 'Lahore, Pakistan' })) as Record<string, unknown>;
    expect(record.searchLocation).toBe('Lahore, Pakistan');
    // Absent when the lead never carried one (older scrapes) — never fabricated.
    expect((toExtensionRecord(lead({ searchLocation: null })) as Record<string, unknown>).searchLocation).toBeNull();
  });

  it('never fabricates a rating distribution when the histogram was not scraped', () => {
    const record = toExtensionRecord(lead({ ratingBreakdown: null })) as Record<string, unknown>;
    expect(record.ratingDistribution).toBeNull();
  });

  it('drops a rating/number captured as the website instead of sending it to the CRM', () => {
    expect((toExtensionRecord(lead({ website: '4.0.0.9' })) as Record<string, unknown>).website).toBeNull();
    expect((toExtensionRecord(lead({ website: '4.3' })) as Record<string, unknown>).website).toBeNull();
    // A real website is still sent.
    expect((toExtensionRecord(lead({ website: 'dentistetoulout-mohammedamine.ma' })) as Record<string, unknown>).website)
      .toBe('https://dentistetoulout-mohammedamine.ma/');
  });
});
