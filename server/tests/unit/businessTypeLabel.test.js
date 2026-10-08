import { describe, it, expect } from '@jest/globals';
import { normalizeBusinessType, labelFromCatalogIds } from '../../src/modules/crm/businessTypeLabel.js';

describe('normalizeBusinessType', () => {
  it('maps OSM tag values to clean catalog labels', () => {
    expect(normalizeBusinessType('restaurant')).toBe('Restaurant');
    expect(normalizeBusinessType('fast_food')).toBe('Fast Food');
    expect(normalizeBusinessType('amenity=restaurant')).toBe('Restaurant');
    expect(normalizeBusinessType('hairdresser')).toBe('Salon');
    expect(normalizeBusinessType('shop=clothes')).toBe('Clothing Store');
  });

  it('maps catalog ids and Google includedTypes', () => {
    expect(normalizeBusinessType('fast-food')).toBe('Fast Food');
    expect(normalizeBusinessType('fast_food_restaurant')).toBe('Fast Food');
    expect(normalizeBusinessType('real_estate_agency')).toBe('Real Estate Agency');
    expect(normalizeBusinessType('pharmacy')).toBe('Pharmacy');
  });

  it('takes the first of a legacy comma-joined list (old discovery format)', () => {
    expect(normalizeBusinessType('hotel,restaurant')).toBe('Hotel');
    expect(normalizeBusinessType('dentist|clinic')).toBe('Dentist');
  });

  it('keeps an already-human provider label instead of coarsening it', () => {
    // A spaced, cased Maps category is often MORE specific than the catalog.
    expect(normalizeBusinessType('Hair salon')).toBe('Hair salon');
    expect(normalizeBusinessType('Indian restaurant')).toBe('Indian restaurant');
    expect(normalizeBusinessType('IT Company')).toBe('IT Company');
  });

  it('humanizes an unknown machine token rather than inventing a category', () => {
    expect(normalizeBusinessType('some_custom_type')).toBe('Some Custom Type');
  });

  it('returns null for empty / missing input (never fabricated)', () => {
    expect(normalizeBusinessType(null)).toBeNull();
    expect(normalizeBusinessType('')).toBeNull();
    expect(normalizeBusinessType('   ')).toBeNull();
  });

  it('labelFromCatalogIds resolves the first known catalog id', () => {
    expect(labelFromCatalogIds(['hotel', 'restaurant'])).toBe('Hotel');
    expect(labelFromCatalogIds(['not-a-real-id'])).toBeNull();
    expect(labelFromCatalogIds([])).toBeNull();
  });
});
