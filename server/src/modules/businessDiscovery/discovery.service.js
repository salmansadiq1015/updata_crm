/**
 * Discovery service for Business Discovery (Module 15).
 *
 * Orchestrates the "Analyze Area" lifecycle: validate + normalize the request,
 * persist a QUEUED session, enqueue the `discovery-run` worker, and expose the
 * read models (sessions, results, usage, business-type catalog) as flattened
 * client DTOs (design §3, §11, §12, §72).
 *
 * SCOPING: discovery sessions & results are PRIVATE to their creator. Every
 * repository read/write is scoped with `createdBy` (identity comes ONLY from
 * `req.user._id`, never from the body/query). The Google key never leaves the
 * provider layer and is never returned here.
 */

import mongoose from 'mongoose';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';
import eventBus from '../../shared/events/EventBus.js';
import queueManager from '../../shared/queue/QueueManager.js';
import auditService from '../auth/audit.service.js';
import discoveryRepository from './discovery.repository.js';
import DiscoverySession, { DISCOVERY_SESSION_STATUS } from './discoverySession.model.js';
import { normalizeArea } from './engine/geometry.js';
import {
  CATALOG,
  getType,
  resolveProviderQuery,
  sanitizeCustomType,
} from './businessTypeCatalog.js';
import { AppError } from '../../shared/errors/errors.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import { enrichResultWithDetails } from './engine/detailsEnricher.js';

const LOG_MODULE = 'businessDiscovery';
const QUEUE_NAME = 'discovery-run';
const JOB_NAME = 'discovery-run';

// Sane upper bound on the selectable area (design §7: never an unbounded area).
// Roughly the size of a small country — the coverage planner still caps the
// number of cells, this just rejects obviously-too-large selections up front.
const MAX_AREA_SQ_KM = 50000;

const TERMINAL_STATUSES = Object.freeze([
  DISCOVERY_SESSION_STATUS.COMPLETED,
  DISCOVERY_SESSION_STATUS.PARTIAL,
  DISCOVERY_SESSION_STATUS.FAILED,
  DISCOVERY_SESSION_STATUS.CANCELLED,
  DISCOVERY_SESSION_STATUS.EXPIRED,
]);

const NON_TERMINAL_STATUSES = Object.freeze([
  DISCOVERY_SESSION_STATUS.DRAFT,
  DISCOVERY_SESSION_STATUS.QUEUED,
  DISCOVERY_SESSION_STATUS.RUNNING,
  DISCOVERY_SESSION_STATUS.FETCHING,
  DISCOVERY_SESSION_STATUS.NORMALIZING,
  DISCOVERY_SESSION_STATUS.DEDUPLICATING,
  DISCOVERY_SESSION_STATUS.MATCHING,
]);

function toObjectId(id) {
  if (id instanceof mongoose.Types.ObjectId) return id;
  return new mongoose.Types.ObjectId(String(id));
}

function toTypeI18nKey(id) {
  return `leadgen.type.${String(id).replace(/-/g, '_')}`;
}

