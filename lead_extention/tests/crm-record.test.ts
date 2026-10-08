import { describe, expect, it } from 'vitest';
import { toExtensionRecord } from '../src/integration/crm-api';
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

  it('never fabricates a rating distribution when the histogram was not scraped', () => {
    const record = toExtensionRecord(lead({ ratingBreakdown: null })) as Record<string, unknown>;
    expect(record.ratingDistribution).toBeNull();
  });
});
