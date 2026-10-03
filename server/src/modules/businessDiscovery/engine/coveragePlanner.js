/**
 * Coverage planner for Business Discovery (Module 15).
 *
 * Pure, DB-free. Turns a user-selected area into a bounded set of search
 * circles ("cells") the provider layer can hit one-by-one (design §7):
 *
 *   small area  → a single searchNearby circle.
 *   large area  → the bounding box is tiled with overlapping circles sized to
 *                 the provider's radius cap, kept where they intersect the real
 *                 polygon, and capped at `min(maxCoverageCells, maxSearchRequests)`.
 *
 * The output is ALWAYS bounded: the full grid is coarsened toward the provider
 * radius cap to try to fit the budget (preferring complete coverage), candidate
 * generation is hard-limited, and anything still over budget is truncated with
 * `truncated: true` so the caller can surface coverage honesty ("N/M regions").
 *
 * References: LEAD_GENERATION_DESIGN.md §7 (coverage). Geometry comes from
 * {@link ./geometry.js} — coordinates are GeoJSON [lng, lat].
 */

import config from '../../../config/index.js';
import {
  normalizeArea,
  pointInPolygon,
  haversineMeters,
} from './geometry.js';

// Google searchNearby hard-caps the radius at 50 km. Never request more.
const PROVIDER_RADIUS_CAP_M = 50000;

// "Small" thresholds (design §7: radius ≤ R0 AND area ≤ A0). A single circle up
// to ~25 km radius (≈1963 km²) is treated as one search; beyond that the
// result-density of a single searchNearby (max ~20 hits) is too poor, so we tile.
const SINGLE_SEARCH_MAX_RADIUS_M = 25000;
const SINGLE_SEARCH_MAX_SQKM = 2000;

// Starting grid cell radius for large areas. The planner coarsens upward from
// here (toward the provider cap) until the grid fits the budget, so dense areas
// stay complete rather than being truncated.
const GRID_CELL_RADIUS_M = 5000;

// Overlapping square grid: a circle of radius r covers a square of side r·√2, so
// placing centres ≤ r·√2 apart guarantees the union covers the box.
const SQRT2 = Math.SQRT2;

// Hard ceiling on candidate centres generated before polygon filtering, so a
// pathological (e.g. continent-sized) area can never spin an unbounded loop.
const MAX_GRID_CANDIDATES = 2000;

// How aggressively the cell radius grows per coarsening step, and a bounded
// number of steps (radius grows geometrically to the cap, so this terminates).
const COARSEN_FACTOR = 1.4;
const MAX_COARSEN_STEPS = 24;

const isPos = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;

/**
 * Resolve the per-session cell budget, guarding against NaN / non-positive
 * input by falling back to the configured defaults, never below 1.
 */
function resolveCap(maxCoverageCells, maxSearchRequests) {
  const cells = isPos(maxCoverageCells) ? Math.floor(maxCoverageCells) : config.discovery.maxCoverageCells;
  const requests = isPos(maxSearchRequests) ? Math.floor(maxSearchRequests) : config.discovery.maxSearchRequests;
  return Math.max(1, Math.min(cells, requests));
}

/** Largest great-circle distance (m) from the area centre to any polygon vertex. */
function coveringRadiusMeters(center, ring) {
  const origin = [center.lng, center.lat];
  let max = 0;
  for (const point of ring) {
    const d = haversineMeters(origin, point);
    if (d > max) max = d;
  }
  return max;
}

/**
 * Tile a bounding box with an overlapping square grid of circles, keeping only
 * cells that intersect the polygon. Returns the kept cells (row-major) plus
 * whether the full grid had to be truncated/clamped to stay bounded.
 */
