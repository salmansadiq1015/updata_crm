import { BaseWorker } from '../shared/queue/BaseWorker.js';
import config from '../config/index.js';
import logger from '../shared/logger/index.js';
import ERROR_CODES from '../shared/errors/errorCodes.js';
import {
  discoverySearchesTotal,
  discoveryResultsDiscoveredTotal,
  discoveryRunDuration,
} from '../metrics/index.js';

/**
 * Discovery run worker (Module 15).
 *
 * Drives one "Analyze Area" session end-to-end: plan coverage → fetch cells from
 * the Places provider (bounded concurrency + search-budget) → merge/dedupe →
 * normalize → in-area geometry filter → CRM match → upsert results → finalize
 * (COMPLETED / PARTIAL / CANCELLED), mirroring progress to the client over
 * Socket.IO (design §7, §8, §9, §12, §H).
 *
 * Idempotent: results upsert by {session, placeId} and `isAlreadyDone()` skips a
 * session that already reached a terminal state, so a BullMQ re-run never
 * duplicates. The Google key stays inside the provider — never logged here.
 *
 * Models/services are lazy-imported inside the handler to avoid circular deps
 * (same pattern as ighImport.job.js).
 */

const LOG_MODULE = 'businessDiscovery';
const PERSIST_BATCH = 100;
// Google Places (New) Text Search paginates to ~3 pages (60 results); bound it.
const MAX_TEXT_PAGES = 3;

/** Run an async worker over items with a bounded concurrency pool. */
async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let index = 0;
  const size = Math.max(1, Math.min(limit || 1, items.length || 1));
  const runners = [];
  for (let i = 0; i < size; i += 1) {
    runners.push((async () => {
      while (index < items.length) {
        const current = index;
        index += 1;
        results[current] = await worker(items[current]);
      }
    })());
  }
  await Promise.all(runners);
  return results;
}

export class DiscoveryRunWorker extends BaseWorker {
  constructor() {
    super('discovery-run');
  }

  /** Skip when the session already reached a terminal state (COMPLETED/CANCELLED). */
  async isAlreadyDone(job) {
    const { sessionId, createdBy } = job.data || {};
    if (!sessionId) return true;
    const { default: discoveryRepository } = await import('../modules/businessDiscovery/discovery.repository.js');
    const { DISCOVERY_SESSION_STATUS } = await import('../modules/businessDiscovery/discoverySession.model.js');
    const session = await discoveryRepository.getSessionById(sessionId, { createdBy });
    if (!session) return true;
    return (
      session.status === DISCOVERY_SESSION_STATUS.COMPLETED
      || session.status === DISCOVERY_SESSION_STATUS.CANCELLED
    );
  }