class DiscoveryService {
  /**
   * Create + enqueue a discovery run.
   *
   * @param {object} input - validated body { location, area, businessTypes, keyword?, options? }.
   * @param {string|import('mongoose').Types.ObjectId} createdBy - the acting user (req.user._id).
   * @param {object} [meta] - { ipAddress, userAgent } for the audit trail.
   * @returns {Promise<{ sessionId: string }>}
   */
  async createDiscovery(input, createdBy, meta = {}) {
    if (!createdBy) throw new AppError('A createdBy identity is required', 400, ERROR_CODES.VALIDATION_ERROR);

    // 1. Validate + normalize the area. Radius/circle areas take their centre
    //    from location.center (the area payload itself carries no centre).
    const areaInput = { ...input.area };
    const areaType = input.area?.type;
    if ((areaType === 'radius' || areaType === 'circle') && !areaInput.center) {
      areaInput.center = input.location?.center;
    }

    let normalized;
    try {
      normalized = normalizeArea(areaInput);
    } catch (err) {
      if (err?.code === 'INVALID_GEOMETRY') {
        throw new AppError(
          `Invalid discovery area: ${err.message}`,
          400,
          ERROR_CODES.DISCOVERY_INVALID_GEOMETRY,
        );
      }
      throw err;
    }

    if (normalized.areaSqKm > MAX_AREA_SQ_KM) {
      throw new AppError(
        `Selected area is too large (${Math.round(normalized.areaSqKm)} km²; max ${MAX_AREA_SQ_KM} km²)`,
        400,
        ERROR_CODES.DISCOVERY_AREA_TOO_LARGE,
      );
    }

    // 2. Resolve the selected business types → provider query hints.
    const businessTypes = this._resolveBusinessTypes(input.businessTypes, input.keyword);
    if (businessTypes.length === 0) {
      throw new AppError(
        'At least one valid business type is required',
        400,
        ERROR_CODES.DISCOVERY_UNSUPPORTED_BUSINESS_TYPE,
      );
    }

    // 3. Location sub-doc — centre stored as GeoJSON [lng, lat].
    const center = input.location?.center;
    const location = {
      name: input.location?.name ?? null,
      mode: input.location?.mode,
      center: center ? { type: 'Point', coordinates: [center.lng, center.lat] } : undefined,
    };

    // 4. Area sub-doc — the normalized polygon drives coverage + in-area filtering.
    const area = {
      type: areaType ?? null,
      radiusMeters: input.area?.radiusMeters ?? null,
      geometry: normalized.polygon,
      bounds: normalized.bounds,
      areaSqKm: normalized.areaSqKm,
    };

    // 5. Per-session cost / load guards (config defaults; options may tighten).
    const sessionConfig = {
      maxResults: input.options?.maxResults ?? config.discovery.maxResults,
      maxSearchRequests: input.options?.maxSearchRequests ?? config.discovery.maxSearchRequests,
      maxCoverageCells: config.discovery.maxCoverageCells,
      concurrency: config.discovery.concurrency,
      detailsOnImport: true,
    };

    const expiresAt = new Date(Date.now() + config.discovery.resultTtlDays * 24 * 60 * 60 * 1000);

    const session = await discoveryRepository.createSession({
      createdBy,
      status: DISCOVERY_SESSION_STATUS.QUEUED,
      location,
      area,
      businessTypes,
      keyword: input.keyword ? String(input.keyword).trim() || null : null,
      provider: { name: 'google_places' },
      config: sessionConfig,
      expiresAt,
    });

    const sessionId = String(session._id);

    // 6. Enqueue the worker (private identity travels in the job payload).
    await queueManager.addJob(QUEUE_NAME, `${JOB_NAME}-${sessionId}`, {
      sessionId,
      createdBy: String(createdBy),
    });

    eventBus.publish('discovery.session.created', {
      sessionId,
      createdBy: String(createdBy),
      areaType: area.type,
      businessTypeCount: businessTypes.length,
    }, { source: 'businessDiscovery:service' });

    auditService.logEvent({
      eventType: 'discovery.session.created',
      userId: createdBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { sessionId, areaType: area.type, areaSqKm: area.areaSqKm, businessTypeCount: businessTypes.length },
      module: 'discovery',
    });

    logger.info('Discovery session created and queued', {
      module: LOG_MODULE,
      action: 'createDiscovery',
      sessionId,
    });

    return { sessionId };
  }

  /** List the caller's sessions (cursor paginated), mapped to session DTOs. */
  async listSessions(createdBy, query = {}) {
    const result = await discoveryRepository.listSessions({
      cursor: query.cursor,
      limit: query.limit,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      filters: { status: query.status },
      search: query.q,
      createdBy,
    });
    return {
      data: (result.data || []).map((s) => this.toSessionDTO(s)),
      pagination: result.pagination,
    };
  }

  /** Get one session (scoped), or throw DISCOVERY_SESSION_NOT_FOUND. */
  async getSession(id, createdBy) {
    const session = await discoveryRepository.getSessionById(id, { createdBy });
    if (!session) {
      throw new AppError('Discovery session not found', 404, ERROR_CODES.DISCOVERY_SESSION_NOT_FOUND);
    }
    return this.toSessionDTO(session);
  }

  /**
   * Cancel a running/queued session. Sets `cancelRequested` (so an in-flight
   * worker stops between cells) and transitions to CANCELLED when still
   * non-terminal. No-ops (returns the current DTO) when already terminal.
   */
  async cancel(id, createdBy, meta = {}) {
    const session = await discoveryRepository.getSessionById(id, { createdBy });
    if (!session) {
      throw new AppError('Discovery session not found', 404, ERROR_CODES.DISCOVERY_SESSION_NOT_FOUND);
    }
    if (TERMINAL_STATUSES.includes(session.status)) {
      return this.toSessionDTO(session);
    }

    const updated = await discoveryRepository.setSessionStatus(id, DISCOVERY_SESSION_STATUS.CANCELLED, {
      expectedStatus: NON_TERMINAL_STATUSES,
      set: { cancelRequested: true, completedAt: new Date() },
      createdBy,
    });
    const fresh = updated || (await discoveryRepository.getSessionById(id, { createdBy }));

    auditService.logEvent({
      eventType: 'discovery.session.cancelled',
      userId: createdBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { sessionId: String(id) },
      module: 'discovery',
    });

    logger.info('Discovery session cancellation requested', {
      module: LOG_MODULE,
      action: 'cancel',
      sessionId: String(id),
    });

    return this.toSessionDTO(fresh);
  }

