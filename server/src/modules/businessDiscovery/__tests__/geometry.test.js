import { describe, test, expect } from '@jest/globals';
import {
  normalizeArea,
  boundingBox,
  pointInPolygon,
  pointInArea,
  haversineMeters,
  validateGeometry,
  areaSqKm,
} from '../engine/geometry.js';

// Zurich-ish reference point.
const ZURICH = { lat: 47.3769, lng: 8.5417 };

describe('normalizeArea', () => {
  test('radius → closed GeoJSON polygon, surrounding bounds, ~πr² area, same center', () => {
    const out = normalizeArea({ type: 'radius', center: ZURICH, radiusMeters: 5000 });
    expect(out.polygon.type).toBe('Polygon');
    const ring = out.polygon.coordinates[0];
    expect(ring.length).toBe(65); // 64 segments + closing point
    expect(ring[0]).toEqual(ring[ring.length - 1]); // closed ring
    // [lng, lat] order
    expect(out.center).toEqual(ZURICH);
    expect(out.bounds.north).toBeGreaterThan(ZURICH.lat);
    expect(out.bounds.south).toBeLessThan(ZURICH.lat);
    expect(out.bounds.east).toBeGreaterThan(ZURICH.lng);
    expect(out.bounds.west).toBeLessThan(ZURICH.lng);
    // π * 5² ≈ 78.54 km²
    expect(out.areaSqKm).toBeGreaterThan(75);
    expect(out.areaSqKm).toBeLessThan(80);
  });

  test('circle behaves like radius', () => {
    const out = normalizeArea({ type: 'circle', center: ZURICH, radiusMeters: 1000 });
    expect(out.polygon.coordinates[0].length).toBe(65);
    expect(out.areaSqKm).toBeGreaterThan(2.9);
    expect(out.areaSqKm).toBeLessThan(3.3); // π ≈ 3.14 km²
  });

  test('rectangle → 5-point closed ring from bounds, midpoint center', () => {
    const bounds = { north: 47.4, south: 47.35, east: 8.56, west: 8.52 };
    const out = normalizeArea({ type: 'rectangle', bounds });
    const ring = out.polygon.coordinates[0];
    expect(ring.length).toBe(5);
    expect(ring[0]).toEqual(ring[4]);
    expect(out.center).toEqual({ lat: 47.375, lng: 8.54 });
    expect(out.bounds).toEqual(bounds);
    expect(out.areaSqKm).toBeGreaterThan(0);
    // coordinates are [lng, lat]
    expect(ring[0][0]).toBe(8.52);
    expect(ring[0][1]).toBe(47.35);
  });

  test('polygon → bounds/center derived; already-closed ring preserved', () => {
    const geometry = {
      type: 'Polygon',
      coordinates: [[[8.52, 47.35], [8.56, 47.35], [8.56, 47.4], [8.52, 47.4], [8.52, 47.35]]],
    };
    const out = normalizeArea({ type: 'polygon', geometry });
    expect(out.bounds).toEqual({ north: 47.4, south: 47.35, east: 8.56, west: 8.52 });
    expect(out.center).toEqual({ lat: 47.375, lng: 8.54 });
    expect(out.polygon.coordinates[0].length).toBe(5);
  });

  test('polygon with an unclosed ring is auto-closed', () => {
    const geometry = {
      type: 'Polygon',
      coordinates: [[[8.52, 47.35], [8.56, 47.35], [8.56, 47.4], [8.52, 47.4]]],
    };
    const out = normalizeArea({ type: 'polygon', geometry });
    const ring = out.polygon.coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(ring.length).toBe(5);
  });

  test('throws INVALID_GEOMETRY on invalid input', () => {
    const cases = [
      { type: 'radius', center: ZURICH }, // missing radius
      { type: 'radius', center: ZURICH, radiusMeters: 60000 }, // radius too large
      { type: 'rectangle', bounds: { north: 1, south: 2, east: 3, west: 1 } }, // north<=south
      { type: 'bogus' },
      null,
    ];
    for (const c of cases) {
      let caught;
      try {
        normalizeArea(c);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(Error);
      expect(caught.code).toBe('INVALID_GEOMETRY');
    }
  });
});

describe('boundingBox', () => {
  test('computes north/south/east/west from a ring', () => {
    const polygon = { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 20], [0, 20], [0, 0]]] };
    expect(boundingBox(polygon)).toEqual({ north: 20, south: 0, east: 10, west: 0 });
  });
});

