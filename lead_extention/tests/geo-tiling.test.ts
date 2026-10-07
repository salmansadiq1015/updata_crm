import { describe, expect, it } from 'vitest';
import {
  splitTile,
  tileCenter,
  tileFromCenterRadius,
  tileHeightKm,
  tileSpanKm,
  tileWidthKm,
  zoomForTile,
  type Tile,
} from '../src/shared/geo-tiling';

const paris = { latitude: 48.8566, longitude: 2.3522 };

describe('geo-tiling', () => {
  it('builds a bounding box sized to roughly twice the radius and centred on the point', () => {
    const tile = tileFromCenterRadius(paris, 5);
    const center = tileCenter(tile);
    expect(center.latitude).toBeCloseTo(paris.latitude, 5);
    expect(center.longitude).toBeCloseTo(paris.longitude, 5);
    // ~10 km across each axis (2 × 5 km radius), within a few percent.
    expect(tileHeightKm(tile)).toBeGreaterThan(9.5);
    expect(tileHeightKm(tile)).toBeLessThan(10.5);
    expect(tileWidthKm(tile)).toBeGreaterThan(9.5);
    expect(tileWidthKm(tile)).toBeLessThan(10.5);
  });

  it('splits a tile into four quadrants that tile the parent without gaps or overlap', () => {
    const tile = tileFromCenterRadius(paris, 8);
    const quads = splitTile(tile);
    expect(quads).toHaveLength(4);
    for (const quad of quads) {
      expect(quad.depth).toBe(tile.depth + 1);
      expect(quad.north).toBeLessThanOrEqual(tile.north + 1e-9);
      expect(quad.south).toBeGreaterThanOrEqual(tile.south - 1e-9);
      expect(tileSpanKm(quad)).toBeLessThan(tileSpanKm(tile));
    }
    // Union of the four quadrants' extent equals the parent's extent.
    expect(Math.max(...quads.map((q) => q.north))).toBeCloseTo(tile.north, 9);
    expect(Math.min(...quads.map((q) => q.south))).toBeCloseTo(tile.south, 9);
    expect(Math.max(...quads.map((q) => q.east))).toBeCloseTo(tile.east, 9);
    expect(Math.min(...quads.map((q) => q.west))).toBeCloseTo(tile.west, 9);
    // Halving once ~= half the span.
    expect(tileSpanKm(quads[0])).toBeCloseTo(tileSpanKm(tile) / 2, 1);
  });

  it('chooses a higher zoom for smaller tiles and clamps to the Maps range', () => {
    const big = tileFromCenterRadius(paris, 20);
    const small = tileFromCenterRadius(paris, 1);
    expect(zoomForTile(small)).toBeGreaterThan(zoomForTile(big));
    const huge: Tile = { north: 60, south: 20, east: 40, west: -40, depth: 0 };
    expect(zoomForTile(huge)).toBeGreaterThanOrEqual(3);
    expect(zoomForTile(small)).toBeLessThanOrEqual(18);
    // A ~2.5 km tile should land around neighbourhood zoom (14–16).
    const neighbourhood = tileFromCenterRadius(paris, 1.25);
    expect(zoomForTile(neighbourhood)).toBeGreaterThanOrEqual(14);
    expect(zoomForTile(neighbourhood)).toBeLessThanOrEqual(16);
  });

  it('recursively subdivides toward a street-scale minimum', () => {
    let tile = tileFromCenterRadius(paris, 16);
    let depth = 0;
    while (tileSpanKm(tile) > 0.5 && depth < 12) {
      tile = splitTile(tile)[0];
      depth += 1;
    }
    expect(tileSpanKm(tile)).toBeLessThanOrEqual(0.5);
    expect(depth).toBeLessThan(12);
  });
});
