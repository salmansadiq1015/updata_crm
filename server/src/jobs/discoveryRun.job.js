import { BaseWorker } from '../shared/queue/BaseWorker.js';
import config from '../config/index.js';
import logger from '../shared/logger/index.js';
import ERROR_CODES from '../shared/errors/errorCodes.js';
import {
  discoverySearchesTotal,
  discoveryResultsDiscoveredTotal,
  discoveryRunDuration,
} from '../metrics/index.js';
import { DISCOVERY_QUEUE_NAME } from '../modules/businessDiscovery/discovery.constants.js';

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

export class DiscoveryRunWorker extends BaseWorker {
  constructor() {
    super(DISCOVERY_QUEUE_NAME);
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
    const { runAdaptiveSearch } = await import('../modules/businessDiscovery/engine/adaptiveSearch.js');
    const { normalizeBusiness } = await import('../modules/businessDiscovery/engine/normalizer.js');
    const { pointInArea, haversineMeters } = await import('../modules/businessDiscovery/engine/geometry.js');
    const { default: crmMatcher } = await import('../modules/businessDiscovery/engine/crmMatcher.js');
    const { matchesProviderType } = await import('../modules/businessDiscovery/businessTypeCatalog.js');
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
      // New sessions deliberately store null: result coverage must not stop at
      // an application-defined request count. Only honor a finite value carried
      // by a legacy session that was created under the old budgeted behavior.
      const maxSearchRequests = Number.isFinite(session.config?.maxSearchRequests)
        ? session.config.maxSearchRequests
        : undefined;
      const concurrency = session.config?.concurrency ?? config.discovery.concurrency;
      const configuredInitialLimit = session.config?.initialResultLimit ?? config.discovery.initialResultLimit;
      const initialResultLimit = Number.isFinite(configuredInitialLimit) && configuredInitialLimit > 0
        ? Math.floor(configuredInitialLimit)
        : 300;

      // ── Plan coverage from the stored normalized polygon ──
      const plan = planCoverage({ type: 'polygon', geometry: session.area?.geometry }, {
        maxCoverageCells: session.config?.maxCoverageCells,
      });
      const initialRegions = plan.cells.length * Math.max(1, session.businessTypes?.length || 0);

      await discoveryRepository.setSessionStatus(sessionId, STATUS.FETCHING, {
        set: {
          'progress.stage': 'fetching',
          'progress.searchesTotal': initialRegions,
          'coverage.strategy': plan.strategy,
          'coverage.state': 'RUNNING',
          'coverage.providerGuaranteesCompleteness': false,
          'coverage.searchesTotal': initialRegions,
          'coverage.reasonCodes': ['PROVIDER_CATALOG_NOT_GUARANTEED'],
        },
        createdBy,
      });
      emitDiscoveryProgress(sessionId, {
        sessionId, status: STATUS.FETCHING, stage: 'fetching', percent: 2,
        searchesCompleted: 0, searchesTotal: initialRegions, resultsDiscovered: 0,
      });
      const centerCoordinates = session.location?.center?.coordinates;
      const exactArea = {
        type: session.area?.type,
        radiusMeters: session.area?.radiusMeters,
        bounds: session.area?.bounds,
        geometry: session.area?.geometry,
        center: Array.isArray(centerCoordinates)
          ? { lng: centerCoordinates[0], lat: centerCoordinates[1] }
          : null,
      };
      const businessTypeIds = (session.businessTypes || []).map((bt) => bt.id).filter(Boolean);
      const selectedLocation = {
        name: session.location?.name ?? null,
        mode: session.location?.mode ?? null,
        center: session.location?.center ?? null,
        placeId: session.location?.placeId ?? null,
        countryCode: session.location?.countryCode ?? null,
        country: session.location?.country ?? null,
        region: session.location?.region ?? null,
        city: session.location?.city ?? null,
        formattedAddress: session.location?.formattedAddress ?? null,
      };
      const selectedArea = {
        type: session.area?.type ?? null,
        radiusMeters: session.area?.radiusMeters ?? null,
        geometry: session.area?.geometry ?? null,
        bounds: session.area?.bounds ?? null,
        areaSqKm: session.area?.areaSqKm ?? null,
      };
      const selectedBusinessTypes = (session.businessTypes || []).map((businessType) => ({
        id: businessType.id,
        name: businessType.name ?? null,
        providerIncludedType: businessType.providerIncludedType ?? null,
        providerTextQuery: businessType.providerTextQuery ?? null,
      }));
      const seenPlaceIds = new Set();
      const inAreaPlaceIds = new Set();
      const seenPhones = new Set();
      const seenDomains = new Set();
      const seenNamesAndAddresses = new Set();
      const locationsByName = new Map();
      const liveCounts = { new: 0, existing: 0, possibleDuplicates: 0 };
      let persisted = 0;
      let duplicatesRemoved = 0;
      let resultLimitReached = false;

      const identityDuplicate = (business) => {
        const phone = business.normalizedPhone || null;
        const domain = business.websiteDomain || null;
        const name = business.normalizedName || null;
        const address = business.address?.formatted?.toLowerCase().replace(/\s+/g, ' ').trim() || null;
        const nameAddress = name && address ? `${name}|${address}` : null;
        const coords = business.location?.coordinates;

        if (phone && seenPhones.has(phone)) return true;
        if (domain && seenDomains.has(domain)) return true;
        if (nameAddress && seenNamesAndAddresses.has(nameAddress)) return true;
        if (name && Array.isArray(coords)) {
          const sameNameLocations = locationsByName.get(name) || [];
          if (sameNameLocations.some((location) => haversineMeters(coords, location) <= 30)) return true;
        }

        if (phone) seenPhones.add(phone);
        if (domain) seenDomains.add(domain);
        if (nameAddress) seenNamesAndAddresses.add(nameAddress);
        if (name && Array.isArray(coords)) {
          if (!locationsByName.has(name)) locationsByName.set(name, []);
          locationsByName.get(name).push(coords);
        }
        return false;
      };

      const persistPlaces = async (rawPlaces, context = {}) => {
        const normalized = [];
        for (const raw of rawPlaces) {
          if (inAreaPlaceIds.size >= initialResultLimit) {
            resultLimitReached = true;
            break;
          }
          const rawPlaceId = raw?.id ?? raw?.placeId ?? null;
          if (rawPlaceId && seenPlaceIds.has(String(rawPlaceId))) {
            duplicatesRemoved += 1;
            continue;
          }
          const business = normalizeBusiness(raw);
          const placeId = rawPlaceId ?? business?.provider?.placeId ?? null;
          if (!placeId) continue;
          const key = String(placeId);
          if (seenPlaceIds.has(key)) {
            duplicatesRemoved += 1;
            continue;
          }
          const coords = business?.location?.coordinates;
          if (!Array.isArray(coords) || !pointInArea(coords, exactArea)) continue;
          if (!matchesProviderType(business, context.query?.includedType)) continue;
          seenPlaceIds.add(key);
          if (identityDuplicate(business)) {
            duplicatesRemoved += 1;
            continue;
          }
          inAreaPlaceIds.add(key);
          normalized.push({ placeId, business });
          if (inAreaPlaceIds.size >= initialResultLimit) resultLimitReached = true;
        }
        if (!normalized.length) return;

        const matches = await crmMatcher.classifyBatch(
          normalized.map((entry) => entry.business),
          { placeIds: normalized.map((entry) => entry.placeId) },
        );
        const discoveredAt = new Date();
        const docs = normalized.map((entry, index) => {
          const match = matches[index] || { status: RESULT_MATCHING_STATUS.NEW, matchedBy: [] };
          if (match.status === RESULT_MATCHING_STATUS.EXISTING) liveCounts.existing += 1;
          else if (match.status === RESULT_MATCHING_STATUS.POSSIBLE_DUPLICATE) liveCounts.possibleDuplicates += 1;
          else liveCounts.new += 1;
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
            details: { fetchedAt: discoveredAt, source: 'google_places_search' },
            discoveryContext: {
              businessTypeIds,
              businessTypes: selectedBusinessTypes,
              matchedBusinessTypeId: context.businessType?.id ?? null,
              keyword,
              areaType: session.area?.type ?? null,
              location: selectedLocation,
              area: selectedArea,
              providerQuery: {
                includedType: context.query?.includedType ?? null,
                textQuery: context.query?.textQuery ?? null,
              },
              searchCoordinates: context.cell ? {
                cellId: context.cell.id ?? null,
                depth: context.cell.depth ?? 0,
                center: context.cell.center ?? null,
                radiusMeters: context.cell.radiusMeters ?? null,
                bounds: context.cell.bounds ?? null,
              } : null,
            },
            discoveredAt,
          };
        });

        for (let i = 0; i < docs.length; i += PERSIST_BATCH) {
          const batch = docs.slice(i, i + PERSIST_BATCH);
          const result = await discoveryRepository.bulkUpsertResults(batch);
          persisted += (result?.upsertedCount || 0) + (result?.modifiedCount || 0) + (result?.insertedCount || 0);
        }
        emitDiscoveryResult(sessionId, {
          sessionId,
          batch: docs.length,
          discovered: inAreaPlaceIds.size,
        });
      };

