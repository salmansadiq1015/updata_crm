import type { GeoPoint } from './geo-tiling';
import type { DiscoveryConfig, MapsContext } from './types';
import { sameGeoPoint } from './utils';

/** Build queries without ever treating a business-only Maps query as a place. */
export function buildDiscoveryQueries(
  config: Pick<DiscoveryConfig, 'businessType' | 'location' | 'queryExpansion'>,
  context?: Pick<MapsContext, 'query'>,
): string[] {
  const business = config.businessType.trim();
  const location = config.location.trim();
  const contextQuery = context?.query?.trim() ?? '';
  const hasMatchingContext = Boolean(contextQuery)
    && contextQuery.toLocaleLowerCase().includes(business.toLocaleLowerCase());
  const first = location
    ? `${business} near ${location}`
    : hasMatchingContext
      ? contextQuery
      : business;

  if (!config.queryExpansion || !location) return [first];
  return [...new Set([first, `${business} in ${location}`, `${business} ${location}`])];
}

/** A typed-place camera is trustworthy only after it settles away from the old viewport. */
export function isResolvedGeocodeCamera(
  camera: GeoPoint | null,
  previousCamera: GeoPoint | null,
  originalCenter: GeoPoint | null,
): camera is GeoPoint {
  if (!camera || !sameGeoPoint(camera, previousCamera, 0.01)) return false;
  return !originalCenter || !sameGeoPoint(camera, originalCenter, 0.05);
}
