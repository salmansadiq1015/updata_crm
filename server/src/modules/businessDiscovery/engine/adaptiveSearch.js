/** Adaptive provider search over a gap-free set of geographic cells. */

import {
  PROVIDER_PAGE_SIZE,
  canSubdivideCoverageCell,
  splitCoverageCell,
} from './coveragePlanner.js';
import { resolveProviderQuery } from '../businessTypeCatalog.js';

const RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 250;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runWave(items, concurrency, worker) {
  const outputs = new Array(items.length);
  let index = 0;
  const runners = Array.from(
    { length: Math.max(1, Math.min(concurrency || 1, items.length || 1)) },
    async () => {
      while (index < items.length) {
        const current = index;
        index += 1;
        outputs[current] = await worker(items[current]);
      }
    },
  );
  await Promise.all(runners);
  return outputs;
}

function budgetError() {
  const error = new Error('Discovery provider request budget exhausted');
  error.code = 'DISCOVERY_SEARCH_BUDGET_EXHAUSTED';
  return error;
}

/**
 * Search all initial cells and recursively refine every provider-saturated leaf.
 * `onBatch` is called for each provider page, enabling incremental persistence.
 */
export async function runAdaptiveSearch({
  provider,
  cells,
  businessTypes,
  keyword,
  maxSearchRequests,
  concurrency = 3,
  onBatch = async () => {},
  onProgress = async () => {},
  onRequest = () => {},
  isCancelled = async () => false,
  retryDelay = sleep,
} = {}) {
  const requestLimit = Number.isFinite(maxSearchRequests) && maxSearchRequests > 0
    ? Math.floor(maxSearchRequests)
    : Infinity;
  const state = {
    searchRequests: 0,
    regionsCompleted: 0,
    regionsTotal: 0,
    rawResults: 0,
    errors: 0,
    cancelled: false,
    budgetExhausted: false,
    unresolvedSaturation: false,
    saturatedRegions: 0,
    subdividedRegions: 0,
    unresolvedRegions: 0,
    textPages: 0,
  };

  const types = (businessTypes || []).map((businessType) => {
    const query = resolveProviderQuery(businessType.id, keyword);
    return { businessType, query };
  });
  let pending = (cells || []).flatMap((cell) =>
    types.map(({ businessType, query }) => ({ cell, businessType, query })));
  state.regionsTotal = pending.length;

  const reserveRequest = () => {
    if (state.searchRequests >= requestLimit) {
      state.budgetExhausted = true;
      return false;
    }
    state.searchRequests += 1;
    return true;
  };

  const callWithRetry = async (call) => {
    let lastError;
    for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt += 1) {
      if (!reserveRequest()) throw budgetError();
      try {
        const response = await call();
        onRequest('success');
        return response;
      } catch (error) {
        onRequest('error', error);
        lastError = error;
        if (!error?.retryable || attempt === RETRY_ATTEMPTS - 1) throw error;
        await retryDelay(RETRY_BASE_DELAY_MS * (2 ** attempt));
      }
    }
    throw lastError;
  };

  const processUnit = async (unit) => {
    if (state.cancelled || state.budgetExhausted) return [];
    if (await isCancelled()) {
      state.cancelled = true;
      return [];
    }

    const { cell, businessType, query } = unit;
    let saturated = false;
    try {
      if (query.includedType && !keyword) {
        const response = await callWithRetry(() => provider.searchNearby({
          center: cell.center,
          radiusMeters: cell.radiusMeters,
          includedTypes: [query.includedType],
          maxResultCount: PROVIDER_PAGE_SIZE,
          rankPreference: 'DISTANCE',
          // Contact fields are included in the search response so discovery
          // classification can use phone/domain and the result drawer does not
          // falsely show "No phone/website" for data Google already has.
          fieldProfile: 'DETAILS_IMPORT',
        }));
        const places = Array.isArray(response?.places) ? response.places : [];
        state.rawResults += places.length;
        saturated = places.length >= PROVIDER_PAGE_SIZE;
        if (places.length) await onBatch(places, { cell, businessType, query });
      } else {
        let pageToken;
        let lastPageSize = 0;
        const usedTokens = new Set();
        do {
          const response = await callWithRetry(() => provider.searchText({
            textQuery: query.textQuery,
            includedType: query.includedType,
            center: cell.center,
            radiusMeters: cell.radiusMeters,
            bounds: cell.bounds,
            maxResultCount: PROVIDER_PAGE_SIZE,
            fieldProfile: 'DETAILS_IMPORT',
            pageToken,
          }));
          const places = Array.isArray(response?.places) ? response.places : [];
          state.textPages += 1;
          lastPageSize = places.length;
          state.rawResults += places.length;
          if (places.length) await onBatch(places, { cell, businessType, query });

          const next = response?.nextPageToken || null;
          if (next && usedTokens.has(next)) {
            state.unresolvedSaturation = true;
            state.unresolvedRegions += 1;
            pageToken = null;
          } else {
            if (next) usedTokens.add(next);
            pageToken = next;
          }
        } while (pageToken && !state.cancelled && !state.budgetExhausted);
        saturated = lastPageSize >= PROVIDER_PAGE_SIZE;
      }
    } catch (error) {
      if (error?.code === 'DISCOVERY_NOT_CONFIGURED') throw error;
      if (error?.code === 'DISCOVERY_SEARCH_BUDGET_EXHAUSTED') {
        state.unresolvedSaturation = true;
        state.unresolvedRegions += 1;
      } else {
        state.errors += 1;
        state.unresolvedRegions += 1;
        return [];
      }
    } finally {
      state.regionsCompleted += 1;
    }

    if (!saturated) return [];
    state.saturatedRegions += 1;
    if (state.budgetExhausted) {
      state.unresolvedSaturation = true;
      if (state.unresolvedRegions === 0) state.unresolvedRegions += 1;
      return [];
    }
    if (!canSubdivideCoverageCell(cell)) {
      state.unresolvedSaturation = true;
      state.unresolvedRegions += 1;
      return [];
    }
    const children = splitCoverageCell(cell).map((child) => ({
      cell: child,
      businessType,
      query,
    }));
    state.subdividedRegions += 1;
    state.regionsTotal += children.length;
    return children;
  };

  while (pending.length && !state.cancelled && !state.budgetExhausted) {
    const wave = pending;
    pending = [];
    const children = await runWave(wave, concurrency, processUnit);
    for (const group of children) if (Array.isArray(group)) pending.push(...group);
    await onProgress({ ...state });
  }

  if (pending.length > 0 && state.budgetExhausted) state.unresolvedSaturation = true;
  return state;
}

export default { runAdaptiveSearch };
