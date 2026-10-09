import { describe, expect, it } from 'vitest';
import type { Lead, SearchRecord } from '../types';
import { partitionSearchLeads, visibleSearchIdFor } from '../search-results';

const lead = (id: string, searchId: string): Lead => ({
  id, searchId, source: 'google-maps', sourceUrl: `https://maps.example/${id}`,
  googleMapsUrl: `https://maps.example/${id}`, placeIdentifier: id,
  businessName: id, category: null, categories: [], phone: null,
  internationalPhone: null, website: null, emails: [], address: null,
  street: null, area: null, city: null, state: null, postalCode: null,
  country: null, latitude: null, longitude: null, distanceMeters: null,
  distanceKm: null, geographicValidation: 'unverified', rating: null,
  reviewCount: null, ratingBreakdown: null, photos: [], businessStatus: null,
  openingHours: [], priceLevel: null, emailSource: null, emailConfidence: null,
  enrichmentStatus: 'not-requested', discoveredAt: '2026-10-09T00:00:00.000Z',
  updatedAt: '2026-10-09T00:00:00.000Z',
});

const search = (id: string, startedAt: string): SearchRecord => ({
  id, businessType: 'Hotel', location: id, radiusKm: 10, query: `Hotel near ${id}`,
  startedAt, completedAt: null, status: 'completed', discoveredCount: 1,
  uniqueCount: 1, exportedCount: 0,
});

describe('search result isolation', () => {
  const paris = search('paris', '2026-10-09T10:00:00.000Z');
  const lahore = search('lahore', '2026-10-09T11:00:00.000Z');

  it('keeps Paris visible when a newer Lahore search fails before saving valid rows', () => {
    const leads = [lead('paris-hotel', 'paris')];
    const visible = visibleSearchIdFor(leads, [lahore, paris], 'lahore');
    expect(visible).toBe('paris');
    expect(partitionSearchLeads(leads, visible).active.map((item) => item.id)).toEqual(['paris-hotel']);
  });

  it('switches atomically to Lahore only after Lahore stores a valid row', () => {
    const leads = [lead('paris-hotel', 'paris'), lead('lahore-hotel', 'lahore')];
    const visible = visibleSearchIdFor(leads, [lahore, paris], 'lahore');
    const partition = partitionSearchLeads(leads, visible);
    expect(partition.active.map((item) => item.id)).toEqual(['lahore-hotel']);
    expect(partition.history.map((item) => item.id)).toEqual(['paris-hotel']);
  });
});