  /**
   * Soft-delete a session (scoped). Uses the guarded status setter to flip
   * `isDeleted` without otherwise changing the record's status.
   */
  async deleteSession(id, createdBy, meta = {}) {
    const session = await discoveryRepository.getSessionById(id, { createdBy });
    if (!session) {
      throw new AppError('Discovery session not found', 404, ERROR_CODES.DISCOVERY_SESSION_NOT_FOUND);
    }

    await discoveryRepository.setSessionStatus(id, session.status, {
      set: { isDeleted: true, deletedAt: new Date() },
      createdBy,
    });

    auditService.logEvent({
      eventType: 'discovery.session.deleted',
      userId: createdBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { sessionId: String(id) },
      module: 'discovery',
    });

    return { id: String(id), deleted: true };
  }

  /** List a session's results (cursor paginated), mapped to flattened result DTOs. */
  async listResults(sessionId, createdBy, query = {}) {
    const session = await discoveryRepository.getSessionById(sessionId, { createdBy });
    if (!session) {
      throw new AppError('Discovery session not found', 404, ERROR_CODES.DISCOVERY_SESSION_NOT_FOUND);
    }

    const result = await discoveryRepository.listResults(sessionId, {
      cursor: query.cursor,
      limit: query.limit,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      filters: {
        matchingStatus: query.matchingStatus,
        importStatus: query.importStatus,
        hasPhone: query.hasPhone,
        hasWebsite: query.hasWebsite,
        minRating: query.minRating,
      },
      createdBy,
    });

    return {
      data: (result.data || []).map((r) => this.toResultDTO(r)),
      pagination: result.pagination,
    };
  }

  /** Get one result (scoped), or throw DISCOVERY_RESULT_NOT_FOUND. */
  async getResult(resultId, createdBy) {
    const result = await discoveryRepository.getResultById(resultId, { createdBy });
    if (!result) {
      throw new AppError('Discovery result not found', 404, ERROR_CODES.DISCOVERY_RESULT_NOT_FOUND);
    }
    // Contact fields (phone / website / hours / price) are fetched lazily the
    // first time a result is opened, then cached on the doc so a second open is
    // free (design §6/§14 — details deferred to control Places cost). Best-effort:
    // if the fetch fails or discovery is unconfigured, the sweep-only DTO is returned.
    const { result: enriched } = await enrichResultWithDetails(result, {
      fieldProfile: 'DETAILS_STANDARD',
      createdBy,
    });
    return this.toResultDTO(enriched);
  }

  /**
   * Aggregate the caller's cumulative provider usage across all their sessions
   * (design §10 — cost visibility). Aggregation bypasses the soft-delete hook,
   * so isDeleted is matched explicitly.
   */
  async getUsage(createdBy) {
    const [row] = await DiscoverySession.aggregate([
      { $match: { createdBy: toObjectId(createdBy), isDeleted: false } },
      {
        $group: {
          _id: null,
          sessions: { $sum: 1 },
          searchRequests: { $sum: { $ifNull: ['$usage.searchRequests', 0] } },
          detailsRequests: { $sum: { $ifNull: ['$usage.detailsRequests', 0] } },
          geocodeRequests: { $sum: { $ifNull: ['$usage.geocodeRequests', 0] } },
          resultsDiscovered: { $sum: { $ifNull: ['$counts.discovered', 0] } },
          imported: { $sum: { $ifNull: ['$counts.imported', 0] } },
        },
      },
      { $project: { _id: 0 } },
    ]);

    return row || {
      sessions: 0,
      searchRequests: 0,
      detailsRequests: 0,
      geocodeRequests: 0,
      resultsDiscovered: 0,
      imported: 0,
    };
  }

  /** Static business-type catalog DTO for the picker (groups → types, i18n). */
  getBusinessTypes() {
    return CATALOG.map((group) => ({
      group: group.group,
      i18nKey: group.i18nKey,
      types: group.types.map((type) => ({
        id: type.id,
        name: type.name,
        icon: type.icon ?? null,
        i18nKey: toTypeI18nKey(type.id),
        ...(type.includedType ? { includedType: type.includedType } : {}),
        ...(type.textQuery ? { textQuery: type.textQuery } : {}),
      })),
    }));
  }

