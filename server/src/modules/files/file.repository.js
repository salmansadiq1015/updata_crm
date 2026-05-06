import FileMetadata from './file.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

/**
 * File metadata repository.
 * All database access for files goes through here.
 * No business logic — pure data access.
 */

// Whitelist of filterable fields
const ALLOWED_FILTERS = {
  module: 'exact',
  entityType: 'exact',
  entityId: 'objectId',
  bucket: 'exact',
  mimeType: 'exact',
  uploadedBy: 'objectId',
};

const ALLOWED_SORT_FIELDS = ['createdAt', 'originalName', 'sizeBytes', '_id'];

class FileRepository {
  async create(data) {
    const file = new FileMetadata(data);
    return file.save();
  }

  async findById(id) {
    return FileMetadata.findById(id).lean();
  }

  async findByKey(bucket, key) {
    return FileMetadata.findOne({ bucket, key }).lean();
  }

  /**
   * Cursor-paginated list with filters.
   * Uses lean() for performance (no Mongoose document overhead).
   */
  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {} }) {
    const filter = {
      ...buildFilter(filters, ALLOWED_FILTERS),
      ...buildCursorQuery(cursor, sortBy, sortOrder),
    };

    const sort = buildCursorSort(sortBy, sortOrder);

    // Fetch limit+1 to determine hasNext
    const docs = await FileMetadata.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, sortBy);
  }

  /**
   * Find all files for a specific entity (batch lookup for N+1 prevention).
   */
  async findByEntities(module, entityType, entityIds) {
    return FileMetadata.find({
      module,
      entityType,
      entityId: { $in: entityIds },
    })
      .select('-__v')
      .lean();
  }

  /**
   * Soft delete: set isDeleted flag.
   * Actual S3 deletion happens via cleanup job.
   */
  async softDelete(id) {
    return FileMetadata.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { returnDocument: 'after' },
    );
  }

  /**
   * Hard delete: remove from database (after S3 cleanup).
   */
  async hardDelete(id) {
    return FileMetadata.findByIdAndDelete(id);
  }

  /**
   * Find soft-deleted files past retention period (for cleanup job).
   */
  async findDeletedBefore(date, limit = 100) {
    return FileMetadata.find({
      isDeleted: true,
      deletedAt: { $lte: date },
    })
      .limit(limit)
      .setOptions({ includeDeleted: true })
      .lean();
  }

  /**
   * Count files by module (for stats).
   */
  async countByModule(module) {
    return FileMetadata.countDocuments({ module });
  }
}

const fileRepository = new FileRepository();
export default fileRepository;