      const shouldStopSearch = () => resultLimitReached || inAreaPlaceIds.size >= initialResultLimit;

      let lastCancelCheck = 0;
      const isCancelled = async () => {
        if (Date.now() - lastCancelCheck < 1000) return false;
        lastCancelCheck = Date.now();
        try {
          const fresh = await discoveryRepository.getSessionById(sessionId, { createdBy });
          return !fresh || fresh.cancelRequested;
        } catch {
          return false;
        }
      };

      const state = await runAdaptiveSearch({
        provider,
        cells: plan.cells,
        businessTypes: session.businessTypes,
        keyword,
        maxSearchRequests,
        concurrency,
        isCancelled,
        shouldStop: shouldStopSearch,
        onBatch: persistPlaces,
        onRequest: (status, error) => {
          discoverySearchesTotal.inc({ status });
          if (status === 'error' && error?.code !== ERROR_CODES.DISCOVERY_NOT_CONFIGURED) {
            logger.warn('Discovery provider request failed; retrying when allowed', {
              module: LOG_MODULE, action: 'process.search', sessionId: String(sessionId),
              code: error?.code ?? null, retryable: error?.retryable ?? null,
            });
          }
        },
        onProgress: async (progress) => {
          const percent = Math.min(90, 2 + Math.round((progress.regionsCompleted / Math.max(1, progress.regionsTotal)) * 88));
          await discoveryRepository.updateSessionProgress(sessionId, {
            progress: {
              stage: 'fetching',
              percent,
              searchesCompleted: progress.regionsCompleted,
              searchesTotal: progress.regionsTotal,
              resultsDiscovered: inAreaPlaceIds.size,
              resultsPersisted: persisted,
              rawResults: progress.rawResults,
              duplicatesRemoved,
              errors: progress.errors,
            },
            counts: {
              discovered: inAreaPlaceIds.size,
              new: liveCounts.new,
              existing: liveCounts.existing,
              possibleDuplicates: liveCounts.possibleDuplicates,
            },
            usage: { searchRequests: progress.searchRequests },
            coverage: {
              state: 'RUNNING',
              searchesCompleted: progress.regionsCompleted,
              searchesTotal: progress.regionsTotal,
              saturatedRegions: progress.saturatedRegions,
              subdividedRegions: progress.subdividedRegions,
              unresolvedRegions: progress.unresolvedRegions,
            },
          }, { createdBy });
          emitDiscoveryProgress(sessionId, {
            sessionId, status: STATUS.FETCHING, stage: 'fetching', percent,
            searchesCompleted: progress.regionsCompleted,
            searchesTotal: progress.regionsTotal,
            resultsDiscovered: inAreaPlaceIds.size,
            resultsPersisted: persisted,
            duplicatesRemoved,
            errors: progress.errors,
          });
        },
      });

