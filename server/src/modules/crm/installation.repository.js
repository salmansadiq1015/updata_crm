import Installation from './installation.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

const ALLOWED_FILTERS = {
  status: 'exact',
  type: 'exact',
  fuelType: 'exact',
  siteId: 'exact',
  manufacturer: 'exact',
};

class InstallationRepository {
  async create(data) {
    const installation = new Installation(data);
    return installation.save();
  }

  async findById(id) {
    return Installation.findById(id).lean();
  }

  async findBySiteId(siteId) {
    return Installation.find({ siteId })
      .sort({ installationNumber: 1 })
      .lean();
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {}, search }) {
    const filter = {
      ...buildFilter(filters, ALLOWED_FILTERS),
      ...buildCursorQuery(cursor, sortBy, sortOrder),
    };

    if (search) {
      filter.$or = [
        { installationNumber: { $regex: search, $options: 'i' } },
        { manufacturer: { $regex: search, $options: 'i' } },
        { model: { $regex: search, $options: 'i' } },
        { serialNumber: { $regex: search, $options: 'i' } },
      ];
    }

    const sort = buildCursorSort(sortBy, sortOrder);

    const docs = await Installation.find(filter)
      .populate({ path: 'siteId', select: 'siteNumber name customerId city' })
      .sort(sort)
      .limit(limit + 1)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, sortBy);
  }

  async updateById(id, data) {
    return Installation.findByIdAndUpdate(id, data, {
      returnDocument: 'after',
      runValidators: true,
    }).lean();
  }

  async softDelete(id) {
    return Installation.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { returnDocument: 'after' },
    );
  }

  async countActiveBySiteId(siteId) {
    return Installation.countDocuments({
      siteId,
      status: 'active',
      isDeleted: false,
    });
  }
}

const installationRepository = new InstallationRepository();
export default installationRepository;