function buildGrid({ polygon, bounds, cap, provMax }) {
  const { north, south, east, west } = bounds;
  const midLat = (north + south) / 2;

  // Box dimensions in metres. Width is taken at the wider edge so spacing covers
  // the widest row; height is the meridional span.
  const widthM = Math.max(
    haversineMeters([west, south], [east, south]),
    haversineMeters([west, north], [east, north]),
  );
  const heightM = haversineMeters([west, south], [west, north]);

  // Coarsen the cell radius upward until the raw grid fits the budget or we hit
  // the provider cap. Prefers complete coverage over truncation.
  let cellRadius = Math.min(GRID_CELL_RADIUS_M, provMax);
  let nLng = 1;
  let nLat = 1;
  for (let step = 0; step < MAX_COARSEN_STEPS; step++) {
    const spacing = cellRadius * SQRT2;
    nLng = Math.max(1, Math.ceil(widthM / spacing));
    nLat = Math.max(1, Math.ceil(heightM / spacing));
    if ((nLng + 1) * (nLat + 1) <= cap || cellRadius >= provMax) break;
    cellRadius = Math.min(provMax, cellRadius * COARSEN_FACTOR);
  }

  // Final hard clamp so generation is always bounded, even for absurd areas.
  let clamped = false;
  if ((nLng + 1) * (nLat + 1) > MAX_GRID_CANDIDATES) {
    const scale = Math.sqrt(MAX_GRID_CANDIDATES / ((nLng + 1) * (nLat + 1)));
    nLng = Math.max(1, Math.floor((nLng + 1) * scale) - 1);
    nLat = Math.max(1, Math.floor((nLat + 1) * scale) - 1);
    clamped = true;
  }

  // Evenly-spaced centres, inclusive of both edges → every centre is inside the
  // bounds, and the metric spacing stays ≤ cellRadius·√2 (we used ceil above).
  const lngs = [];
  for (let i = 0; i <= nLng; i++) lngs.push(west + ((east - west) * i) / nLng);
  const lats = [];
  for (let j = 0; j <= nLat; j++) lats.push(south + ((north - south) * j) / nLat);

  // Inside flags, then a one-ring dilation so boundary ("edge") cells whose
  // centre falls just outside the polygon are still searched.
  const inside = lats.map((lat) => lngs.map((lng) => pointInPolygon([lng, lat], polygon)));
  const radiusMeters = Math.min(provMax, Math.max(1, Math.round(cellRadius)));
  const kept = [];
  for (let j = 0; j < lats.length; j++) {
    for (let i = 0; i < lngs.length; i++) {
      let keep = inside[j][i];
      if (!keep) {
        for (let dj = -1; dj <= 1 && !keep; dj++) {
          for (let di = -1; di <= 1 && !keep; di++) {
            const nj = j + dj;
            const ni = i + di;
            if (nj >= 0 && nj < lats.length && ni >= 0 && ni < lngs.length && inside[nj][ni]) keep = true;
          }
        }
      }
      if (keep) kept.push({ center: { lat: lats[j], lng: lngs[i] }, radiusMeters });
    }
  }

  // Degenerate safety net: a polygon smaller than one cell → cover it with one
  // circle at the centre so we never emit zero cells.
  if (kept.length === 0) {
    const center = { lat: midLat, lng: (east + west) / 2 };
    kept.push({ center, radiusMeters });
  }

  const overBudget = kept.length > cap;
  const cells = overBudget ? kept.slice(0, cap) : kept;
  return { cells, truncated: overBudget || clamped };
}

/**
 * Plan provider search coverage for a user-selected area.
 *
 * @param {object} area - a discovery area (radius/circle/rectangle/polygon),
 *   as accepted by {@link normalizeArea}.
 * @param {object} [options]
 * @param {number} [options.maxCoverageCells] - cap on grid cells (default config.discovery).
 * @param {number} [options.maxSearchRequests] - cap on provider searches (default config.discovery).
 * @param {number} [options.providerMaxRadiusMeters=50000] - provider radius cap.
 * @returns {{
 *   strategy: 'single'|'grid',
 *   cells: Array<{ center: { lat: number, lng: number }, radiusMeters: number }>,
 *   polygon: object, bounds: object,
 *   truncated: boolean, estimatedSearches: number
 * }}
 * @throws {Error} with `.code === 'INVALID_GEOMETRY'` when the area is invalid.
 */
export function planCoverage(
  area,
  {
    maxCoverageCells = config.discovery.maxCoverageCells,
    maxSearchRequests = config.discovery.maxSearchRequests,
    providerMaxRadiusMeters = PROVIDER_RADIUS_CAP_M,
  } = {},
) {
  const { polygon, bounds, areaSqKm, center } = normalizeArea(area);
  const provMax = isPos(providerMaxRadiusMeters)
    ? Math.min(providerMaxRadiusMeters, PROVIDER_RADIUS_CAP_M)
    : PROVIDER_RADIUS_CAP_M;
  const cap = resolveCap(maxCoverageCells, maxSearchRequests);

  const ring = polygon.coordinates[0];
  const covering = coveringRadiusMeters(center, ring);

  // SMALL: one circle covers the whole polygon and the area is modest.
  if (covering <= Math.min(provMax, SINGLE_SEARCH_MAX_RADIUS_M) && areaSqKm <= SINGLE_SEARCH_MAX_SQKM) {
    const radiusMeters = Math.min(provMax, Math.max(1, Math.ceil(covering) || 1));
    return {
      strategy: 'single',
      cells: [{ center: { lat: center.lat, lng: center.lng }, radiusMeters }],
      polygon,
      bounds,
      truncated: false,
      estimatedSearches: 1,
    };
  }

  // LARGE: tile the bounding box.
  const { cells, truncated } = buildGrid({ polygon, bounds, cap, provMax });
  return {
    strategy: 'grid',
    cells,
    polygon,
    bounds,
    truncated,
    estimatedSearches: cells.length,
  };
}

export default { planCoverage };