      await discoveryRepository.setSessionStatus(sessionId, STATUS.DEDUPLICATING, {
        set: { 'progress.stage': 'finalizing', 'progress.percent': 94 }, createdBy,
      });

      // ── Finalize ──
      const counts = await discoveryRepository.countsForSession(sessionId, { createdBy });
      const finalStatus = state.cancelled
        ? STATUS.CANCELLED
        : (state.errors > 0 || state.budgetExhausted || state.unresolvedSaturation || plan.truncated || state.stoppedEarly || resultLimitReached)
          ? STATUS.PARTIAL
          : STATUS.COMPLETED;
      const coverageReasonCodes = ['PROVIDER_CATALOG_NOT_GUARANTEED'];
      if (state.errors > 0) coverageReasonCodes.push('PROVIDER_REQUEST_ERRORS');
      if (state.budgetExhausted) coverageReasonCodes.push('LEGACY_REQUEST_BUDGET_EXHAUSTED');
      if (state.unresolvedSaturation) coverageReasonCodes.push('PROVIDER_RESULT_CAP_UNRESOLVED');
      if (plan.truncated) coverageReasonCodes.push('COVERAGE_PLAN_TRUNCATED');
      if (state.stoppedEarly || resultLimitReached) coverageReasonCodes.push('INITIAL_RESULT_LIMIT_REACHED');
      if (state.cancelled) coverageReasonCodes.push('CANCELLED_BY_USER');

