/**
 * Adaptive quadtree tiling for exhaustive Google Maps area discovery.
 *
 * A single Maps text search only ever exposes ~120 results, so covering an
 * entire area means scanning a grid of sub-viewports and, wherever a tile is
 * dense enough to hit that ceiling, splitting it into four and rescanning —
 * recursively — until every sub-area returns comfortably under the cap. These
 * helpers are intentionally pure (no DOM, no Chrome APIs) so the geometry can be
 * reasoned about and unit-tested in isolation.
 */

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface Tile {
  north: number;
  south: number;
  east: number;
  west: number;
  /** Quadtree depth; the root area is depth 0. */
  depth: number;
}

const KM_PER_DEGREE_LAT = 110.574;
const EARTH_CIRCUMFERENCE_KM = 40_075;
// Effective width (px) of the Maps result map with the side panel open. A
// deliberately conservative value biases zoom slightly lower (a wider viewport),
// which favours overlap between neighbouring tiles over leaving gaps.
const EFFECTIVE_MAP_WIDTH_PX = 700;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function kmPerDegreeLng(latitude: number): number {
  return 111.320 * Math.cos((latitude * Math.PI) / 180);
}

/** Axis-aligned bounding box around a centre point, sized by a radius in km. */
export function tileFromCenterRadius(center: GeoPoint, radiusKm: number): Tile {
  const safeRadius = Math.max(0.1, radiusKm);
  const dLat = safeRadius / KM_PER_DEGREE_LAT;
  const dLng = safeRadius / Math.max(0.001, kmPerDegreeLng(center.latitude));
  return {
    north: clamp(center.latitude + dLat, -90, 90),
    south: clamp(center.latitude - dLat, -90, 90),
    east: clamp(center.longitude + dLng, -180, 180),
    west: clamp(center.longitude - dLng, -180, 180),
    depth: 0,
  };
}

export function tileCenter(tile: Tile): GeoPoint {
  return {
    latitude: (tile.north + tile.south) / 2,
    longitude: (tile.east + tile.west) / 2,
  };
}

export function tileWidthKm(tile: Tile): number {
  const midLat = (tile.north + tile.south) / 2;
  return Math.abs(tile.east - tile.west) * kmPerDegreeLng(midLat);
}

export function tileHeightKm(tile: Tile): number {
  return Math.abs(tile.north - tile.south) * KM_PER_DEGREE_LAT;
}

/** The longer side of the tile, used for zoom and minimum-size decisions. */
export function tileSpanKm(tile: Tile): number {
  return Math.max(tileWidthKm(tile), tileHeightKm(tile));
}

/** Split a tile into four equal quadrants at the next quadtree depth. */
export function splitTile(tile: Tile): Tile[] {
  const midLat = (tile.north + tile.south) / 2;
  const midLng = (tile.east + tile.west) / 2;
  const depth = tile.depth + 1;
  return [
    { north: tile.north, south: midLat, west: tile.west, east: midLng, depth },
    { north: tile.north, south: midLat, west: midLng, east: tile.east, depth },
    { north: midLat, south: tile.south, west: tile.west, east: midLng, depth },
    { north: midLat, south: tile.south, west: midLng, east: tile.east, depth },
  ];
}

/**
 * Google Maps zoom that fits the tile's width into the result map viewport.
 * Floored so the viewport is never smaller than the tile (which would leave
 * the tile's edges unsearched); neighbouring overlap is removed later by the
 * global de-duplication, a missed business cannot be.
 */
export function zoomForTile(tile: Tile, mapWidthPx = EFFECTIVE_MAP_WIDTH_PX): number {
  const midLat = (tile.north + tile.south) / 2;
  const widthKm = Math.max(0.05, tileWidthKm(tile));
  const raw = Math.log2((mapWidthPx * EARTH_CIRCUMFERENCE_KM * Math.cos((midLat * Math.PI) / 180)) / (256 * widthKm));
  return clamp(Math.floor(raw), 3, 18);
}
