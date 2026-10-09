import type { GeoPoint } from './geo-tiling';
import { haversineDistanceMeters } from './utils';

export type GeographicValidationStatus = 'inside' | 'outside' | 'unverified';

export type GeographicValidation = {
  status: GeographicValidationStatus;
  distanceMeters: number | null;
  distanceKm: number | null;
};

/**
 * Classify one Maps record against the immutable centre/radius captured for its
 * discovery session. Missing coordinates are kept but explicitly marked
 * unverified; a record with coordinates outside an explicit radius is rejected
 * by the caller. A null radius means the user did not request a circular filter.
 */
export function validateGeographicResult(
  center: GeoPoint | null,
  radiusKm: number | null,
  point: GeoPoint | null,
): GeographicValidation {
  if (!center || !point) {
    return { status: 'unverified', distanceMeters: null, distanceKm: null };
  }

  const distanceMeters = haversineDistanceMeters(center, point);
  const distanceKm = distanceMeters / 1_000;
  if (!Number.isFinite(radiusKm) || (radiusKm ?? 0) <= 0) {
    return { status: 'inside', distanceMeters, distanceKm };
  }

  return {
    status: distanceKm <= radiusKm! ? 'inside' : 'outside',
    distanceMeters,
    distanceKm,
  };
}

