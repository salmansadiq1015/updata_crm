export const DISCOVERY_PROVIDER_MODE = Object.freeze({
  OPEN_SOURCE_ONLY: 'OPEN_SOURCE_ONLY',
  OPEN_SOURCE_PRIMARY_WITH_COMMERCIAL_FALLBACK: 'OPEN_SOURCE_PRIMARY_WITH_COMMERCIAL_FALLBACK',
  PRIMARY_WITH_FALLBACK: 'PRIMARY_WITH_FALLBACK',
  COMMERCIAL_PRIMARY: 'COMMERCIAL_PRIMARY',
  GOOGLE_ONLY: 'GOOGLE_ONLY',
});

export const DISCOVERY_PROVIDER_NAME = Object.freeze({
  OPENSTREETMAP: 'openstreetmap',
  OVERPASS: 'overpass',
  GEOAPIFY: 'geoapify',
  MAPBOX: 'mapbox',
  GOOGLE_PLACES: 'google_places',
});

export const GEOCODING_PROVIDER_NAME = Object.freeze({
  NOMINATIM: 'nominatim',
  PHOTON: 'photon',
  MAPBOX: 'mapbox_geocoding',
  GEOAPIFY: 'geoapify_geocoding',
  GOOGLE: 'google_geocoding',
});

export function normalizeProviderMode(value) {
  if (value === DISCOVERY_PROVIDER_MODE.PRIMARY_WITH_FALLBACK) {
    return DISCOVERY_PROVIDER_MODE.OPEN_SOURCE_PRIMARY_WITH_COMMERCIAL_FALLBACK;
  }
  return Object.values(DISCOVERY_PROVIDER_MODE).includes(value)
    ? value
    : DISCOVERY_PROVIDER_MODE.OPEN_SOURCE_ONLY;
}

export default {
  DISCOVERY_PROVIDER_MODE,
  DISCOVERY_PROVIDER_NAME,
  GEOCODING_PROVIDER_NAME,
  normalizeProviderMode,
};
