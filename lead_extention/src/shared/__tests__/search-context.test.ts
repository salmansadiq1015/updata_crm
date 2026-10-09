import { describe, expect, it } from 'vitest';
import { buildDiscoveryQueries, isResolvedGeocodeCamera } from '../search-context';

const config = { businessType: 'Hotel', location: '', queryExpansion: true };
const PARIS = { latitude: 48.8566, longitude: 2.3522 };
const LAHORE = { latitude: 31.5204, longitude: 74.3587 };

describe('discovery search context', () => {
  it('never treats a business-only Maps query as a location', () => {
    expect(buildDiscoveryQueries(config, { query: 'Hotel' })).toEqual(['Hotel']);
  });

  it('uses and expands an explicit location', () => {
    expect(buildDiscoveryQueries({ ...config, location: 'Paris, France' }, { query: 'Hotel' }))
      .toEqual(['Hotel near Paris, France', 'Hotel in Paris, France', 'Hotel Paris, France']);
  });

  it('reuses a matching current Maps query without manufacturing near Hotel', () => {
    expect(buildDiscoveryQueries(config, { query: 'Hotels in Lahore' })).toEqual(['Hotels in Lahore']);
  });

  it('rejects a settled but unchanged Lahore camera while resolving Paris', () => {
    expect(isResolvedGeocodeCamera(LAHORE, LAHORE, LAHORE)).toBe(false);
    expect(isResolvedGeocodeCamera(PARIS, PARIS, LAHORE)).toBe(true);
  });
});
