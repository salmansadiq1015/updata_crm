/**
 * Geographic coverage planning for Business Discovery.
 *
 * Every supported selection is partitioned into rectangular cells. Each cell is
 * searched with a circle that covers all four corners, then provider results are
 * filtered against the original geometry. Dense (20-result) cells are split by
 * the worker with `splitCoverageCell`; this is the key difference from the old
 * one-centre strategy, which could only ever return Google's first 20 results.
 */

import config from '../../../config/index.js';
import { normalizeArea, haversineMeters } from './geometry.js';

export const PROVIDER_RADIUS_CAP_M = 50000;
export const PROVIDER_PAGE_SIZE = 20;

// A 2 km query circle is a useful first pass: sparse areas finish cheaply while
// dense cells are recursively refined. It is not a completeness boundary.
const INITIAL_QUERY_RADIUS_M = 2000;
const MAX_INITIAL_CELLS = 5000;
const SQRT2 = Math.SQRT2;

const isPos = (value) => Number.isFinite(value) && value > 0;

function cellFromBounds(bounds, depth = 0, id = '0') {
  const center = {
    lat: (bounds.north + bounds.south) / 2,
    lng: (bounds.east + bounds.west) / 2,
  };
  const origin = [center.lng, center.lat];
  const corners = [
    [bounds.west, bounds.south],
    [bounds.east, bounds.south],
    [bounds.east, bounds.north],
    [bounds.west, bounds.north],
  ];
  const radiusMeters = Math.max(1, Math.ceil(Math.max(...corners.map((corner) => haversineMeters(origin, corner))))) + 1;
  return { id, depth, bounds, center, radiusMeters };
}

/** Divide one rectangular coverage cell into four complete child regions. */
export function splitCoverageCell(cell) {
  if (!cell?.bounds) return [];
  const { north, south, east, west } = cell.bounds;
  const midLat = (north + south) / 2;
  const midLng = (east + west) / 2;
  const depth = (cell.depth || 0) + 1;
  const id = cell.id || '0';
  return [
    cellFromBounds({ north: midLat, south, east: midLng, west }, depth, `${id}.0`),
    cellFromBounds({ north: midLat, south, east, west: midLng }, depth, `${id}.1`),
    cellFromBounds({ north, south: midLat, east: midLng, west }, depth, `${id}.2`),
    cellFromBounds({ north, south: midLat, east, west: midLng }, depth, `${id}.3`),
  ];
}

/**
 * Return whether a saturated cell can be refined further. The floor prevents an
 * infinite subdivision loop in exceptionally dense buildings while still
 * reaching roughly street/building-sized searches.
 */
export function canSubdivideCoverageCell(cell, { minRadiusMeters = 5, maxDepth = 14 } = {}) {
  if (!cell?.bounds || (cell.depth || 0) >= maxDepth) return false;
  const children = splitCoverageCell(cell);
  return children.length > 0 && children[0].radiusMeters >= minRadiusMeters;
}

function resolveInitialCellCap(value) {
  const configured = isPos(value) ? value : config.discovery.maxCoverageCells;
  return Math.max(1, Math.min(MAX_INITIAL_CELLS, Math.floor(configured || 1)));
}

function boxDimensions(bounds) {
  const { north, south, east, west } = bounds;
  return {
    widthM: Math.max(
      haversineMeters([west, south], [east, south]),
      haversineMeters([west, north], [east, north]),
    ),
    heightM: haversineMeters([west, south], [west, north]),
  };
}

function gridShape(bounds, cap, providerMaxRadiusMeters) {
  const { widthM, heightM } = boxDimensions(bounds);
  const targetSideM = INITIAL_QUERY_RADIUS_M * SQRT2;
  let columns = Math.max(1, Math.ceil(widthM / targetSideM));
  let rows = Math.max(1, Math.ceil(heightM / targetSideM));

  // Coarsen the initial pass only enough to fit the configured region budget.
  // Saturated coarse regions are subsequently subdivided, so no geographic
  // strip is discarded as the previous slice(0, cap) implementation did.
  if (columns * rows > cap) {
    const scale = Math.sqrt(cap / (columns * rows));
    columns = Math.max(1, Math.floor(columns * scale));
    rows = Math.max(1, Math.floor(rows * scale));
    while (columns * rows > cap) {
      if (columns >= rows && columns > 1) columns -= 1;
      else if (rows > 1) rows -= 1;
      else break;
    }
  }

  // A coverage circle must stay under the provider's radius cap. If coarsening
  // made a cell too large, add rows/columns even when that exceeds the preferred
  // initial cap; full geographic coverage is more important than that hint.
  const maxSide = (providerMaxRadiusMeters * SQRT2) * 0.999;
  columns = Math.max(columns, Math.ceil(widthM / maxSide));
  rows = Math.max(rows, Math.ceil(heightM / maxSide));

  const rawCount = columns * rows;
  if (rawCount > MAX_INITIAL_CELLS) {
    const err = new Error(`Selected area requires ${rawCount} provider coverage regions; maximum is ${MAX_INITIAL_CELLS}`);
    err.code = 'DISCOVERY_AREA_TOO_LARGE';
    throw err;
  }
  return { columns, rows };
}

/**
 * Plan an initial, gap-free rectangular partition of the selected geometry's
 * bounding box. The original polygon is returned for exact result filtering.
 */
export function planCoverage(
  area,
  {
    maxCoverageCells = config.discovery.maxCoverageCells,
    providerMaxRadiusMeters = PROVIDER_RADIUS_CAP_M,
  } = {},
) {
  const normalized = normalizeArea(area);
  const providerCap = isPos(providerMaxRadiusMeters)
    ? Math.min(PROVIDER_RADIUS_CAP_M, providerMaxRadiusMeters)
    : PROVIDER_RADIUS_CAP_M;
  const cap = resolveInitialCellCap(maxCoverageCells);
  const { columns, rows } = gridShape(normalized.bounds, cap, providerCap);
  const { north, south, east, west } = normalized.bounds;
  const cells = [];

  for (let row = 0; row < rows; row += 1) {
    const cellSouth = south + ((north - south) * row) / rows;
    const cellNorth = south + ((north - south) * (row + 1)) / rows;
    for (let column = 0; column < columns; column += 1) {
      const cellWest = west + ((east - west) * column) / columns;
      const cellEast = west + ((east - west) * (column + 1)) / columns;
      const cell = cellFromBounds(
        { north: cellNorth, south: cellSouth, east: cellEast, west: cellWest },
        0,
        `${row}.${column}`,
      );
      if (cell.radiusMeters > providerCap) {
        const err = new Error('Coverage cell exceeds the provider radius limit');
        err.code = 'DISCOVERY_AREA_TOO_LARGE';
        throw err;
      }
      cells.push(cell);
    }
  }

  return {
    strategy: cells.length === 1 ? 'single' : 'grid',
    cells,
    polygon: normalized.polygon,
    bounds: normalized.bounds,
    truncated: false,
    estimatedSearches: cells.length,
  };
}

export default {
  planCoverage,
  splitCoverageCell,
  canSubdivideCoverageCell,
};
