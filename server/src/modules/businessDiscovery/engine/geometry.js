/**
 * Geometry utilities for Business Discovery (Module 15).
 *
 * Pure, dependency-free helpers used by the coverage planner, the in-area
 * geometry filter and request validation. No DB, no network.
 *
 * GeoJSON rule (design §4, §18): coordinates are always **[lng, lat]** and
 * polygon rings are closed (first point === last point). All public helpers
 * accept/emit that convention.
 *
 * References: LEAD_GENERATION_DESIGN.md §6 (maps), §7 (coverage), §8 (dedup geo).
 */

// Mean Earth radius in metres (IUGG). Shared by distance and area so results are
// internally consistent.
const EARTH_RADIUS_M = 6371008.8;

// Number of segments used to approximate a circle as a polygon. More segments →
// the inscribed polygon's area approaches the true circle area (64 ≈ 0.16 %
// under πr²). The design (§7) only requires an approximation ("e.g. 32 points").
const CIRCLE_SEGMENTS = 64;

const RADIUS_MIN_M = 1;
const RADIUS_MAX_M = 50000;

const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

const isFiniteNumber = (n) => typeof n === 'number' && Number.isFinite(n);
const lngInRange = (lng) => isFiniteNumber(lng) && lng >= -180 && lng <= 180;
const latInRange = (lat) => isFiniteNumber(lat) && lat >= -90 && lat <= 90;

/**
 * Build an Error carrying a stable machine-readable `.code` so callers (and the
 * service layer / error envelope) can branch without string matching.
 */
function geometryError(message) {
  const err = new Error(message || 'Invalid geometry');
  err.code = 'INVALID_GEOMETRY';
  return err;
}

/**
 * Extract the outer ring (`[[lng,lat], ...]`) from the many shapes callers pass:
 * a GeoJSON Polygon object, a bare coordinates array `[[[lng,lat]...]]`, or a
 * ring array `[[lng,lat]...]`. Returns `null` when nothing usable is found.
 */
function getRing(polygon) {
  if (!polygon) return null;
  if (Array.isArray(polygon)) {
    // Bare ring: [[lng,lat], ...]
    if (Array.isArray(polygon[0]) && typeof polygon[0][0] === 'number') return polygon;
    // Coordinates array: [[[lng,lat], ...]]
    if (Array.isArray(polygon[0]) && Array.isArray(polygon[0][0])) return polygon[0];
    return null;
  }
  if (Array.isArray(polygon.coordinates)) return polygon.coordinates[0] || null;
  return null;
}

/** Return every polygon ring (outer first, followed by holes). */
function getRings(polygon) {
  if (!polygon) return [];
  if (Array.isArray(polygon)) {
    if (Array.isArray(polygon[0]) && typeof polygon[0][0] === 'number') return [polygon];
    if (Array.isArray(polygon[0]) && Array.isArray(polygon[0][0])) return polygon;
    return [];
  }
  return Array.isArray(polygon.coordinates) ? polygon.coordinates : [];
}

/** True when a ring's first and last vertices coincide. */
function isClosedRing(ring) {
  if (!Array.isArray(ring) || ring.length < 2) return false;
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}

/** Return a closed copy of a ring (appends the first point if needed). */
function closeRing(ring) {
  if (!Array.isArray(ring) || ring.length === 0) return ring;
  return isClosedRing(ring) ? ring.slice() : [...ring, ring[0].slice()];
}

/**
 * Great-circle distance in metres between two `[lng, lat]` points (haversine).
 */
export function haversineMeters(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) {
    throw geometryError('haversineMeters expects two [lng, lat] points');
  }
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  if (![lng1, lat1, lng2, lat2].every(isFiniteNumber)) {
    throw geometryError('haversineMeters expects finite coordinates');
  }
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  return EARTH_RADIUS_M * c;
}

/**
 * Axis-aligned bounding box of a polygon (outer ring).
 * @returns {{north:number, south:number, east:number, west:number}}
 */