  async process(job) {
    const startTime = Date.now();
    const { sessionId, createdBy } = job.data || {};

    // ── Lazy imports (avoid circular deps) ──
    const { default: discoveryRepository } = await import('../modules/businessDiscovery/discovery.repository.js');
    const { getPlacesProvider } = await import('../modules/businessDiscovery/provider/GooglePlacesProvider.js');
    const { planCoverage } = await import('../modules/businessDiscovery/engine/coveragePlanner.js');
    const { mergeCellResults } = await import('../modules/businessDiscovery/engine/deduplicator.js');
    const { normalizeBusiness } = await import('../modules/businessDiscovery/engine/normalizer.js');
    const { pointInPolygon } = await import('../modules/businessDiscovery/engine/geometry.js');
    const { default: crmMatcher } = await import('../modules/businessDiscovery/engine/crmMatcher.js');
    const { resolveProviderQuery } = await import('../modules/businessDiscovery/businessTypeCatalog.js');
    const { DISCOVERY_SESSION_STATUS } = await import('../modules/businessDiscovery/discoverySession.model.js');
    const { RESULT_MATCHING_STATUS, RESULT_IMPORT_STATUS } = await import('../modules/businessDiscovery/discoveryResult.model.js');
    const {
      emitDiscoveryProgress,
      emitDiscoveryResult,
      emitDiscoveryCompleted,
    } = await import('../modules/businessDiscovery/discovery.events.js');
    const { default: auditService } = await import('../modules/auth/audit.service.js');

    const STATUS = DISCOVERY_SESSION_STATUS;

    const session = await discoveryRepository.getSessionById(sessionId, { createdBy });
    if (!session) {
      logger.warn('Discovery run skipped — session not found', {
        module: LOG_MODULE, action: 'process', sessionId: String(sessionId),
      });
      return { skipped: true };
    }

    // Cancellation requested before we even started.
    if (session.cancelRequested) {
      await discoveryRepository.setSessionStatus(sessionId, STATUS.CANCELLED, {
        set: { completedAt: new Date() }, createdBy,
      });
      emitDiscoveryCompleted(sessionId, { sessionId, status: STATUS.CANCELLED });
      return { sessionId, status: STATUS.CANCELLED };
    }

    try {
      // Claim the run (guard against a cancel landing between load and here).
      const claimed = await discoveryRepository.setSessionStatus(sessionId, STATUS.RUNNING, {
        expectedStatus: [STATUS.QUEUED, STATUS.RUNNING, STATUS.FAILED],
        set: { startedAt: new Date(), 'progress.stage': 'running', 'progress.percent': 1 },
        createdBy,
      });
      if (!claimed) {
        const fresh = await discoveryRepository.getSessionById(sessionId, { createdBy });
        if (!fresh || fresh.cancelRequested || fresh.status === STATUS.CANCELLED) {
          emitDiscoveryCompleted(sessionId, { sessionId, status: STATUS.CANCELLED });
          return { sessionId, status: STATUS.CANCELLED };
        }
      }

      const provider = getPlacesProvider();
      const keyword = session.keyword && String(session.keyword).trim() ? String(session.keyword).trim() : null;
      const maxResults = session.config?.maxResults ?? config.discovery.maxResults;
      const maxSearchRequests = session.config?.maxSearchRequests ?? config.discovery.maxSearchRequests;
      const concurrency = session.config?.concurrency ?? config.discovery.concurrency;

      // ── Plan coverage from the stored normalized polygon ──
      const plan = planCoverage({ type: 'polygon', geometry: session.area?.geometry }, {
        maxCoverageCells: session.config?.maxCoverageCells,
        maxSearchRequests,
      });
      const totalCells = plan.cells.length;

      await discoveryRepository.setSessionStatus(sessionId, STATUS.FETCHING, {
        set: { 'progress.stage': 'fetching', 'progress.searchesTotal': totalCells },
        createdBy,
      });
      emitDiscoveryProgress(sessionId, {
        sessionId, status: STATUS.FETCHING, stage: 'fetching', percent: 2,
        searchesCompleted: 0, searchesTotal: totalCells, resultsDiscovered: 0,
      });

      const state = {
        searchesUsed: 0,
        cellsCompleted: 0,
        cellErrors: 0,
        collected: 0,
        cancelled: false,
        budgetExhausted: false,
      };

      const reserveSearch = () => {
        if (state.searchesUsed >= maxSearchRequests) {
          state.budgetExhausted = true;
          return false;
        }
        state.searchesUsed += 1;
        return true;
      };

      // ── Per-cell fetch (one coverage circle; every selected business type) ──
      const processCell = async (cell) => {
        if (state.cancelled || state.budgetExhausted) return [];

        // Cooperative cancellation: re-check the flag between cells.
        try {
          const fresh = await discoveryRepository.getSessionById(sessionId, { createdBy });
          if (!fresh || fresh.cancelRequested) {
            state.cancelled = true;
            return [];
          }
        } catch { /* transient read error — keep going */ }

        const places = [];
        for (const businessType of session.businessTypes || []) {
          if (state.cancelled || state.budgetExhausted) break;

          let query;
          try {
            query = resolveProviderQuery(businessType.id, keyword);
          } catch (err) {
            if (err?.code === 'INVALID_BUSINESS_TYPE') continue;
            throw err;
          }

          try {
            if (query.includedType && !keyword) {
              if (!reserveSearch()) break;
              const { places: found } = await provider.searchNearby({
                center: cell.center,
                radiusMeters: cell.radiusMeters,
                includedTypes: [query.includedType],
                fieldProfile: 'DISCOVERY_MINIMAL',
              });
              discoverySearchesTotal.inc({ status: 'success' });
              places.push(...found);
              state.collected += found.length;
            } else {
              let pageToken;
              let pages = 0;
              do {
                if (state.collected >= maxResults) break;
                if (!reserveSearch()) break;
                const resp = await provider.searchText({
                  textQuery: query.textQuery,
                  includedType: query.includedType,
                  center: cell.center,
                  radiusMeters: cell.radiusMeters,
                  fieldProfile: 'DISCOVERY_MINIMAL',
                  pageToken,
                });
                discoverySearchesTotal.inc({ status: 'success' });
                places.push(...resp.places);
                state.collected += resp.places.length;
                pageToken = resp.nextPageToken;
                pages += 1;
              } while (pageToken && pages < MAX_TEXT_PAGES);
            }
          } catch (err) {
            discoverySearchesTotal.inc({ status: 'error' });
            // Not-configured would fail every call → fatal for the whole run.
            if (err?.code === ERROR_CODES.DISCOVERY_NOT_CONFIGURED) throw err;
            state.cellErrors += 1;
            logger.warn('Discovery cell search failed (continuing — partial)', {
              module: LOG_MODULE, action: 'process.cell', sessionId: String(sessionId),
              code: err?.code ?? null, retryable: err?.retryable ?? null,
            });
            // Continue to the next business type → partial coverage, not a failure.
          }
        }

        state.cellsCompleted += 1;
        const percent = Math.min(80, 2 + Math.round((state.cellsCompleted / Math.max(1, totalCells)) * 78));
        await discoveryRepository.updateSessionProgress(sessionId, {
          progress: {
            stage: 'fetching',
            percent,
            searchesCompleted: state.cellsCompleted,
            searchesTotal: totalCells,
            resultsDiscovered: state.collected,
            errors: state.cellErrors,
          },
          usage: { searchRequests: state.searchesUsed },
        }, { createdBy });
        emitDiscoveryProgress(sessionId, {
          sessionId, status: STATUS.FETCHING, stage: 'fetching', percent,
          searchesCompleted: state.cellsCompleted, searchesTotal: totalCells,
          resultsDiscovered: state.collected, errors: state.cellErrors,
        });
        return places;
      };

      const cellResults = await runWithConcurrency(plan.cells, concurrency, processCell);

      // ── Merge + dedupe (raw places) ──
      await discoveryRepository.setSessionStatus(sessionId, STATUS.DEDUPLICATING, {
        set: { 'progress.stage': 'deduplicating', 'progress.percent': 82 }, createdBy,
      });
      const uniqueRaw = mergeCellResults(cellResults);

      // ── Normalize each unique place ──
      await discoveryRepository.setSessionStatus(sessionId, STATUS.NORMALIZING, {
        set: { 'progress.stage': 'normalizing', 'progress.percent': 85 }, createdBy,
      });
      const normalized = uniqueRaw
        .map((raw) => {
          const business = normalizeBusiness(raw);
          const placeId = raw?.id ?? raw?.placeId ?? business?.provider?.placeId ?? null;
          return { business, placeId };
        })
        .filter((entry) => entry.placeId); // placeId is required to upsert

      // ── In-area geometry filter ──
      const polygon = plan.polygon;
      const inArea = normalized.filter((entry) =>
        entry.business?.location
        && Array.isArray(entry.business.location.coordinates)
        && pointInPolygon(entry.business.location.coordinates, polygon));

      // ── CRM matching (batched) ──
      await discoveryRepository.setSessionStatus(sessionId, STATUS.MATCHING, {
        set: { 'progress.stage': 'matching', 'progress.percent': 88 }, createdBy,
      });
      let matches = [];
      if (inArea.length) {
        matches = await crmMatcher.classifyBatch(
          inArea.map((entry) => entry.business),
          { placeIds: inArea.map((entry) => entry.placeId) },
        );
      }

      // ── Build + persist discovery results ──
      const discoveredAt = new Date();
      const businessTypeIds = (session.businessTypes || []).map((bt) => bt.id).filter(Boolean);
      const docs = inArea.map((entry, i) => {
        const match = matches[i] || { status: RESULT_MATCHING_STATUS.NEW, matchedBy: [] };
        return {
          createdBy,
          discoverySessionId: sessionId,
          provider: { name: 'google_places', placeId: entry.placeId },
          business: entry.business,
          matching: {
            status: match.status || RESULT_MATCHING_STATUS.NEW,
            matchedLeadId: match.matchedLeadId ?? null,
            matchedCustomerId: match.matchedCustomerId ?? null,
            matchedBy: match.matchedBy ?? [],
          },
          import: { status: RESULT_IMPORT_STATUS.NOT_IMPORTED },
          discoveryContext: {
            businessTypeIds,
            keyword,
            areaType: session.area?.type ?? null,
          },
          discoveredAt,
        };
      });

      let persisted = 0;
      for (let i = 0; i < docs.length; i += PERSIST_BATCH) {
        const batch = docs.slice(i, i + PERSIST_BATCH);
        const res = await discoveryRepository.bulkUpsertResults(batch);
        persisted += (res?.upsertedCount || 0) + (res?.modifiedCount || 0) + (res?.insertedCount || 0);
        emitDiscoveryResult(sessionId, {
          sessionId,
          batch: batch.length,
          discovered: Math.min(i + batch.length, docs.length),
        });
      }

      // ── Finalize ──
      const counts = await discoveryRepository.countsForSession(sessionId, { createdBy });
      const finalStatus = state.cancelled
        ? STATUS.CANCELLED
        : (state.cellErrors > 0 || state.budgetExhausted || plan.truncated)
          ? STATUS.PARTIAL
          : STATUS.COMPLETED;

      await discoveryRepository.updateSessionProgress(sessionId, {
        progress: {
          stage: finalStatus === STATUS.CANCELLED ? 'cancelled' : 'completed',
          percent: 100,
          searchesCompleted: state.cellsCompleted,
          searchesTotal: totalCells,
          resultsDiscovered: state.collected,
          resultsPersisted: persisted,
          errors: state.cellErrors,
        },
        counts: {
          discovered: counts.discovered,
          new: counts.new,
          existing: counts.existing,
          possibleDuplicates: counts.possibleDuplicates,
          imported: counts.imported,
          skipped: counts.skipped,
          failed: counts.failed,
        },
        usage: { searchRequests: state.searchesUsed },
      }, { createdBy });

      await discoveryRepository.setSessionStatus(sessionId, finalStatus, {
        set: { completedAt: new Date() }, createdBy,
      });

      discoveryResultsDiscoveredTotal.inc(docs.length);
      discoveryRunDuration.observe((Date.now() - startTime) / 1000);

      emitDiscoveryCompleted(sessionId, {
        sessionId,
        status: finalStatus,
        counts: {
          discovered: counts.discovered,
          new: counts.new,
          existing: counts.existing,
          possibleDuplicates: counts.possibleDuplicates,
        },
        coverage: {
          truncated: finalStatus === STATUS.PARTIAL,
          searchesCompleted: state.cellsCompleted,
          searchesTotal: totalCells,
        },
      });

      await auditService.logEvent({
        eventType: 'discovery.session.completed',
        userId: createdBy,
        result: 'success',
        details: {
          sessionId: String(sessionId),
          status: finalStatus,
          discovered: counts.discovered,
          searchRequests: state.searchesUsed,
          errors: state.cellErrors,
        },
        module: 'discovery',
      });

      // Optional in-app notification (best-effort; never breaks the run).
      if (finalStatus === STATUS.COMPLETED || finalStatus === STATUS.PARTIAL) {
        try {
          const { default: notificationService } = await import('../modules/notifications/notification.service.js');
          await notificationService.create({
            type: 'discovery.completed',
            category: 'CRM',
            priority: 'NORMAL',
            sourceModule: 'discovery',
            sourceEvent: 'discovery.session.completed',
            sourceEntityType: 'DiscoverySession',
            sourceEntityId: sessionId,
            channels: ['IN_APP'],
            recipientIds: [createdBy],
            payload: {
              title: 'Business discovery finished',
              body: `${counts.discovered} business(es) found — ${counts.new} new.`,
              deepLink: `/lead-generation?session=${sessionId}`,
            },
          }, createdBy);
        } catch (err) {
          logger.debug('Discovery completion notification skipped', {
            module: LOG_MODULE, action: 'process.notify', error: { message: err.message },
          });
        }
      }

      logger.info('Discovery run finished', {
        module: LOG_MODULE,
        action: 'process',
        sessionId: String(sessionId),
        status: finalStatus,
        discovered: counts.discovered,
        persisted,
        searchRequests: state.searchesUsed,
      });

      return { sessionId, status: finalStatus, discovered: counts.discovered, persisted };
    } catch (err) {
      const code = err?.code || ERROR_CODES.DISCOVERY_PROVIDER_ERROR;
      const retryable = err?.retryable ?? false;

      await discoveryRepository.setSessionStatus(sessionId, STATUS.FAILED, {
        set: {
          completedAt: new Date(),
          error: { code, message: err?.message || 'Discovery run failed', retryable },
        },
        createdBy,
      });

      try {
        emitDiscoveryCompleted(sessionId, {
          sessionId, status: STATUS.FAILED, error: { code, message: err?.message, retryable },
        });
      } catch { /* socket best-effort */ }

      logger.error('Discovery run failed', {
        module: LOG_MODULE,
        action: 'process',
        sessionId: String(sessionId),
        code,
        retryable,
        error: { message: err?.message, stack: err?.stack },
      });

      throw err; // let BullMQ apply its retry policy
    }
  }
}

export default DiscoveryRunWorker;
