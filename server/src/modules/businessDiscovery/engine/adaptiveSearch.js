/** Adaptive provider search over a gap-free set of geographic cells. */

import {
  PROVIDER_PAGE_SIZE,
  canSubdivideCoverageCell,
  splitCoverageCell,
} from './coveragePlanner.js';
import { resolveProviderQuery } from '../businessTypeCatalog.js';

const RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 250;
const DEFAULT_MAX_TEXT_PAGES_PER_REGION = 10;

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
  shouldStop = async () => false,
  retryDelay = sleep,
  maxTextPagesPerRegion = DEFAULT_MAX_TEXT_PAGES_PER_REGION,
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
    stoppedEarly: false,
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

  const emitProgress = async () => onProgress({ ...state });

  const stopRequested = async () => {
    if (state.stoppedEarly) return true;
    if (await shouldStop()) {
      state.stoppedEarly = true;
      return true;
    }
    return false;
  };

  const processUnit = async (unit) => {
    if (state.cancelled || state.budgetExhausted || state.stoppedEarly) return [];
    if (await isCancelled()) {
      state.cancelled = true;
      return [];
    }
    if (await stopRequested()) return [];

    const { cell, businessType, query } = unit;
    let saturated = false;
    let failed = false;
    let saturationAlreadyHandled = false;
    try {
      if (query.includedType && !keyword) {
        const response = await callWithRetry(() => provider.searchNearby({
          center: cell.center,
          radiusMeters: cell.radiusMeters,
          includedTypes: [query.includedType],
          businessTypeId: query.typeId ?? businessType.id,
          osmTags: query.osmTags,
          keyword,
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
        await stopRequested();
      } else {
        let pageToken;
        let lastPageSize = 0;
        const usedTokens = new Set();
        let pagesForRegion = 0;
        do {
          if (await isCancelled()) {
            state.cancelled = true;
            break;
          }
          if (await stopRequested()) break;
          const response = await callWithRetry(() => provider.searchText({
            textQuery: query.textQuery,
            includedType: query.includedType,
            businessTypeId: query.typeId ?? businessType.id,
            osmTags: query.osmTags,
            keyword,
            center: cell.center,
            radiusMeters: cell.radiusMeters,
            bounds: cell.bounds,
            maxResultCount: PROVIDER_PAGE_SIZE,
            fieldProfile: 'DETAILS_IMPORT',
            pageToken,
          }));
          const places = Array.isArray(response?.places) ? response.places : [];
          state.textPages += 1;
          pagesForRegion += 1;
          lastPageSize = places.length;
          state.rawResults += places.length;
          if (places.length) await onBatch(places, { cell, businessType, query });
          if (await stopRequested()) break;

          const next = response?.nextPageToken || null;
          if (next && pagesForRegion >= maxTextPagesPerRegion) {
            state.unresolvedSaturation = true;
            state.unresolvedRegions += 1;
            saturationAlreadyHandled = true;
            pageToken = null;
          } else if (next && usedTokens.has(next)) {
            state.unresolvedSaturation = true;
            state.unresolvedRegions += 1;
            saturationAlreadyHandled = true;
            pageToken = null;
          } else {
            if (next) usedTokens.add(next);
            pageToken = next;
          }
        } while (pageToken && !state.cancelled && !state.budgetExhausted && !state.stoppedEarly);
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
        failed = true;
      }
    } finally {
      state.regionsCompleted += 1;
    }

    if (failed || state.cancelled || state.stoppedEarly || !saturated) {
      await emitProgress();
      return [];
    }
    state.saturatedRegions += 1;
    if (saturationAlreadyHandled) {
      await emitProgress();
      return [];
    }
    if (state.budgetExhausted) {
      state.unresolvedSaturation = true;
      if (state.unresolvedRegions === 0) state.unresolvedRegions += 1;
      await emitProgress();
      return [];
    }
    if (!canSubdivideCoverageCell(cell)) {
      state.unresolvedSaturation = true;
      state.unresolvedRegions += 1;
      await emitProgress();
      return [];
    }
    const children = splitCoverageCell(cell).map((child) => ({
      cell: child,
      businessType,
      query,
    }));
    state.subdividedRegions += 1;
    state.regionsTotal += children.length;
    await emitProgress();
    return children;
  };

  while (pending.length && !state.cancelled && !state.budgetExhausted && !state.stoppedEarly) {
    const wave = pending;
    pending = [];
    const children = await runWave(wave, concurrency, processUnit);
    for (const group of children) if (Array.isArray(group)) pending.push(...group);
  }

  if (pending.length > 0 && state.budgetExhausted) state.unresolvedSaturation = true;
  return state;
}

export default { runAdaptiveSearch };
