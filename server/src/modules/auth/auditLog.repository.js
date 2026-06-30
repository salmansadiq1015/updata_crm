import AuditLog from './auditLog.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';

/**
 * Audit log repository — INSERT + SELECT only.
 * No update or delete methods. Immutability enforced at application layer.
 */

const ALLOWED_SORT_FIELDS = ['timestamp', '_id'];

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildAuditFilter(filters = {}) {
  const filter = {};

  if (filters.userId) filter.userId = filters.userId;
  if (filters.eventType) filter.eventType = filters.eventType;
  if (filters.result) filter.result = filters.result;
  if (filters.module) filter.module = { $regex: escapeRegex(filters.module), $options: 'i' };
  if (filters.email) filter.email = { $regex: escapeRegex(filters.email), $options: 'i' };

  if (filters.startDate || filters.endDate) {
    filter.timestamp = {};
    if (filters.startDate) filter.timestamp.$gte = new Date(filters.startDate);
    if (filters.endDate) filter.timestamp.$lte = new Date(filters.endDate);
  }

  if (filters.search) {
    const search = { $regex: escapeRegex(filters.search), $options: 'i' };
    filter.$or = [
      { eventType: search },
      { email: search },
      { module: search },
      { ipAddress: search },
      { 'details.type': search },
      { 'details.category': search },
      { 'details.source': search },
      { 'details.email': search },
      { 'details.targetEmail': search },
      { 'details.targetUserEmail': search },
    ];
  }

  return filter;
}

class AuditLogRepository {
  async create(data) {
    const entry = new AuditLog(data);
    return entry.save();
  }

  /**
   * Cursor-paginated query with filters.
   */
  async findWithCursor({ cursor, limit = 25, sortBy = 'timestamp', sortOrder = 'desc', filters = {} }) {
    const safeSortBy = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : 'timestamp';
    const filter = buildAuditFilter(filters);
    const cursorFilter = buildCursorQuery(cursor, safeSortBy, sortOrder);
    for (const [key, value] of Object.entries(cursorFilter)) {
      if (key === 'timestamp' && filter.timestamp && typeof value === 'object') {
        filter.timestamp = { ...filter.timestamp, ...value };
      } else {
        filter[key] = value;
      }
    }

    const sort = buildCursorSort(safeSortBy, sortOrder);

    const docs = await AuditLog.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .lean();

    return buildCursorResponse(docs, limit, safeSortBy);
  }

  /**
   * Stream all matching records for export.
   * Returns a Mongoose cursor for memory-efficient streaming.
   */
  findForExport(filters = {}) {
    const filter = buildAuditFilter(filters);

    return AuditLog.find(filter).sort({ timestamp: -1 }).lean().cursor();
  }

  /**
   * Fetch audit entries for a specific entity, identified by a value stored
   * inside the Mixed `details` sub-document (e.g. details.actionId === <id>).
   *
   * @param {object} params
   * @param {string} params.module        - owning module (e.g. 'pm')
   * @param {string} params.detailsKey     - key inside details holding the id (e.g. 'actionId')
   * @param {string} params.entityId       - the entity id to match
   * @param {string} [params.eventTypePrefix] - optional eventType prefix filter (e.g. 'prep_action.')
   * @param {number} [params.limit=100]
   */
  async findByEntity({ module, detailsKey, entityId, eventTypePrefix, limit = 100 }) {
    // `details` is a Mixed sub-document, so the id may be stored as either an
    // ObjectId or a string depending on the caller. Match both candidates.
    const candidates = Array.isArray(entityId) ? entityId : [entityId];
    const filter = {
      module,
      [`details.${detailsKey}`]: { $in: candidates },
    };
    if (eventTypePrefix) {
      filter.eventType = { $regex: `^${eventTypePrefix}` };
    }
    return AuditLog.find(filter)
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();
  }

  async count(filters = {}) {
    const filter = {};
    if (filters.userId) filter.userId = filters.userId;
    if (filters.eventType) filter.eventType = filters.eventType;
    return AuditLog.countDocuments(filter);
  }
}

const auditLogRepository = new AuditLogRepository();
export default auditLogRepository;
