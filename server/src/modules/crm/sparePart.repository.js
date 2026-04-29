import SparePart from './sparePart.model.js';
import InstallationSparePart from './installationSparePart.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

const ALLOWED_FILTERS = {
  category: 'exact',
  isActive: 'boolean',
  supplierId: 'exact',
  manufacturer: 'exact',
};

class SparePartRepository {
  // --- Spare Part CRUD ---

  async create(data) {
    const sparePart = new SparePart(data);
    return sparePart.save();
  }

  async findById(id) {
    return SparePart.findById(id)
      .populate({ path: 'supplierId', select: 'name customerNumber' })
      .lean();
  }

  async findByIds(ids) {
    return SparePart.find({ _id: { $in: ids } }).lean();
  }

  async updateById(id, data) {
    return SparePart.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    }).lean();
  }

  async softDelete(id) {
    return SparePart.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { new: true },
    );
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {}, search }) {
    const filter = {
      ...buildFilter(filters, ALLOWED_FILTERS),
      ...buildCursorQuery(cursor, sortBy, sortOrder),
    };

    if (search) {
      filter.$or = [
        { partNumber: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
        { manufacturer: { $regex: search, $options: 'i' } },
      ];
    }

    const sort = buildCursorSort(sortBy, sortOrder);

    const docs = await SparePart.find(filter)
      .populate({ path: 'supplierId', select: 'name customerNumber' })
      .sort(sort)
      .limit(limit + 1)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, sortBy);
  }

  async textSearch(term, limit = 20) {
    return SparePart.find(
      { $text: { $search: term } },
      { score: { $meta: 'textScore' } },
    )
      .sort({ score: { $meta: 'textScore' } })
      .limit(limit)
      .select('-__v')
      .lean();
  }

  async countByCategory() {
    return SparePart.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
  }

  // --- Installation ↔ SparePart junction ---

  async findByInstallationId(installationId) {
    return InstallationSparePart.find({ installationId })
      .populate({ path: 'sparePartId', select: 'partNumber name manufacturer category unitPrice currency unit currentStock' })
      .sort({ createdAt: -1 })
      .lean();
  }

  async linkToInstallation(data) {
    const link = new InstallationSparePart(data);
    return link.save();
  }

  async unlinkFromInstallation(installationId, sparePartId) {
    return InstallationSparePart.findOneAndDelete({ installationId, sparePartId });
  }

  async countByInstallation(installationId) {
    return InstallationSparePart.countDocuments({ installationId });
  }
}

const sparePartRepository = new SparePartRepository();
export default sparePartRepository;
