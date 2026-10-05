import mongoose from 'mongoose';
import DiscoverySession from './discoverySession.model.js';
import DiscoveryResult, {
  RESULT_MATCHING_STATUS,
  RESULT_IMPORT_STATUS,
} from './discoveryResult.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
  encodeCursor,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

// Session list: filter + sort whitelists (tasks pattern — never trust client
// field names).
const SESSION_ALLOWED_FILTERS = { status: 'exact' };
const SESSION_ALLOWED_SORT_FIELDS = ['createdAt', 'updatedAt'];

// Result list: client sort keys mapped to the real (sometimes nested) paths.
const RESULT_SORT_MAP = {
  discoveredAt: 'discoveredAt',
  rating: 'business.rating',
  reviewCount: 'business.reviewCount',
  name: 'business.name',
  'business.name': 'business.name',
};
const RESULT_DEFAULT_SORT = 'discoveredAt';

function combineFilters(...filters) {
  const active = filters.filter((filter) => filter && Object.keys(filter).length > 0);
  if (active.length === 0) return {};
  if (active.length === 1) return active[0];
  return { $and: active };
}

function getNestedValue(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function toObjectId(id) {
  if (id instanceof mongoose.Types.ObjectId) return id;
  return new mongoose.Types.ObjectId(String(id));
}

class DiscoveryRepository {
  // --- Sessions ---

  async createSession(data) {
    const session = new DiscoverySession(data);
    return session.save();
  }

  async getSessionById(id, { createdBy } = {}) {
    const filter = { _id: id };
    if (createdBy) filter.createdBy = createdBy;
    return DiscoverySession.findOne(filter).lean();
  }

  async listSessions({
    cursor,
    limit = 25,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    filters = {},
    search,
    createdBy,
  } = {}) {
    const safeSortBy = SESSION_ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt';

    const baseFilter = {
      ...(createdBy ? { createdBy } : {}),
      ...buildFilter(filters, SESSION_ALLOWED_FILTERS),
    };

    let searchFilter = {};
    if (search) {
      const pattern = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = { $regex: pattern, $options: 'i' };
      searchFilter = {
        $or: [
          { 'location.name': regex },
          { 'location.city': regex },
          { 'location.formattedAddress': regex },
          { keyword: regex },
        ],
      };
    }

    const filter = combineFilters(
      baseFilter,
      searchFilter,
      buildCursorQuery(cursor, safeSortBy, sortOrder),
    );

    const docs = await DiscoverySession.find(filter)
      .sort(buildCursorSort(safeSortBy, sortOrder))
      .limit(limit + 1)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, safeSortBy);
  }

  /**
   * Merge progress / counts / usage into a session without clobbering sibling
   * fields (dot-path $set). Returns the updated doc, or null when there is
   * nothing to set / the scoped session does not exist.
   */
  async updateSessionProgress(id, { progress, counts, usage, coverage } = {}, { createdBy } = {}) {
    const set = {};
    if (progress) for (const [key, value] of Object.entries(progress)) set[`progress.${key}`] = value;
    if (counts) for (const [key, value] of Object.entries(counts)) set[`counts.${key}`] = value;
    if (usage) for (const [key, value] of Object.entries(usage)) set[`usage.${key}`] = value;
    if (coverage) for (const [key, value] of Object.entries(coverage)) set[`coverage.${key}`] = value;
    if (Object.keys(set).length === 0) return null;

    const filter = { _id: id };
    if (createdBy) filter.createdBy = createdBy;

    return DiscoverySession.findOneAndUpdate(
      filter,
      { $set: set },
      { returnDocument: 'after' },
    ).lean();
  }

  /**
   * Atomically bump a session's cumulative provider usage counters (e.g. a
   * details request made lazily on drawer-open / import). Uses $inc so concurrent
   * callers never clobber each other's counts. Returns the updated doc, or null.
   */
  async incrementSessionUsage(id, { searchRequests = 0, detailsRequests = 0, geocodeRequests = 0 } = {}, { createdBy } = {}) {
    const inc = {};
    if (searchRequests) inc['usage.searchRequests'] = searchRequests;
    if (detailsRequests) inc['usage.detailsRequests'] = detailsRequests;
    if (geocodeRequests) inc['usage.geocodeRequests'] = geocodeRequests;
    if (Object.keys(inc).length === 0) return null;

    const filter = { _id: id };
    if (createdBy) filter.createdBy = createdBy;

    return DiscoverySession.findOneAndUpdate(filter, { $inc: inc }, { returnDocument: 'after' }).lean();
  }

  /**
   * Set a session status, optionally only when it is currently in
   * `expectedStatus` (atomic claim / guarded transition). `set` carries
   * companion fields (startedAt, completedAt, error, cancelRequested, ...).
   * Returns the updated doc, or null when the guard did not match.
   */
  async setSessionStatus(id, status, { expectedStatus, set = {}, createdBy } = {}) {
    const filter = { _id: id };
    if (createdBy) filter.createdBy = createdBy;
    if (expectedStatus) {
      filter.status = Array.isArray(expectedStatus) ? { $in: expectedStatus } : expectedStatus;
    }

    return DiscoverySession.findOneAndUpdate(
      filter,
      { $set: { status, ...set } },
      { returnDocument: 'after' },
    ).lean();
  }

  // --- Results ---

  /**
   * Upsert discovered results by their in-session identity
   * {discoverySessionId, provider.placeId}. ordered:false so one bad row does
   * not abort the batch; createdBy/discoveredAt/import.status are seeded only on
   * insert so re-runs never duplicate rows nor revert import state.
   */
  async bulkUpsertResults(results = []) {
    if (!results.length) {
      return { upsertedCount: 0, modifiedCount: 0, matchedCount: 0, insertedIds: {} };
    }

    const operations = results.map((result) => {
      const {
        discoverySessionId,
        provider = {},
        createdBy,
        discoveredAt,
        import: _importState, // never clobber import state on re-upsert
        ...rest
      } = result;

      return {
        updateOne: {
          filter: { discoverySessionId, 'provider.placeId': provider.placeId },
          update: {
            $set: { ...rest, provider, discoverySessionId },
            $setOnInsert: {
              createdBy,
              discoveredAt: discoveredAt || new Date(),
              'import.status': RESULT_IMPORT_STATUS.NOT_IMPORTED,
            },
          },
          upsert: true,
        },
      };
    });

    return DiscoveryResult.bulkWrite(operations, { ordered: false });
  }

  async listResults(sessionId, {
    cursor,
    limit = 25,
    sortBy = RESULT_DEFAULT_SORT,
    sortOrder = 'desc',
    filters = {},
    search,
    createdBy,
  } = {}) {
    const safeSortBy = RESULT_SORT_MAP[sortBy] || RESULT_SORT_MAP[RESULT_DEFAULT_SORT];

    const {
      matchingStatus,
      importStatus,
      hasPhone,
      hasWebsite,
      minRating,
    } = filters;

    const baseFilter = { discoverySessionId: sessionId };
    if (createdBy) baseFilter.createdBy = createdBy;
    if (matchingStatus) baseFilter['matching.status'] = matchingStatus;
    if (importStatus) baseFilter['import.status'] = importStatus;
    if (hasPhone === true || hasPhone === 'true') baseFilter['business.normalizedPhone'] = { $nin: [null, ''] };
    if (hasWebsite === true || hasWebsite === 'true') baseFilter['business.websiteDomain'] = { $nin: [null, ''] };
    if (minRating !== undefined && minRating !== null && minRating !== '') {
      baseFilter['business.rating'] = { $gte: Number(minRating) };
    }

    let searchFilter = {};
    if (search) {
      const escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = { $regex: escaped, $options: 'i' };
      searchFilter = {
        $or: [{ 'business.name': regex }, { 'business.address.formatted': regex }],
      };
    }

    // Count the complete filtered dataset independently of the cursor. The
    // client keeps cursor pagination for stable/scalable reads, while this
    // total powers an honest "page X of Y" UI without loading every row.
    const datasetFilter = combineFilters(baseFilter, searchFilter);
    const filter = combineFilters(
      datasetFilter,
      buildCursorQuery(cursor, safeSortBy, sortOrder),
    );

    const [docs, total] = await Promise.all([
      DiscoveryResult.find(filter)
        .sort(buildCursorSort(safeSortBy, sortOrder))
        .limit(limit + 1)
        .select('-__v')
        .lean(),
      DiscoveryResult.countDocuments(datasetFilter),
    ]);

    // Nested sort paths (e.g. business.rating) are not reachable via the shared
    // buildCursorResponse (it reads doc[sortField]); encode the cursor from the
    // nested value so pagination tie-breaks stay correct.
    const hasNext = docs.length > limit;
    const data = hasNext ? docs.slice(0, limit) : docs;
    let nextCursor = null;
    if (hasNext && data.length > 0) {
      const last = data[data.length - 1];
      nextCursor = encodeCursor(
        { _id: last._id, [safeSortBy]: getNestedValue(last, safeSortBy) },
        safeSortBy,
      );
    }

    return { data, pagination: { hasNext, nextCursor, limit, total } };
  }

  async getResultById(id, { createdBy } = {}) {
    const filter = { _id: id };
    if (createdBy) filter.createdBy = createdBy;
    return DiscoveryResult.findOne(filter).lean();
  }

  /** Lightweight, independently paginated marker stream for the complete map. */
  async listResultMarkers(sessionId, { cursor, limit = 500, createdBy } = {}) {
    const baseFilter = { discoverySessionId: sessionId, 'business.location.coordinates.1': { $exists: true } };
    if (createdBy) baseFilter.createdBy = createdBy;
    const filter = combineFilters(baseFilter, buildCursorQuery(cursor, '_id', 'asc'));
    const docs = await DiscoveryResult.find(filter)
      .sort(buildCursorSort('_id', 'asc'))
      .limit(limit + 1)
      .select('_id business.location matching.status')
      .lean();
    const hasNext = docs.length > limit;
    const data = hasNext ? docs.slice(0, limit) : docs;
    const nextCursor = hasNext && data.length
      ? encodeCursor({ _id: data[data.length - 1]._id }, '_id')
      : null;
    return { data, pagination: { hasNext, nextCursor, limit } };
  }

  /**
   * Atomically claim/transition a result's import status. The import worker
   * claims work with expectedStatus:'NOT_IMPORTED' → nextStatus:'QUEUED'; only
   * one caller wins (others get null). `set` carries finalization fields
   * (import.leadId, import.importedAt, import.error, matching.*).
   */
  async updateResultImportStatus(id, nextStatus, { expectedStatus, set = {}, createdBy } = {}) {
    const filter = { _id: id };
    if (createdBy) filter.createdBy = createdBy;
    if (expectedStatus) {
      filter['import.status'] = Array.isArray(expectedStatus) ? { $in: expectedStatus } : expectedStatus;
    }

    return DiscoveryResult.findOneAndUpdate(
      filter,
      { $set: { 'import.status': nextStatus, ...set } },
      { returnDocument: 'after' },
    ).lean();
  }

  /**
   * Merge lazily-fetched Place Details (contact / hours / price) into a result's
   * `business` sub-doc via dot-path $set, and stamp `details.fetchedAt`. Scoped by
   * createdBy. Returns the updated doc, or null when the scoped result is gone.
   */
  async updateResultDetails(id, { set = {}, createdBy } = {}) {
    if (!set || Object.keys(set).length === 0) return null;
    const filter = { _id: id };
    if (createdBy) filter.createdBy = createdBy;
    return DiscoveryResult.findOneAndUpdate(filter, { $set: set }, { returnDocument: 'after' }).lean();
  }

  /**
   * Candidate results for an import run. SELECTED → the given ids; ALL_NEW →
   * results classified NEW. For 'new'/'skip' modes only not-yet-imported (or
   * previously failed) rows are returned; 'update' also re-imports existing.
   */
  async findResultsForImport(sessionId, { mode = 'new', resultIds, createdBy } = {}) {
    const filter = { discoverySessionId: sessionId };
    if (createdBy) filter.createdBy = createdBy;

    if (Array.isArray(resultIds) && resultIds.length > 0) {
      filter._id = { $in: resultIds };
    } else {
      filter['matching.status'] = RESULT_MATCHING_STATUS.NEW;
    }

    if (mode !== 'update') {
      filter['import.status'] = { $in: [RESULT_IMPORT_STATUS.NOT_IMPORTED, RESULT_IMPORT_STATUS.FAILED] };
    }

    return DiscoveryResult.find(filter).lean();
  }

  /**
   * One-pass aggregate of a session's result counts (matching + import
   * breakdown). Aggregation bypasses the soft-delete hook, so isDeleted is
   * matched explicitly.
   */
  async countsForSession(sessionId, { createdBy } = {}) {
    const match = { discoverySessionId: toObjectId(sessionId), isDeleted: false };
    if (createdBy) match.createdBy = toObjectId(createdBy);

    const [row] = await DiscoveryResult.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          discovered: { $sum: 1 },
          new: { $sum: { $cond: [{ $eq: ['$matching.status', RESULT_MATCHING_STATUS.NEW] }, 1, 0] } },
          existing: { $sum: { $cond: [{ $eq: ['$matching.status', RESULT_MATCHING_STATUS.EXISTING] }, 1, 0] } },
          possibleDuplicates: {
            $sum: { $cond: [{ $eq: ['$matching.status', RESULT_MATCHING_STATUS.POSSIBLE_DUPLICATE] }, 1, 0] },
          },
          imported: { $sum: { $cond: [{ $eq: ['$import.status', RESULT_IMPORT_STATUS.IMPORTED] }, 1, 0] } },
          skipped: { $sum: { $cond: [{ $eq: ['$import.status', RESULT_IMPORT_STATUS.SKIPPED] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$import.status', RESULT_IMPORT_STATUS.FAILED] }, 1, 0] } },
          queued: { $sum: { $cond: [{ $eq: ['$import.status', RESULT_IMPORT_STATUS.QUEUED] }, 1, 0] } },
          notImported: { $sum: { $cond: [{ $eq: ['$import.status', RESULT_IMPORT_STATUS.NOT_IMPORTED] }, 1, 0] } },
        },
      },
      { $project: { _id: 0 } },
    ]);

    return row || {
      discovered: 0,
      new: 0,
      existing: 0,
      possibleDuplicates: 0,
      imported: 0,
      skipped: 0,
      failed: 0,
      queued: 0,
      notImported: 0,
    };
  }
}

const discoveryRepository = new DiscoveryRepository();
export default discoveryRepository;
