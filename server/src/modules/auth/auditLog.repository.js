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

class AuditLogRepository {
  async create(data) {
    const entry = new AuditLog(data);
    return entry.save();
  }

  /**
   * Cursor-paginated query with filters.
   */
  async findWithCursor({ cursor, limit = 25, sortBy = 'timestamp', sortOrder = 'desc', filters = {} }) {
    const filter = { ...buildCursorQuery(cursor, sortBy, sortOrder) };

    if (filters.userId) filter.userId = filters.userId;
    if (filters.eventType) filter.eventType = filters.eventType;
    if (filters.result) filter.result = filters.result;
    if (filters.module) filter.module = filters.module;
    if (filters.email) filter.email = { $regex: filters.email, $options: 'i' };

    // Date range on timestamp
    if (filters.startDate || filters.endDate) {
      filter.timestamp = filter.timestamp || {};
      if (filters.startDate) filter.timestamp.$gte = new Date(filters.startDate);
      if (filters.endDate) filter.timestamp.$lte = new Date(filters.endDate);
    }

    const sort = buildCursorSort(sortBy, sortOrder);

    const docs = await AuditLog.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .lean();

    return buildCursorResponse(docs, limit, sortBy);
  }

  /**
   * Stream all matching records for export.
   * Returns a Mongoose cursor for memory-efficient streaming.
   */
  findForExport(filters = {}) {
    const filter = {};

    if (filters.userId) filter.userId = filters.userId;
    if (filters.eventType) filter.eventType = filters.eventType;
    if (filters.result) filter.result = filters.result;
    if (filters.startDate || filters.endDate) {
      filter.timestamp = {};
      if (filters.startDate) filter.timestamp.$gte = new Date(filters.startDate);
      if (filters.endDate) filter.timestamp.$lte = new Date(filters.endDate);
    }

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
