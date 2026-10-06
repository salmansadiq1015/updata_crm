/**
 * Lazy Place Details enrichment for discovery results (Module 15, design §6/§14).
 *
 * The discovery sweep stores only minimal fields (id/name/location/rating) to
 * control Google Places cost — contact fields (phone / website / hours / price)
 * are the expensive Enterprise SKU and are deferred until a place is actually
 * OPENED (detail drawer) or IMPORTED. This helper performs that deferred fetch,
 * merges it into the result's `business` sub-doc, stamps `details.fetchedAt` so
 * the same place is never re-billed, and bumps the session's usage counter.
 *
 * Contract: IDEMPOTENT (skips when already fetched or unconfigured) and
 * BEST-EFFORT (any provider error is logged and the original result returned, so
 * opening a drawer / importing never fails because details could not be fetched).
 */

import { getDetailsProvider } from '../provider/providerFactory.js';
import { normalizeBusiness } from './normalizer.js';
import discoveryRepository from '../discovery.repository.js';
import logger from '../../../shared/logger/index.js';

const LOG_MODULE = 'businessDiscovery';

/**
 * Build the dot-path $set for the fields Place Details adds on top of the sweep.
 * Name / location / address from the sweep are preserved — a DETAILS_STANDARD
 * response has no addressComponents, so we never clobber a parsed address with a
 * thinner one. rating / reviewCount / businessStatus / email are refreshed only
 * when the details response actually carried a value.
 */
function buildDetailSet(nb, source = 'provider_details') {
  const set = {
    'business.phone': nb.phone ?? null,
    'business.internationalPhone': nb.internationalPhone ?? null,
    'business.normalizedPhone': nb.normalizedPhone ?? null,
    'business.website': nb.website ?? null,
    'business.websiteDomain': nb.websiteDomain ?? null,
    'business.openingHours': nb.openingHours ?? null,
    'business.priceLevel': nb.priceLevel ?? null,
    'details.fetchedAt': new Date(),
    'details.source': source,
  };
  if (nb.email) set['business.email'] = nb.email;
  if (nb.rating != null) set['business.rating'] = nb.rating;
  if (nb.reviewCount != null) set['business.reviewCount'] = nb.reviewCount;
  if (nb.businessStatus) set['business.businessStatus'] = nb.businessStatus;
  if (nb.mapsUrl) set['business.mapsUrl'] = nb.mapsUrl;
  return set;
}

/**
 * Fetch + persist Place Details for one discovery result (lean doc).
 *
 * @param {object} result - a lean discovery_result doc.
 * @param {object} [opts]
 * @param {string} [opts.fieldProfile='DETAILS_STANDARD'] - 'DETAILS_STANDARD' (drawer)
 *   or 'DETAILS_IMPORT' (import — adds addressComponents for clean Lead mapping).
 * @param {string|ObjectId} [opts.createdBy] - owner scope; defaults to result.createdBy.
 * @returns {Promise<{ result: object, fetched: boolean }>} the (possibly) enriched
 *   result and whether a details fetch actually persisted new data.
 */
export async function enrichResultWithDetails(result, { fieldProfile = 'DETAILS_STANDARD', createdBy } = {}) {
  if (!result) return { result, fetched: false };
  if (result.details?.fetchedAt) return { result, fetched: false }; // already cached

  const placeId = result.provider?.placeId;
  const providerName = result.provider?.name;
  const provider = getDetailsProvider(providerName);
  if (!placeId || !provider.isConfigured()) return { result, fetched: false };

  const owner = createdBy ?? result.createdBy;
  try {
    const { place } = await provider.placeDetails(placeId, { fieldProfile });
    if (!place) return { result, fetched: false };
    const nb = normalizeBusiness(place);
    const updated = await discoveryRepository.updateResultDetails(result._id, {
      set: buildDetailSet(nb, `${providerName || provider.name || 'provider'}_details`),
      createdBy: owner,
    });
    // Best-effort cost accounting — never let a usage write fail the enrichment.
    if (result.discoverySessionId) {
      discoveryRepository
        .incrementSessionUsage(result.discoverySessionId, { detailsRequests: 1 }, { createdBy: owner })
        .catch(() => {});
    }
    return { result: updated || result, fetched: Boolean(updated) };
  } catch (err) {
    logger.warn('Place details enrichment failed; returning sweep-only result', {
      module: LOG_MODULE,
      action: 'details.enrich',
      resultId: String(result._id),
      error: { message: err.message, code: err.code },
    });
    return { result, fetched: false };
  }
}

export default { enrichResultWithDetails };
