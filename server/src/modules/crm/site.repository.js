import Site from './site.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

const ALLOWED_FILTERS = {
  status: 'exact',
  siteType: 'exact',
  canton: 'exact',
  postalCode: 'exact',
  customerId: 'exact',
};

class SiteRepository {
  async create(data) {
    const site = new Site(data);
    return site.save();
  }

  async findById(id) {
    return Site.findById(id).lean();
  }

  async findByCustomerId(customerId) {
    return Site.find({ customerId })
      .sort({ siteNumber: 1 })
      .lean();
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {}, search }) {
    const filter = {
      ...buildFilter(filters, ALLOWED_FILTERS),
      ...buildCursorQuery(cursor, sortBy, sortOrder),
    };

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { siteNumber: { $regex: search, $options: 'i' } },
        { city: { $regex: search, $options: 'i' } },
        { street: { $regex: search, $options: 'i' } },
      ];
    }

    const sort = buildCursorSort(sortBy, sortOrder);

    const docs = await Site.find(filter)
      .populate({ path: 'customerId', select: 'customerNumber name' })
      .sort(sort)
      .limit(limit + 1)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, sortBy);
  }

  async updateById(id, data) {
    return Site.findByIdAndUpdate(id, data, {
      returnDocument: 'after',
      runValidators: true,
    }).lean();
  }

  async softDelete(id) {
    return Site.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { returnDocument: 'after' },
    );
  }

  async countByCustomer(customerId) {
    return Site.countDocuments({ customerId, isDeleted: false });
  }

  async countAll() {
    return Site.countDocuments({ isDeleted: false });
  }
}

const siteRepository = new SiteRepository();
export default siteRepository;