describe('pointInPolygon', () => {
  const square = { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] };

  test('point inside returns true', () => {
    expect(pointInPolygon([5, 5], square)).toBe(true);
  });

  test('point outside returns false', () => {
    expect(pointInPolygon([15, 5], square)).toBe(false);
  });

  test('respects [lng, lat] order (lat out of range → outside)', () => {
    // lng=5 inside, lat=15 above the square → outside
    expect(pointInPolygon([5, 15], square)).toBe(false);
  });

  test('works against normalizeArea output', () => {
    const { polygon, center } = normalizeArea({ type: 'radius', center: ZURICH, radiusMeters: 5000 });
    expect(pointInPolygon([center.lng, center.lat], polygon)).toBe(true);
    expect(pointInPolygon([center.lng + 1, center.lat], polygon)).toBe(false);
  });

  test('includes outer boundaries and excludes polygon-hole interiors', () => {
    const withHole = {
      type: 'Polygon',
      coordinates: [
        [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
        [[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]],
      ],
    };
    expect(pointInPolygon([0, 5], withHole)).toBe(true);
    expect(pointInPolygon([2, 5], withHole)).toBe(true);
    expect(pointInPolygon([5, 5], withHole)).toBe(false);
    expect(pointInPolygon([3, 5], withHole)).toBe(true);
  });
});

describe('pointInArea', () => {
  test('uses exact spherical distance for radius selections and includes the edge', () => {
    const edge = normalizeArea({ type: 'radius', center: ZURICH, radiusMeters: 5000 }).polygon.coordinates[0][0];
    expect(pointInArea([ZURICH.lng, ZURICH.lat], { type: 'radius', center: ZURICH, radiusMeters: 5000 })).toBe(true);
    expect(pointInArea(edge, { type: 'radius', center: ZURICH, radiusMeters: 5000 })).toBe(true);
    expect(pointInArea([ZURICH.lng + 1, ZURICH.lat], { type: 'radius', center: ZURICH, radiusMeters: 5000 })).toBe(false);
  });
});

describe('haversineMeters', () => {
  test('1° of longitude at the equator ≈ 111 km', () => {
    const d = haversineMeters([0, 0], [1, 0]);
    expect(d).toBeGreaterThan(110000);
    expect(d).toBeLessThan(112000);
  });

  test('order matters: 1° lng at lat 47 < 1° lat', () => {
    const lngApart = haversineMeters([8.5, 47.0], [9.5, 47.0]); // ~75.8 km
    const latApart = haversineMeters([8.5, 47.0], [8.5, 48.0]); // ~111 km
    expect(lngApart).toBeLessThan(80000);
    expect(latApart).toBeGreaterThan(110000);
    expect(latApart).toBeGreaterThan(lngApart);
  });

  test('short Zurich hop ≈ 750 m', () => {
    const d = haversineMeters([8.54, 47.37], [8.55, 47.37]);
    expect(d).toBeGreaterThan(730);
    expect(d).toBeLessThan(770);
  });
});

describe('areaSqKm', () => {
  test('a ~1° square near the equator is on the order of 1e4 km²', () => {
    const polygon = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] };
    const area = areaSqKm(polygon);
    expect(area).toBeGreaterThan(11000);
    expect(area).toBeLessThan(13000);
  });
});

describe('validateGeometry', () => {
  test('accepts a valid radius', () => {
    expect(validateGeometry({ type: 'radius', center: ZURICH, radiusMeters: 5000 })).toEqual({
      valid: true,
      errors: [],
    });
  });

  test('rejects out-of-range coordinates', () => {
    const res = validateGeometry({ type: 'radius', center: { lat: 200, lng: 8 }, radiusMeters: 500 });
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => /lat/.test(e))).toBe(true);
  });

  test('rejects bad radius (0 and > 50000)', () => {
    expect(validateGeometry({ type: 'radius', center: ZURICH, radiusMeters: 0 }).valid).toBe(false);
    expect(validateGeometry({ type: 'radius', center: ZURICH, radiusMeters: 60000 }).valid).toBe(false);
  });

  test('rejects an unclosed polygon ring', () => {
    const res = validateGeometry({
      type: 'polygon',
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] },
    });
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => /closed/.test(e))).toBe(true);
  });

  test('rejects a self-intersecting (bowtie) polygon', () => {
    const res = validateGeometry({
      type: 'polygon',
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 10], [10, 0], [0, 10], [0, 0]]] },
    });
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => /self-intersect/.test(e))).toBe(true);
  });

  test('rejects a rectangle with north <= south', () => {
    const res = validateGeometry({ type: 'rectangle', bounds: { north: 1, south: 2, east: 3, west: 1 } });
    expect(res.valid).toBe(false);
  });

  test('rejects an unsupported type', () => {
    expect(validateGeometry({ type: 'triangle' }).valid).toBe(false);
  });
});
