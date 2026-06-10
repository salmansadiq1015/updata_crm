import FileFolder from './fileFolder.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

const ALLOWED_FILTERS = {
  classification: 'exact',
  entityType: 'exact',
  entityId: 'objectId',
  parentPath: 'exact',
};

class FileFolderRepository {
  async create(data) {
    const folder = new FileFolder(data);
    return folder.save();
  }

  async findById(id) {
    return FileFolder.findById(id).lean();
  }

  async findByPath(path) {
    return FileFolder.findOne({ path }).lean();
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {} }) {
    const { search, ...restFilters } = filters;
    const filter = {
      ...buildFilter(restFilters, ALLOWED_FILTERS),
      ...buildCursorQuery(cursor, sortBy, sortOrder),
    };
    const queryText = `${search || ''}`.trim();
    if (queryText) {
      const regex = new RegExp(escapeRegex(queryText), 'i');
      filter.$or = [
        { name: regex },
        { path: regex },
        { parentPath: regex },
        { classification: regex },
        { entityType: regex },
      ];
    }

    const docs = await FileFolder.find(filter)
      .sort(buildCursorSort(sortBy, sortOrder))
      .limit(limit + 1)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, sortBy);
  }

  async softDelete(id) {
    return FileFolder.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { returnDocument: 'after' },
    );
  }
}

function escapeRegex(value) {
  return `${value}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const fileFolderRepository = new FileFolderRepository();
export default fileFolderRepository;
