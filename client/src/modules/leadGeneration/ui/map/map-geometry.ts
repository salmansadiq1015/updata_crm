// Pure geometry helpers for the discovery map — NO Google Maps SDK import here,
// so these can be unit-tested in isolation and used during SSR/no-key states.
//
// GeoJSON rule (lead_module.md §18): coordinates are [longitude, latitude].
// All `geometry` we emit matches the module's `GeoJsonPolygon` shape:
//   { type: 'Polygon', coordinates: [[[lng, lat], ...]] }  (outer ring, closed).

import type { AreaDraft } from '../../state/lead-gen-store';
import type { AreaBounds, GeoJsonPolygon, GeoPoint } from '../../types/discovery-types';

/** WGS-84 mean earth radius, in metres (matches google.maps spherical default). */
export const EARTH_RADIUS_M = 6378137;

export const DEFAULT_RADIUS_METERS = 5000;
export const MIN_RADIUS_METERS = 250;
export const MAX_RADIUS_METERS = 50000;

/** Vertices used when approximating a circle as a GeoJSON polygon. */
const CIRCLE_POLYGON_STEPS = 72;

const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

export function clampRadius(meters: number): number {
  if (!Number.isFinite(meters)) return DEFAULT_RADIUS_METERS;
  return Math.min(MAX_RADIUS_METERS, Math.max(MIN_RADIUS_METERS, Math.round(meters)));
}

/**
 * Destination point given a start, an initial bearing (degrees) and a distance
 * (metres), using the spherical "direct" formula. Mirrors
 * google.maps.geometry.spherical.computeOffset so results line up with the SDK.
 */
export function destinationPoint(
  origin: GeoPoint,
  bearingDeg: number,
  distanceMeters: number,
): GeoPoint {
  const angular = distanceMeters / EARTH_RADIUS_M;
  const bearing = toRad(bearingDeg);
  const lat1 = toRad(origin.lat);
  const lng1 = toRad(origin.lng);

  const sinLat2 =
    Math.sin(lat1) * Math.cos(angular) +
    Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing);
  const lat2 = Math.asin(Math.min(1, Math.max(-1, sinLat2)));
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    );

  return { lat: toDeg(lat2), lng: ((toDeg(lng2) + 540) % 360) - 180 };
}

/**
 * Great-circle distance in metres between two points (haversine, WGS-84 mean
 * radius). Mirrors google.maps.geometry.spherical.computeDistanceBetween so a
 * drag-drawn circle's radius lines up with what the SDK would report — used by
 * the free-draw tool now that the Maps `drawing` library (DrawingManager) is gone.
 */