export function boundingBox(polygon) {
  const ring = getRing(polygon);
  if (!ring || ring.length === 0) {
    throw geometryError('boundingBox expects a polygon with an outer ring');
  }
  let north = -Infinity;
  let south = Infinity;
  let east = -Infinity;
  let west = Infinity;
  for (const point of ring) {
    const lng = point[0];
    const lat = point[1];
    if (!isFiniteNumber(lng) || !isFiniteNumber(lat)) {
      throw geometryError('boundingBox encountered a non-numeric coordinate');
    }
    if (lat > north) north = lat;
    if (lat < south) south = lat;
    if (lng > east) east = lng;
    if (lng < west) west = lng;
  }
  return { north, south, east, west };
}

/**
 * Ray-casting point-in-polygon test. `point` is `[lng, lat]`; `polygon` is a
 * GeoJSON Polygon, a coordinates array or a ring. Outer and hole boundaries are
 * included; hole interiors are excluded.
 */
const POINT_EPSILON = 1e-10;

function pointOnSegment([x, y], [x1, y1], [x2, y2]) {
  const cross = (x - x1) * (y2 - y1) - (y - y1) * (x2 - x1);
  if (Math.abs(cross) > POINT_EPSILON) return false;
  return (
    x >= Math.min(x1, x2) - POINT_EPSILON
    && x <= Math.max(x1, x2) + POINT_EPSILON
    && y >= Math.min(y1, y2) - POINT_EPSILON
    && y <= Math.max(y1, y2) + POINT_EPSILON
  );
}

function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    if (pointOnSegment(point, ring[j], ring[i])) return { inside: true, boundary: true };
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return { inside, boundary: false };
}

export function pointInPolygon(point, polygon) {
  if (!Array.isArray(point) || !isFiniteNumber(point[0]) || !isFiniteNumber(point[1])) {
    return false;
  }
  const rings = getRings(polygon);
  if (!rings[0] || rings[0].length < 3) return false;

  const outer = pointInRing(point, rings[0]);
  if (!outer.inside) return false;
  if (outer.boundary) return true;

  // GeoJSON holes remove their interiors, but their edges remain part of the
  // polygon boundary and are therefore included.
  for (let i = 1; i < rings.length; i += 1) {
    if (!rings[i] || rings[i].length < 3) continue;
    const hole = pointInRing(point, rings[i]);
    if (hole.boundary) return true;
    if (hole.inside) return false;
  }
  return true;
}

/** Exact membership for each supported selection mode (boundary-inclusive). */
export function pointInArea(point, area) {
  if (!Array.isArray(point) || !area) return false;
  if (area.type === 'radius' || area.type === 'circle') {
    const rawCenter = area.center?.coordinates || area.center;
    const center = Array.isArray(rawCenter)
      ? rawCenter
      : [rawCenter?.lng, rawCenter?.lat];
    if (!center.every(isFiniteNumber) || !isFiniteNumber(area.radiusMeters)) return false;
    return haversineMeters(point, center) <= area.radiusMeters + 0.01;
  }
  if (area.type === 'rectangle' && area.bounds) {
    const [lng, lat] = point;
    return lat >= area.bounds.south - POINT_EPSILON
      && lat <= area.bounds.north + POINT_EPSILON
      && lng >= area.bounds.west - POINT_EPSILON
      && lng <= area.bounds.east + POINT_EPSILON;
  }
  return pointInPolygon(point, area.geometry || area.polygon || area);
}

/**
 * Spherical polygon area in square kilometres.
 *
 * Uses the signed spherical-excess approximation (the same formula as Google
 * Maps' `SphericalUtil.computeSignedArea`): accurate for the small-to-medium
 * areas this module handles. Returns the absolute area so ring winding does not
 * matter.
 */
export function areaSqKm(polygon) {
  const rings = getRings(polygon);
  if (!rings[0] || rings[0].length < 3) return 0;
  const ringArea = (ring) => {
    const closed = closeRing(ring);
    let total = 0;
    for (let i = 0; i < closed.length - 1; i++) {
      const [lng1, lat1] = closed[i];
      const [lng2, lat2] = closed[i + 1];
      total += (toRad(lng2) - toRad(lng1)) * (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)));
    }
    return Math.abs((total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2) / 1_000_000;
  };
  return Math.max(0, ringArea(rings[0]) - rings.slice(1).reduce((sum, ring) => sum + ringArea(ring), 0));
}