  // ─────────────────────────── DTOs ───────────────────────────

  /**
   * Flattened result DTO for the client (design §72). Stored GeoJSON [lng, lat]
   * is converted to { lat, lng }; no raw Mongo/provider internals leak out.
   */
  toResultDTO(result) {
    if (!result) return null;
    const business = result.business || {};
    const coords = Array.isArray(business.location?.coordinates) && business.location.coordinates.length >= 2
      ? business.location.coordinates
      : null;

    return {
      id: String(result._id),
      business: {
        name: business.name ?? null,
        type: business.primaryType ?? null,
        rating: business.rating ?? null,
        reviewCount: business.reviewCount ?? null,
        phone: business.phone ?? business.internationalPhone ?? null,
        website: business.website ?? null,
        email: business.email ?? null,
        address: business.address?.formatted ?? null,
        location: coords ? { lat: coords[1], lng: coords[0] } : null,
        mapsUrl: business.mapsUrl ?? null,
        openingHours: business.openingHours ?? null,
        priceLevel: business.priceLevel ?? null,
        businessStatus: business.businessStatus ?? null,
      },
      crmStatus: result.matching?.status ?? null,
      importStatus: result.import?.status ?? null,
      matchedLeadId: result.matching?.matchedLeadId ? String(result.matching.matchedLeadId) : null,
      discoveredAt: result.discoveredAt ?? null,
    };
  }

  /** Session DTO (progress / counts / coverage) for the history + progress views. */
  toSessionDTO(session) {
    if (!session) return null;
    const center = session.location?.center?.coordinates;
    const progress = session.progress || {};

    return {
      id: String(session._id),
      status: session.status,
      location: {
        name: session.location?.name ?? null,
        mode: session.location?.mode ?? null,
        center: Array.isArray(center) && center.length >= 2 ? { lat: center[1], lng: center[0] } : null,
        countryCode: session.location?.countryCode ?? null,
        country: session.location?.country ?? null,
        region: session.location?.region ?? null,
        city: session.location?.city ?? null,
        formattedAddress: session.location?.formattedAddress ?? null,
      },
      area: {
        type: session.area?.type ?? null,
        radiusMeters: session.area?.radiusMeters ?? null,
        geometry: session.area?.geometry ?? null,
        bounds: session.area?.bounds ?? null,
        areaSqKm: session.area?.areaSqKm ?? null,
      },
      businessTypes: session.businessTypes ?? [],
      keyword: session.keyword ?? null,
      progress,
      counts: session.counts ?? null,
      usage: session.usage ?? null,
      createdAt: session.createdAt ?? null,
      completedAt: session.completedAt ?? null,
      coverage: {
        // The session schema has no dedicated `truncated` flag, so incomplete
        // coverage (capped cells and/or failed cells) is surfaced via PARTIAL.
        truncated: session.status === DISCOVERY_SESSION_STATUS.PARTIAL,
        searchesCompleted: progress.searchesCompleted ?? 0,
        searchesTotal: progress.searchesTotal ?? 0,
      },
    };
  }

  // ─────────────────────────── internals ───────────────────────────

  /**
   * Resolve the selected business types (catalog ids or free-text custom types)
   * into the stored `{ id, name, providerIncludedType, providerTextQuery }`
   * shape. Custom types store the sanitized text as `id` so the worker can
   * re-resolve a provider query uniformly.
   */
  _resolveBusinessTypes(businessTypes = [], keyword) {
    const out = [];
    for (const entry of businessTypes) {
      const rawId = typeof entry === 'string' ? entry : entry?.id;
      const rawName = typeof entry === 'string' ? entry : entry?.name;
      if (!rawId && !rawName) continue;

      const catalogType = getType(rawId);
      try {
        if (catalogType) {
          const query = resolveProviderQuery(rawId, keyword);
          out.push({
            id: catalogType.id,
            name: rawName || catalogType.name,
            providerIncludedType: query.includedType || null,
            providerTextQuery: query.textQuery || null,
          });
          continue;
        }

        const custom = sanitizeCustomType(rawId || rawName);
        if (!custom) continue;
        const query = resolveProviderQuery(custom, keyword);
        out.push({
          id: custom,
          name: rawName || custom,
          providerIncludedType: query.includedType || null,
          providerTextQuery: query.textQuery || null,
        });
      } catch (err) {
        if (err?.code === 'INVALID_BUSINESS_TYPE') continue;
        throw err;
      }
    }
    return out;
  }
}

const discoveryService = new DiscoveryService();
export default discoveryService;
export { DiscoveryService };