export function haversineDistance(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Closed outer ring (GeoJSON [lng,lat]) approximating a geodesic circle. */
export function circleToRing(
  center: GeoPoint,
  radiusMeters: number,
  steps: number = CIRCLE_POLYGON_STEPS,
): number[][] {
  const ring: number[][] = [];
  for (let i = 0; i < steps; i += 1) {
    const p = destinationPoint(center, (i / steps) * 360, radiusMeters);
    ring.push([p.lng, p.lat]);
  }
  if (ring.length > 0) ring.push([...ring[0]]); // close the ring
  return ring;
}

/** Axis-aligned bounds of a circle (small-angle approximation, good enough for a viewport). */
export function circleBounds(center: GeoPoint, radiusMeters: number): AreaBounds {
  const latDelta = toDeg(radiusMeters / EARTH_RADIUS_M);
  const cosLat = Math.max(Math.cos(toRad(center.lat)), 1e-6);
  const lngDelta = toDeg(radiusMeters / (EARTH_RADIUS_M * cosLat));
  return {
    north: Math.min(90, center.lat + latDelta),
    south: Math.max(-90, center.lat - latDelta),
    east: center.lng + lngDelta,
    west: center.lng - lngDelta,
  };
}

/** Normalize a circle (radius or free circle) into an AreaDraft. */
export function circleToAreaDraft(
  center: GeoPoint,
  radiusMeters: number,
  type: 'radius' | 'circle',
): AreaDraft {
  const radius = clampRadius(radiusMeters);
  return {
    type,
    radiusMeters: radius,
    geometry: { type: 'Polygon', coordinates: [circleToRing(center, radius)] },
    bounds: circleBounds(center, radius),
  };
}

/** Closed outer ring (GeoJSON [lng,lat]) for an axis-aligned rectangle. */
export function ringFromBounds(bounds: AreaBounds): number[][] {
  const { north, south, east, west } = bounds;
  return [
    [west, north],
    [east, north],
    [east, south],
    [west, south],
    [west, north],
  ];
}

export function rectangleToAreaDraft(bounds: AreaBounds): AreaDraft {
  return {
    type: 'rectangle',
    radiusMeters: null,
    geometry: { type: 'Polygon', coordinates: [ringFromBounds(bounds)] },
    bounds,
  };
}

export function boundsFromLngLatRing(ring: number[][]): AreaBounds {
  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;
  for (const [lng, lat] of ring) {
    if (lat > north) north = lat;
    if (lat < south) south = lat;
    if (lng > east) east = lng;
    if (lng < west) west = lng;
  }
  return { north, south, east, west };
}

/** Normalize a free-drawn / edited polygon (points in {lat,lng}) into an AreaDraft. */
export function polygonToAreaDraft(points: GeoPoint[]): AreaDraft {
  const ring: number[][] = points.map((p) => [p.lng, p.lat]);
  if (ring.length > 0) {
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
  }
  return {
    type: 'polygon',
    radiusMeters: null,
    geometry: ring.length > 0 ? { type: 'Polygon', coordinates: [ring] } : null,
    bounds: ring.length > 0 ? boundsFromLngLatRing(ring) : null,
  };
}

export function boundsCenter(bounds: AreaBounds): GeoPoint {
  return {
    lat: (bounds.north + bounds.south) / 2,
    lng: (bounds.east + bounds.west) / 2,
  };
}

/** Best-effort centre of any area draft (bounds midpoint, falling back to the ring). */
export function areaCenter(area: AreaDraft | null | undefined): GeoPoint | null {
  if (!area) return null;
  if (area.bounds) return boundsCenter(area.bounds);
  const ring = area.geometry?.coordinates?.[0];
  if (ring && ring.length > 0) {
    const sum = ring.reduce(
      (acc, [lng, lat]) => ({ lng: acc.lng + lng, lat: acc.lat + lat }),
      { lng: 0, lat: 0 },
    );
    return { lat: sum.lat / ring.length, lng: sum.lng / ring.length };
  }
  return null;
}

/** Outer ring of an area as {lat,lng} points (closing duplicate dropped) for SDK paths. */
export function geometryToLatLngPath(geometry: GeoJsonPolygon | null | undefined): GeoPoint[] {
  const ring = geometry?.coordinates?.[0];
  if (!ring || ring.length === 0) return [];
  const path = ring.map(([lng, lat]) => ({ lat, lng }));
  if (path.length > 1) {
    const first = path[0];
    const last = path[path.length - 1];
    if (first.lat === last.lat && first.lng === last.lng) path.pop();
  }
  return path;
}

/** Google LatLngBoundsLiteral is structurally identical to AreaBounds. */
export function boundsToLiteral(
  bounds: AreaBounds | null | undefined,
): google.maps.LatLngBoundsLiteral | null {
  if (!bounds) return null;
  const { north, south, east, west } = bounds;
  return { north, south, east, west };
}

/** Human-readable distance, e.g. "5 km" or "750 m". */
export function formatDistance(meters: number, locale?: string): string {
  if (meters >= 1000) {
    const km = meters / 1000;
    const text = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(km);
    return `${text} km`;
  }
  return `${Math.round(meters)} m`;
}

/** True when two areas are geometrically equivalent (used to avoid feedback loops). */
export function areasEqual(a: AreaDraft | null | undefined, b: AreaDraft | null | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.type !== b.type) return false;
  if (a.radiusMeters !== b.radiusMeters) return false;
  return JSON.stringify(a.geometry) === JSON.stringify(b.geometry);
}
