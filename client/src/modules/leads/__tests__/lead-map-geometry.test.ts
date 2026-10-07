import { describe, expect, it } from 'vitest';
import {
  boundsOf,
  haversineMeters,
  isPointInArea,
  type LeadMapArea,
} from '../ui/map/lead-map-types';

// Reference points around Zürich HB.
const ZURICH = { lat: 47.3769, lng: 8.5417 };
const WINTERTHUR = { lat: 47.5, lng: 8.724 };

describe('lead-map geometry', () => {
  it('haversineMeters is ~0 for the same point and ~19km Zürich→Winterthur', () => {
    expect(haversineMeters(ZURICH, ZURICH)).toBeCloseTo(0, 5);
    const d = haversineMeters(ZURICH, WINTERTHUR);
    expect(d).toBeGreaterThan(17_000);
    expect(d).toBeLessThan(22_000);
  });

  it('boundsOf returns the tightest box, or null for no points', () => {
    expect(boundsOf([])).toBeNull();
    expect(boundsOf([ZURICH, WINTERTHUR])).toEqual({
      north: WINTERTHUR.lat,
      south: ZURICH.lat,
      east: WINTERTHUR.lng,
      west: ZURICH.lng,
    });
  });

  it('isPointInArea — circle includes near points and excludes far ones', () => {
    const area: LeadMapArea = { kind: 'circle', center: ZURICH, radiusMeters: 1000 };
    expect(isPointInArea({ lat: 47.3775, lng: 8.5425 }, area)).toBe(true);
    expect(isPointInArea(WINTERTHUR, area)).toBe(false);
  });

  it('isPointInArea — rectangle uses inclusive bounds', () => {
    const area: LeadMapArea = { kind: 'rectangle', bounds: { north: 47.4, south: 47.35, east: 8.6, west: 8.5 } };
    expect(isPointInArea(ZURICH, area)).toBe(true);
    expect(isPointInArea(WINTERTHUR, area)).toBe(false);
  });

  it('isPointInArea — polygon uses ray casting (inside vs outside)', () => {
    const area: LeadMapArea = {
      kind: 'polygon',
      points: [
        { lat: 47.35, lng: 8.5 },
        { lat: 47.4, lng: 8.5 },
        { lat: 47.4, lng: 8.6 },
        { lat: 47.35, lng: 8.6 },
      ],
    };
    expect(isPointInArea(ZURICH, area)).toBe(true);
    expect(isPointInArea({ lat: 47.45, lng: 8.55 }, area)).toBe(false);
    // A degenerate polygon (fewer than 3 vertices) contains nothing.
    expect(isPointInArea(ZURICH, { kind: 'polygon', points: [ZURICH] })).toBe(false);
  });
});
