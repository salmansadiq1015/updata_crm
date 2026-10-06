import config from '../../../config/index.js';
import { ExternalServiceError, ERROR_CODES } from '../../../shared/errors/errors.js';
import googlePlacesProvider from './GooglePlacesProvider.js';
import overpassProvider from './OverpassProvider.js';
import nominatimProvider from './NominatimProvider.js';
import {
  DISCOVERY_PROVIDER_MODE,
  DISCOVERY_PROVIDER_NAME,
  GEOCODING_PROVIDER_NAME,
  normalizeProviderMode,
} from './providerNames.js';

class FallbackBusinessDiscoveryProvider {
  constructor(primary, fallbacks = [], { maxFallbackRequests = 0 } = {}) {
    this.primary = primary;
    this.fallbacks = fallbacks.filter(Boolean);
    this.name = primary?.name || DISCOVERY_PROVIDER_NAME.OVERPASS;
    this.maxFallbackRequests = Math.max(0, Math.trunc(maxFallbackRequests || 0));
    this.fallbackRequests = 0;
  }

  isConfigured() {
    return Boolean(this.primary?.isConfigured?.() || this.fallbacks.some((provider) => provider.isConfigured?.()));
  }

  async searchNearby(params = {}) {
    return this._withFallback('searchNearby', params);
  }

  async searchText(params = {}) {
    return this._withFallback('searchText', params);
  }

  async placeDetails(placeId, opts = {}) {
    const provider = this._providerByPlaceId(placeId) || this.primary;
    return provider?.placeDetails?.(placeId, opts) ?? { place: null, raw: null };
  }

  _providerByPlaceId(placeId) {
    const id = String(placeId || '');
    if (id.startsWith('osm:')) return overpassProvider;
    return googlePlacesProvider;
  }

  async _withFallback(method, params) {
    try {
      if (this.primary?.isConfigured?.()) {
        const response = await this.primary[method](params);
        if (Array.isArray(response?.places) && response.places.length > 0) return response;
      }
    } catch (err) {
      if (err?.code === ERROR_CODES.DISCOVERY_NOT_CONFIGURED && this.fallbacks.length) {
        return this._callFallback(method, params, err);
      }
      throw err;
    }
    return this._callFallback(method, params);
  }

  async _callFallback(method, params, originalError) {
    if (!this.fallbacks.length || this.fallbackRequests >= this.maxFallbackRequests) {
      if (originalError) throw originalError;
      return { places: [], raw: { fallbackSkipped: true } };
    }

    let lastError = originalError;
    for (const provider of this.fallbacks) {
      if (!provider?.isConfigured?.()) continue;
      if (this.fallbackRequests >= this.maxFallbackRequests) break;
      this.fallbackRequests += 1;
      try {
        const response = await provider[method](params);
        if (Array.isArray(response?.places)) {
          return {
            ...response,
            fallbackUsed: true,
            fallbackProvider: provider.name || DISCOVERY_PROVIDER_NAME.GOOGLE_PLACES,
          };
        }
      } catch (err) {
        lastError = err;
        if (!err?.retryable) break;
      }
    }
    if (lastError) throw lastError;
    return { places: [], raw: { fallbackSkipped: true } };
  }
}

function googleFallbacks() {
  const enabled = Boolean(config.discovery?.providers?.googleFallbackEnabled);
  return enabled ? [googlePlacesProvider] : [];
}

export function getBusinessDiscoveryProvider() {
  const mode = normalizeProviderMode(config.discovery?.providerMode);
  if (mode === DISCOVERY_PROVIDER_MODE.GOOGLE_ONLY) return googlePlacesProvider;
  if (mode === DISCOVERY_PROVIDER_MODE.COMMERCIAL_PRIMARY) {
    return googlePlacesProvider.isConfigured() ? googlePlacesProvider : overpassProvider;
  }
  if (mode === DISCOVERY_PROVIDER_MODE.OPEN_SOURCE_PRIMARY_WITH_COMMERCIAL_FALLBACK) {
    return new FallbackBusinessDiscoveryProvider(overpassProvider, googleFallbacks(), {
      maxFallbackRequests: config.discovery?.googleFallbackMaxRequests || 0,
    });
  }
  return overpassProvider;
}

export function getGeocodingProvider() {
  const mode = normalizeProviderMode(config.discovery?.providerMode);
  if (mode === DISCOVERY_PROVIDER_MODE.GOOGLE_ONLY) return googlePlacesProvider;
  if (nominatimProvider.isConfigured()) return nominatimProvider;
  return googlePlacesProvider;
}

export function getDetailsProvider(providerName) {
  if (providerName === DISCOVERY_PROVIDER_NAME.OPENSTREETMAP || providerName === DISCOVERY_PROVIDER_NAME.OVERPASS) {
    return overpassProvider;
  }
  return googlePlacesProvider;
}

export function assertProviderConfigured(provider, serviceName = 'business-discovery') {
  if (provider?.isConfigured?.()) return;
  const error = new ExternalServiceError(
    serviceName,
    'No configured discovery provider is available',
    ERROR_CODES.DISCOVERY_NOT_CONFIGURED,
  );
  error.retryable = false;
  throw error;
}

export {
  FallbackBusinessDiscoveryProvider,
  googlePlacesProvider,
  overpassProvider,
  nominatimProvider,
  DISCOVERY_PROVIDER_MODE,
  DISCOVERY_PROVIDER_NAME,
  GEOCODING_PROVIDER_NAME,
};

export default {
  getBusinessDiscoveryProvider,
  getGeocodingProvider,
  getDetailsProvider,
  assertProviderConfigured,
};
