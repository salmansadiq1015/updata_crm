import { describe, test, expect } from '@jest/globals';
import { planCoverage } from '../engine/coveragePlanner.js';
import { pointInPolygon } from '../engine/geometry.js';

const ZURICH = { lat: 47.3769, lng: 8.5417 };

// A large ~1° × 1° box around Zurich (≈ 75 km × 111 km) — well beyond the
// single-search thresholds, so it must be tiled into a grid.
const LARGE_POLYGON = {
  type: 'polygon',
  geometry: {
    type: 'Polygon',
    coordinates: [[[8.0, 47.0], [9.0, 47.0], [9.0, 48.0], [8.0, 48.0], [8.0, 47.0]]],
  },
};

const withinBounds = (cell, bounds) =>
  cell.center.lat >= bounds.south && cell.center.lat <= bounds.north &&
  cell.center.lng >= bounds.west && cell.center.lng <= bounds.east;

describe('planCoverage — small area → single cell', () => {
  test('small radius → one circle at the centre', () => {
    const plan = planCoverage({ type: 'radius', center: ZURICH, radiusMeters: 2000 });
    expect(plan.strategy).toBe('single');
    expect(plan.cells).toHaveLength(1);
    expect(plan.estimatedSearches).toBe(1);
    expect(plan.truncated).toBe(false);
    const cell = plan.cells[0];
    expect(cell.center.lat).toBeCloseTo(ZURICH.lat, 5);
    expect(cell.center.lng).toBeCloseTo(ZURICH.lng, 5);
    // radius covers the requested area and never exceeds the provider cap.
    expect(cell.radiusMeters).toBeGreaterThanOrEqual(1990);
    expect(cell.radiusMeters).toBeLessThanOrEqual(50000);
    expect(plan.polygon.type).toBe('Polygon');
  });

  test('a moderate radius (~10 km) is still a single search', () => {
    const plan = planCoverage({ type: 'radius', center: ZURICH, radiusMeters: 10000 });
    expect(plan.strategy).toBe('single');
    expect(plan.cells).toHaveLength(1);
  });
});

describe('planCoverage — large area → grid', () => {
  test('tiles the box: >1 cell, all inside bounds, count ≤ cap, not truncated', () => {
    const plan = planCoverage(LARGE_POLYGON, { maxCoverageCells: 50, maxSearchRequests: 40 });
    expect(plan.strategy).toBe('grid');
    expect(plan.cells.length).toBeGreaterThan(1);
    // cap = min(maxCoverageCells, maxSearchRequests) = 40
    expect(plan.cells.length).toBeLessThanOrEqual(40);
    expect(plan.truncated).toBe(false);
    expect(plan.estimatedSearches).toBe(plan.cells.length);
    for (const cell of plan.cells) {
      expect(typeof cell.center.lat).toBe('number');
      expect(typeof cell.center.lng).toBe('number');
      expect(cell.radiusMeters).toBeGreaterThan(0);
      expect(withinBounds(cell, plan.bounds)).toBe(true);
    }
  });

  test('cell centres use [lng, lat] order and sit on/inside the polygon region', () => {
    const plan = planCoverage(LARGE_POLYGON, { maxCoverageCells: 50, maxSearchRequests: 50 });
    // For this convex box most centres are strictly inside; every centre is at
    // least within the bounds. Verify pointInPolygon is fed [lng, lat].
    const insideCount = plan.cells.filter((c) =>
      pointInPolygon([c.center.lng, c.center.lat], plan.polygon)).length;
    expect(insideCount).toBeGreaterThan(0);
  });

  test('truncated:true when the full grid exceeds the cap', () => {
    const plan = planCoverage(LARGE_POLYGON, { maxCoverageCells: 3, maxSearchRequests: 40 });
    expect(plan.strategy).toBe('grid');
    expect(plan.cells.length).toBeLessThanOrEqual(3);
    expect(plan.cells.length).toBeGreaterThanOrEqual(1);
    expect(plan.truncated).toBe(true);
    for (const cell of plan.cells) {
      expect(withinBounds(cell, plan.bounds)).toBe(true);
    }
  });
});

describe('planCoverage — guards', () => {
  test('absurd caps (0 / NaN) fall back and never yield an empty or unbounded list', () => {
    for (const bad of [{ maxCoverageCells: 0 }, { maxCoverageCells: NaN }, { maxSearchRequests: -5 }]) {
      const plan = planCoverage(LARGE_POLYGON, bad);
      expect(plan.cells.length).toBeGreaterThanOrEqual(1);
      expect(plan.cells.length).toBeLessThan(10000);
      expect(Number.isFinite(plan.estimatedSearches)).toBe(true);
    }
  });

  test('invalid geometry propagates INVALID_GEOMETRY', () => {
    let caught;
    try {
      planCoverage({ type: 'radius', center: ZURICH }); // missing radius
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught.code).toBe('INVALID_GEOMETRY');
  });

  test('respects a reduced provider radius cap', () => {
    const plan = planCoverage({ type: 'radius', center: ZURICH, radiusMeters: 2000 }, { providerMaxRadiusMeters: 1500 });
    // covering radius (~2 km) now exceeds the 1.5 km provider cap → must grid.
    expect(plan.strategy).toBe('grid');
    for (const cell of plan.cells) {
      expect(cell.radiusMeters).toBeLessThanOrEqual(1500);
    }
  });
});