      await discoveryRepository.updateSessionProgress(sessionId, {
        progress: {
          stage: finalStatus === STATUS.CANCELLED ? 'cancelled' : 'completed',
          percent: 100,
          searchesCompleted: state.regionsCompleted,
          searchesTotal: state.regionsTotal,
          resultsDiscovered: counts.discovered,
          resultsPersisted: persisted,
          rawResults: state.rawResults,
          duplicatesRemoved,
          errors: state.errors,
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
        usage: { searchRequests: state.searchRequests },
        coverage: {
          strategy: plan.strategy,
          state: state.cancelled ? 'CANCELLED' : finalStatus === STATUS.PARTIAL ? 'PARTIAL' : 'EXHAUSTED',
          providerGuaranteesCompleteness: false,
          searchesCompleted: state.regionsCompleted,
          searchesTotal: state.regionsTotal,
          saturatedRegions: state.saturatedRegions,
          subdividedRegions: state.subdividedRegions,
          unresolvedRegions: state.unresolvedRegions,
          reasonCodes: coverageReasonCodes,
        },
      }, { createdBy });

      await discoveryRepository.setSessionStatus(sessionId, finalStatus, {
        set: { completedAt: new Date() }, createdBy,
      });

      discoveryResultsDiscoveredTotal.inc(counts.discovered);
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
          state: state.cancelled ? 'CANCELLED' : finalStatus === STATUS.PARTIAL ? 'PARTIAL' : 'EXHAUSTED',
          truncated: finalStatus === STATUS.PARTIAL,
          providerGuaranteesCompleteness: false,
          searchesCompleted: state.regionsCompleted,
          searchesTotal: state.regionsTotal,
          saturatedRegions: state.saturatedRegions,
          subdividedRegions: state.subdividedRegions,
          unresolvedRegions: state.unresolvedRegions,
          reasonCodes: coverageReasonCodes,
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
          searchRequests: state.searchRequests,
          errors: state.errors,
          initialResultLimit,
          initialResultLimitReached: state.stoppedEarly || resultLimitReached,
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
        searchRequests: state.searchRequests,
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
