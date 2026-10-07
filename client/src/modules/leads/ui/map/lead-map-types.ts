// Shared, framework-agnostic contracts for the Leads map. No Leaflet / React
// imports here so these types can be used on both sides of the next/dynamic
// boundary (the canvas is client-only; everything else is SSR-safe).

import type { LeadStatus } from '../../types/lead-types';

export type LatLng = { lat: number; lng: number };

export type MapBounds = { north: number; south: number; east: number; west: number };

/** The minimal datum the canvas needs to draw + cluster one located lead. */
export type LeadMapPoint = {
  id: string;
  lat: number;
  lng: number;
  status: LeadStatus;
};

export type LeadMapViewport = {
  center: LatLng;
  zoom: number;
  bounds: MapBounds;
};

/** Area-select tools (drawing on the map to lasso leads). `null` = not drawing. */
export type LeadMapDrawMode = 'circle' | 'rectangle' | 'polygon' | null;

/** A committed selection area, in the same lat/lng space the leads live in. */
export type LeadMapArea =
  | { kind: 'circle'; center: LatLng; radiusMeters: number }
  | { kind: 'rectangle'; bounds: MapBounds }
  | { kind: 'polygon'; points: LatLng[] };

/** A fly-to request: location + a nonce so repeats to the same point still fire. */
export type LeadMapFocus = { lat: number; lng: number; nonce: number } | null;

// ── Geometry (pure) ───────────────────────────────────────────────────────────

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance in metres between two points (haversine). */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function inBounds(point: LatLng, bounds: MapBounds): boolean {
  return (
    point.lat <= bounds.north &&
    point.lat >= bounds.south &&
    point.lng <= bounds.east &&
    point.lng >= bounds.west
  );
}

/** Ray-casting point-in-polygon (polygon is an open ring of lat/lng vertices). */
function inPolygon(point: LatLng, ring: LatLng[]): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const yi = ring[i].lat;
    const xi = ring[i].lng;
    const yj = ring[j].lat;
    const xj = ring[j].lng;
    const intersects =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Whether a point falls inside a committed selection area. */
export function isPointInArea(point: LatLng, area: LeadMapArea): boolean {
  switch (area.kind) {
    case 'circle':
      return haversineMeters(area.center, point) <= area.radiusMeters;
    case 'rectangle':
      return inBounds(point, area.bounds);
    case 'polygon':
      return inPolygon(point, area.points);
    default:
      return false;
  }
}

/** Tightest lat/lng box containing every point, or null when there are none. */
export function boundsOf(points: readonly LatLng[]): MapBounds | null {
  if (points.length === 0) return null;
  let north = -Infinity;
  let south = Infinity;
  let east = -Infinity;
  let west = Infinity;
  for (const p of points) {
    if (p.lat > north) north = p.lat;
    if (p.lat < south) south = p.lat;
    if (p.lng > east) east = p.lng;
    if (p.lng < west) west = p.lng;
  }
  return { north, south, east, west };
}
