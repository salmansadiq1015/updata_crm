/**
 * Result deduplicator for Business Discovery (Module 15).
 *
 * Pure, DB-free. A multi-cell coverage run (design §7) hits overlapping search
 * circles, so the same business surfaces in several cells. We collapse those by
 * the provider place id into one record, keeping the richest copy (design §8/§9
 * — dedup by placeId before CRM matching / persistence).
 *
 * Expected input shape — each element is EITHER
 *   - a wrapper `{ placeId, business }` (business = normalized sub-doc), OR
 *   - a normalized business object carrying its id at `provider.placeId`
 *     (also tolerant of a top-level `placeId` / `id`).
 * A custom `keyExtractor(item) → string|null` overrides the default resolution.
 * Output elements keep the SAME shape as their winning input element.
 *
 * References: LEAD_GENERATION_DESIGN.md §8 (dedup), §9 (idempotency).
 */

/** Resolve the provider place id from the many shapes callers pass. */
function defaultKey(item) {
  if (!item || typeof item !== 'object') return null;
  return (
    item.placeId
    ?? item.provider?.placeId
    ?? item.business?.provider?.placeId
    ?? item.business?.placeId
    ?? item.id
    ?? null
  );
}

/** The normalized business object inside an item (unwraps a `{ business }` wrapper). */
function businessOf(item) {
  if (item && typeof item === 'object' && item.business && typeof item.business === 'object') {
    return item.business;
  }
  return item && typeof item === 'object' ? item : {};
}

const hasValue = (v) => v !== undefined && v !== null && v !== '';

/**
 * Richness score — how much contact/location signal a business carries. Higher
 * wins when merging. Phone / website / location are weighted most (design §8:
 * "prefer entries with phone/website/location").
 */
function richness(business) {
  if (!business || typeof business !== 'object') return 0;
  let score = 0;
  if (hasValue(business.normalizedPhone) || hasValue(business.phone) || hasValue(business.internationalPhone)) score += 3;
  if (hasValue(business.websiteDomain) || hasValue(business.website)) score += 3;
  if (business.location && Array.isArray(business.location.coordinates) && business.location.coordinates.length >= 2) score += 3;
  if (hasValue(business.email)) score += 1;
  if (hasValue(business.address?.formatted) || hasValue(business.address?.postalCode)) score += 1;
  if (hasValue(business.rating) || hasValue(business.reviewCount)) score += 1;
  return score;
}

/** Fill null/empty top-level fields of `base` from `extra` (shallow + address). */
function fillGaps(base, extra) {
  if (!extra || typeof extra !== 'object') return base;
  const out = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    if (key === 'address' && value && typeof value === 'object') {
      out.address = { ...(value || {}), ...(base.address || {}) };
      // Prefer base's non-empty address fields; fall back to extra's.
      for (const [ak, av] of Object.entries(value)) {
        if (!hasValue(out.address[ak]) && hasValue(av)) out.address[ak] = av;
      }
      continue;
    }
    if (!hasValue(out[key]) && hasValue(value)) out[key] = value;
  }
  return out;
}

/** Re-wrap a merged business into the winning item's shape. */
function rewrap(winnerItem, mergedBusiness, placeId) {
  if (winnerItem && typeof winnerItem === 'object' && winnerItem.business && typeof winnerItem.business === 'object') {
    return { ...winnerItem, placeId: winnerItem.placeId ?? placeId ?? undefined, business: mergedBusiness };
  }
  return mergedBusiness;
}

/**
 * Deduplicate a flat list of discovered results by provider place id, merging
 * duplicates so the richest record wins and its gaps are filled from the others.
 * First-seen order of unique keys is preserved. Items without a resolvable key
 * are passed through untouched (each kept as its own unique entry).
 *
 * @param {Array<object>} results
 * @param {object} [options]
 * @param {(item: object) => (string|null)} [options.keyExtractor]
 * @returns {Array<object>} unique list, elements in the input's shape.
 */
export function dedupeByPlaceId(results = [], { keyExtractor } = {}) {
  if (!Array.isArray(results) || results.length === 0) return [];
  const key = typeof keyExtractor === 'function' ? keyExtractor : defaultKey;

  const order = [];
  const byKey = new Map();
  let unkeyedSeq = 0;

  for (const item of results) {
    const rawKey = key(item);
    if (!hasValue(rawKey)) {
      // Cannot dedupe — keep as its own entry so no data is lost.
      const k = `__unkeyed_${unkeyedSeq++}`;
      order.push(k);
      byKey.set(k, { winner: item, business: businessOf(item), score: richness(businessOf(item)), placeId: null });
      continue;
    }
    const k = String(rawKey);
    const business = businessOf(item);
    const score = richness(business);
    const existing = byKey.get(k);
    if (!existing) {
      order.push(k);
      byKey.set(k, { winner: item, business, score, placeId: rawKey });
      continue;
    }
    // Merge: the richer record is the base; the other fills its gaps.
    if (score > existing.score) {
      existing.winner = item;
      existing.business = fillGaps(business, existing.business);
      existing.score = score;
    } else {
      existing.business = fillGaps(existing.business, business);
    }
  }

  return order.map((k) => {
    const entry = byKey.get(k);
    return rewrap(entry.winner, entry.business, entry.placeId);
  });
}

/**
 * Flatten multi-cell coverage results and dedupe by place id. Each element of
 * `cellResultArrays` is one cell's result list (array). Non-array cells are
 * skipped defensively.
 *
 * @param {Array<Array<object>>} cellResultArrays
 * @param {object} [options] - forwarded to {@link dedupeByPlaceId} (e.g. keyExtractor).
 * @returns {Array<object>} flat, deduped list.
 */
export function mergeCellResults(cellResultArrays = [], options = {}) {
  if (!Array.isArray(cellResultArrays)) return [];
  const flat = [];
  for (const cell of cellResultArrays) {
    if (Array.isArray(cell)) flat.push(...cell);
  }
  return dedupeByPlaceId(flat, options);
}

export default { dedupeByPlaceId, mergeCellResults };
