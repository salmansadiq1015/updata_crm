/**
 * Abstract Places provider interface for Business Discovery (Module 15).
 *
 * The discovery engine/service talk ONLY to this contract so the concrete
 * provider (currently {@link ./GooglePlacesProvider.js}) can be swapped later
 * without touching models, services, routes or the engine. Concrete providers
 * extend this class and override every method; the base implementations throw
 * "not implemented" so a half-built provider fails loudly.
 *
 * Design references: LEAD_GENERATION_DESIGN.md §6 (Google integration),
 * §10 (cost/cache), §H (failure / retry taxonomy).
 *
 * ── Normalized return shapes (provider-agnostic keys, RAW provider payloads) ──
 * Providers return the RAW provider place objects (no normalization here — the
 * engine's `normalizeBusiness` does that). Only the wrapper keys are stable:
 *   - searchNearby  → { places: RawPlace[], raw }
 *   - searchText    → { places: RawPlace[], nextPageToken?: string, raw }
 *   - placeDetails  → { place: RawPlace, raw }
 *   - autocomplete  → { predictions: RawSuggestion[], raw }
 *   - geocode       → { result: GeocodeResult|null, results: GeocodeResult[], raw }
 *   - reverseGeocode→ { result: GeocodeResult|null, results: GeocodeResult[], raw }
 *
 * ── Error contract ──
 * Network methods reject with an {@link ExternalServiceError} carrying a
 * machine-readable `code` (DISCOVERY_PROVIDER_ERROR / DISCOVERY_QUOTA_EXCEEDED /
 * DISCOVERY_NOT_CONFIGURED) and a boolean `retryable` flag so the worker can
 * decide between backoff-retry and marking a cell failed.
 */

function notImplemented(method) {
  return new Error(`PlacesProvider.${method}() is not implemented by this provider`);
}

export class PlacesProvider {
  /**
   * @returns {boolean} whether this provider has the credentials it needs to
   *   make network calls. When false, network methods throw
   *   DISCOVERY_NOT_CONFIGURED without hitting the network.
   */
  isConfigured() {
    return false;
  }

  /**
   * Nearby (structured type + circle) search.
   * @param {object} _params
   * @param {{lat:number,lng:number}} _params.center
   * @param {number} _params.radiusMeters
   * @param {string[]} [_params.includedTypes]
   * @param {number} [_params.maxResultCount] - capped at 20 by the provider.
   * @param {string} [_params.rankPreference] - 'POPULARITY' | 'DISTANCE'.
   * @param {string|string[]} [_params.fieldProfile] - a {@link fieldProfiles} name or paths.
   * @returns {Promise<{ places: object[], raw: object }>}
   */
  async searchNearby(_params = {}) {
    throw notImplemented('searchNearby');
  }

  /**
   * Text (keyword / custom type) search, paginated via `pageToken`.
   * @param {object} _params
   * @param {string} _params.textQuery
   * @param {string} [_params.includedType] - restrict a text search to one structured type.
   * @param {{lat:number,lng:number}} [_params.center]
   * @param {number} [_params.radiusMeters]
   * @param {number} [_params.maxResultCount] - capped at 20 by the provider.
   * @param {string} [_params.pageToken] - continuation token from a prior page.
   * @param {string|string[]} [_params.fieldProfile]
   * @returns {Promise<{ places: object[], nextPageToken?: string, raw: object }>}
   */
  async searchText(_params = {}) {
    throw notImplemented('searchText');
  }

  /**
   * Place Details (on import or detail-drawer open — NOT per discovered place).
   * @param {string} _placeId
   * @param {object} [_opts]
   * @param {string|string[]} [_opts.fieldProfile] - default DETAILS_STANDARD.
   * @returns {Promise<{ place: object, raw: object }>}
   */
  async placeDetails(_placeId, _opts = {}) {
    throw notImplemented('placeDetails');
  }

  /**
   * Place Autocomplete (location search box).
   * @param {object} _params
   * @param {string} _params.input
   * @param {string} [_params.sessionToken]
   * @param {{lat:number,lng:number}} [_params.center]
   * @param {number} [_params.radiusMeters]
   * @returns {Promise<{ predictions: object[], raw: object }>}
   */
  async autocomplete(_params = {}) {
    throw notImplemented('autocomplete');
  }

  /**
   * Forward geocode an address string → geographic result(s).
   * @param {string} _address
   * @returns {Promise<{ result: object|null, results: object[], raw: object }>}
   */
  async geocode(_address) {
    throw notImplemented('geocode');
  }

  /**
   * Reverse geocode coordinates → geographic result(s).
   * @param {object} _params
   * @param {number} _params.lat
   * @param {number} _params.lng
   * @returns {Promise<{ result: object|null, results: object[], raw: object }>}
   */
  async reverseGeocode(_params = {}) {
    throw notImplemented('reverseGeocode');
  }
}

export default PlacesProvider;
