import { describe, expect, it } from 'vitest';
import { validateGeographicResult } from '../geographic-validation';

const PARIS = { latitude: 48.8566, longitude: 2.3522 };
const LAHORE = { latitude: 31.5204, longitude: 74.3587 };

describe('search-area validation', () => {
  it('accepts Paris for a Paris search and rejects Lahore', () => {
    expect(validateGeographicResult(PARIS, 10, { latitude: 48.86, longitude: 2.34 }).status).toBe('inside');
    expect(validateGeographicResult(PARIS, 10, LAHORE).status).toBe('outside');
  });

  it('accepts Lahore for a Lahore search and rejects Paris', () => {
    expect(validateGeographicResult(LAHORE, 10, { latitude: 31.51, longitude: 74.35 }).status).toBe('inside');
    expect(validateGeographicResult(LAHORE, 10, PARIS).status).toBe('outside');
  });

  it('does not leak centers while alternating Paris and Lahore', () => {
    const searches = [PARIS, LAHORE, PARIS, LAHORE];
    const results = [PARIS, LAHORE, PARIS, LAHORE];
    expect(searches.map((center, index) => validateGeographicResult(center, 5, results[index]).status))
      .toEqual(['inside', 'inside', 'inside', 'inside']);
    expect(validateGeographicResult(searches[2], 5, results[3]).status).toBe('outside');
  });

  it('keeps coordinate-less records but marks them unverified', () => {
    expect(validateGeographicResult(PARIS, 10, null)).toEqual({
      status: 'unverified', distanceMeters: null, distanceKm: null,
    });
  });
});
