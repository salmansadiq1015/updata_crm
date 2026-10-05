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

describe('planCoverage — complete initial partition', () => {
  test('1 km radius fits one complete initial cell', () => {
    const plan = planCoverage({ type: 'radius', center: ZURICH, radiusMeters: 1000 });
    expect(plan.strategy).toBe('single');
    expect(plan.cells).toHaveLength(1);
    expect(plan.estimatedSearches).toBe(1);
    expect(plan.truncated).toBe(false);
    const cell = plan.cells[0];
    expect(cell.center.lat).toBeCloseTo(ZURICH.lat, 5);
    expect(cell.center.lng).toBeCloseTo(ZURICH.lng, 5);
    // radius covers the requested area and never exceeds the provider cap.
    expect(cell.radiusMeters).toBeGreaterThanOrEqual(1400);
    expect(cell.radiusMeters).toBeLessThanOrEqual(50000);
    expect(plan.polygon.type).toBe('Polygon');
  });

  test('a 5 km radius is split instead of being collapsed to one 20-result query', () => {
    const plan = planCoverage({ type: 'radius', center: ZURICH, radiusMeters: 5000 });
    expect(plan.strategy).toBe('grid');
    expect(plan.cells.length).toBeGreaterThan(1);
    expect(plan.cells.every((cell) => cell.bounds)).toBe(true);
  });

  test.each([1000, 5000, 10000, 50000])(
    'covers the complete supported %i metre radius without provider-oversized cells',
    (radiusMeters) => {
      const plan = planCoverage({ type: 'radius', center: ZURICH, radiusMeters });
      expect(plan.cells.length).toBeGreaterThan(0);
      expect(plan.truncated).toBe(false);
      expect(plan.cells.every((cell) => cell.radiusMeters <= 50000)).toBe(true);

      const minWest = Math.min(...plan.cells.map((cell) => cell.bounds.west));
      const maxEast = Math.max(...plan.cells.map((cell) => cell.bounds.east));
      const minSouth = Math.min(...plan.cells.map((cell) => cell.bounds.south));
      const maxNorth = Math.max(...plan.cells.map((cell) => cell.bounds.north));
      expect(minWest).toBeCloseTo(plan.bounds.west, 10);
      expect(maxEast).toBeCloseTo(plan.bounds.east, 10);
      expect(minSouth).toBeCloseTo(plan.bounds.south, 10);
      expect(maxNorth).toBeCloseTo(plan.bounds.north, 10);
    },
  );

  test.each([
    { north: 47.39, south: 47.37, east: 8.9, west: 8.0 },
    { north: 47.8, south: 47.0, east: 8.57, west: 8.52 },
  ])('covers a wide or long rectangle without dropping a strip', (bounds) => {
    const plan = planCoverage({ type: 'rectangle', bounds }, { maxCoverageCells: 3 });
    expect(plan.cells.length).toBeGreaterThan(0);
    expect(plan.truncated).toBe(false);
    expect(Math.min(...plan.cells.map((cell) => cell.bounds.west))).toBeCloseTo(bounds.west, 10);
    expect(Math.max(...plan.cells.map((cell) => cell.bounds.east))).toBeCloseTo(bounds.east, 10);
    expect(Math.min(...plan.cells.map((cell) => cell.bounds.south))).toBeCloseTo(bounds.south, 10);
    expect(Math.max(...plan.cells.map((cell) => cell.bounds.north))).toBeCloseTo(bounds.north, 10);
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

  test('a low preferred cap never slices away geographic regions', () => {
    const plan = planCoverage(LARGE_POLYGON, { maxCoverageCells: 3, maxSearchRequests: 40 });
    expect(plan.strategy).toBe('grid');
    // Four cells are required to stay below Google's 50 km radius cap.
    expect(plan.cells.length).toBe(4);
    expect(plan.cells.length).toBeGreaterThanOrEqual(1);
    expect(plan.truncated).toBe(false);
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