// --- self-intersection (basic, for simple polygons) ---

const orient = (a, b, c) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

/** Proper segment intersection (shared endpoints / collinear touching ignored). */
function segmentsCross(p1, p2, p3, p4) {
  const d1 = orient(p3, p4, p1);
  const d2 = orient(p3, p4, p2);
  const d3 = orient(p1, p2, p3);
  const d4 = orient(p1, p2, p4);
  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  );
}

/**
 * Basic self-intersection test: do any two non-adjacent edges of the ring
 * properly cross? O(n²); intended for the modest polygons users draw.
 */
function isSelfIntersecting(ring) {
  // Work with the open vertex list (drop the duplicated closing point).
  const pts = isClosedRing(ring) ? ring.slice(0, -1) : ring.slice();
  const m = pts.length;
  if (m < 4) return false;
  const edges = [];
  for (let i = 0; i < m; i++) edges.push([pts[i], pts[(i + 1) % m]]);
  for (let i = 0; i < m; i++) {
    for (let k = i + 1; k < m; k++) {
      // Skip adjacent edges (they legitimately share a vertex), including the
      // wrap-around pair (last edge adjacent to first edge).
      if (k === i) continue;
      if (k === i + 1) continue;
      if (i === 0 && k === m - 1) continue;
      if (segmentsCross(edges[i][0], edges[i][1], edges[k][0], edges[k][1])) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Validate a user-supplied area without throwing.
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateGeometry(area) {
  const errors = [];
  if (!area || typeof area !== 'object') {
    return { valid: false, errors: ['area is required'] };
  }
  const type = area.type;
  if (!['radius', 'circle', 'rectangle', 'polygon'].includes(type)) {
    return { valid: false, errors: [`unsupported area type: ${String(type)}`] };
  }

  if (type === 'radius' || type === 'circle') {
    const center = area.center;
    if (!center || typeof center !== 'object') {
      errors.push('center {lat,lng} is required');
    } else {
      if (!latInRange(center.lat)) errors.push('center.lat out of range [-90, 90]');
      if (!lngInRange(center.lng)) errors.push('center.lng out of range [-180, 180]');
    }
    const r = area.radiusMeters;
    if (!isFiniteNumber(r)) {
      errors.push('radiusMeters is required');
    } else if (r < RADIUS_MIN_M || r > RADIUS_MAX_M) {
      errors.push(`radiusMeters out of range [${RADIUS_MIN_M}, ${RADIUS_MAX_M}]`);
    }
  } else if (type === 'rectangle') {
    const b = area.bounds;
    if (!b || typeof b !== 'object') {
      errors.push('bounds {north,south,east,west} is required');
    } else {
      if (!latInRange(b.north)) errors.push('bounds.north out of range [-90, 90]');
      if (!latInRange(b.south)) errors.push('bounds.south out of range [-90, 90]');
      if (!lngInRange(b.east)) errors.push('bounds.east out of range [-180, 180]');
      if (!lngInRange(b.west)) errors.push('bounds.west out of range [-180, 180]');
      if (latInRange(b.north) && latInRange(b.south) && b.north <= b.south) {
        errors.push('bounds.north must be greater than bounds.south');
      }
      if (lngInRange(b.east) && lngInRange(b.west) && b.east <= b.west) {
        errors.push('bounds.east must be greater than bounds.west');
      }
    }
  } else if (type === 'polygon') {
    const rings = getRings(area.geometry);
    if (!rings[0] || !Array.isArray(rings[0])) {
      errors.push('geometry.coordinates[0] ring is required');
    } else {
      rings.forEach((ring, index) => {
        const label = index === 0 ? 'polygon ring' : `polygon hole ${index}`;
        if (!Array.isArray(ring) || ring.length < 4) {
          errors.push(`${label} must have at least 4 positions (closed triangle)`);
          return;
        }
        const badCoord = ring.some(
          (p) => !Array.isArray(p) || !lngInRange(p[0]) || !latInRange(p[1]),
        );
        if (badCoord) errors.push(`${label} contains out-of-range coordinates`);
        if (!badCoord && !isClosedRing(ring)) errors.push(`${label} must be closed (first point === last point)`);
        if (!badCoord && isSelfIntersecting(ring)) errors.push(`${label} is self-intersecting`);
      });
      // Every hole must actually be inside the outer ring. A boundary point is
      // accepted; provider results on that boundary remain included.
      for (let i = 1; i < rings.length; i += 1) {
        if (rings[i]?.[0] && !pointInRing(rings[i][0], rings[0]).inside) {
          errors.push(`polygon hole ${i} must be inside the outer ring`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Build a circle's closed ring (`[[lng,lat], ...]`) around a centre, using the
 * spherical destination-point formula so the shape stays accurate at any
 * latitude.
 */
function circleRing(center, radiusMeters, segments = CIRCLE_SEGMENTS) {
  const lat1 = toRad(center.lat);
  const lng1 = toRad(center.lng);
  const angular = radiusMeters / EARTH_RADIUS_M;
  const ring = [];
  for (let i = 0; i < segments; i++) {
    const bearing = (2 * Math.PI * i) / segments;
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(angular) +
        Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
    );
    const lng2 =
      lng1 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
        Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
      );
    ring.push([toDeg(lng2), toDeg(lat2)]);
  }
  ring.push(ring[0].slice()); // close the ring
  return ring;
}

/**
 * Normalize any supported area selection into a single canonical shape used for
 * coverage planning and in-area filtering.
 *
 * @param {object} area - `{ type, center?, radiusMeters?, geometry?, bounds? }`
 * @returns {{ polygon: object, bounds: object, areaSqKm: number, center: {lat:number,lng:number} }}
 *   `polygon` is a closed GeoJSON Polygon with `[lng, lat]` coordinates.
 * @throws {Error} with `.code === 'INVALID_GEOMETRY'` on invalid input.
 */
export function normalizeArea(area) {
  if (!area || typeof area !== 'object') {
    throw geometryError('area is required');
  }
  const { type } = area;

  let ring;
  let center;

  if (type === 'radius' || type === 'circle') {
    // Validate before building so bad centres/radii fail fast and uniformly.
    const check = validateGeometry(area);
    if (!check.valid) throw geometryError(check.errors.join('; '));
    ring = circleRing(area.center, area.radiusMeters);
    center = { lat: area.center.lat, lng: area.center.lng };
  } else if (type === 'rectangle') {
    const check = validateGeometry(area);
    if (!check.valid) throw geometryError(check.errors.join('; '));
    const { north, south, east, west } = area.bounds;
    // Closed ring, counter-clockwise starting at the south-west corner.
    ring = [
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ];
    center = { lat: (north + south) / 2, lng: (east + west) / 2 };
  } else if (type === 'polygon') {
    const rawRings = getRings(area.geometry);
    if (!rawRings[0] || !Array.isArray(rawRings[0])) {
      throw geometryError('geometry.coordinates[0] ring is required');
    }
    // Close every ring before validating so lenient input remains accepted.
    const rings = rawRings.map(closeRing);
    ring = rings[0];
    const check = validateGeometry({ type: 'polygon', geometry: { type: 'Polygon', coordinates: rings } });
    if (!check.valid) throw geometryError(check.errors.join('; '));
    const bbox = boundingBox({ type: 'Polygon', coordinates: rings });
    center = { lat: (bbox.north + bbox.south) / 2, lng: (bbox.east + bbox.west) / 2 };
    const polygon = { type: 'Polygon', coordinates: rings };
    return {
      polygon,
      bounds: bbox,
      areaSqKm: areaSqKm(polygon),
      center,
    };
  } else {
    throw geometryError(`unsupported area type: ${String(type)}`);
  }

  const polygon = { type: 'Polygon', coordinates: [ring] };
  const bounds = boundingBox(polygon);
  if (!center) {
    center = { lat: (bounds.north + bounds.south) / 2, lng: (bounds.east + bounds.west) / 2 };
  }

  return {
    polygon,
    bounds,
    areaSqKm: areaSqKm(polygon),
    center,
  };
}

export default {
  normalizeArea,
  boundingBox,
  pointInPolygon,
  pointInArea,
  haversineMeters,
  validateGeometry,
  areaSqKm,
};
