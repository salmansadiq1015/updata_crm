import Quotation from './quotation.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

const ALLOWED_FILTERS = {
  status: 'exact',
  customerId: 'objectId',
  departmentId: 'objectId',
  assignedUserId: 'objectId',
  currency: 'exact',
};

const ALLOWED_SORT_FIELDS = ['createdAt', 'quotationNumber', 'grandTotalRounded', 'validUntil', '_id'];

const POPULATE_FIELDS = [
  { path: 'customerId', select: 'customerNumber name' },
  { path: 'assignedUserId', select: 'firstName lastName' },
  { path: 'projectId', select: 'projectNumber name' },
];

class QuotationRepository {
  async create(data) {
    const quotation = new Quotation(data);
    return quotation.save();
  }

  async findById(id) {
    return Quotation.findById(id)
      .populate(POPULATE_FIELDS)
      .lean();
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {}, search }) {
    const filter = {
      ...buildFilter(filters, ALLOWED_FILTERS),
      ...buildCursorQuery(cursor, sortBy, sortOrder),
    };

    if (search) {
      filter.$or = [
        { quotationNumber: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
      ];
    }

    const sort = buildCursorSort(sortBy, sortOrder);

    const docs = await Quotation.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .populate(POPULATE_FIELDS)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, sortBy);
  }

  async textSearch(searchTerm, limit = 25) {
    return Quotation.find(
      { $text: { $search: searchTerm } },
      { score: { $meta: 'textScore' } },
    )
      .sort({ score: { $meta: 'textScore' } })
      .limit(limit)
      .populate(POPULATE_FIELDS)
      .select('-__v')
      .lean();
  }

  async updateById(id, data) {
    return Quotation.findByIdAndUpdate(
      id,
      { ...data, $inc: { version: 1 } },
      { returnDocument: 'after', runValidators: true },
    )
      .populate(POPULATE_FIELDS)
      .lean();
  }

  async softDelete(id) {
    return Quotation.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { returnDocument: 'after' },
    );
  }

  async findExpired() {
    return Quotation.find({
      status: { $in: ['SENT', 'VIEWED'] },
      validUntil: { $lt: new Date() },
      isDeleted: false,
    }).lean();
  }

  async countByStatus() {
    return Quotation.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $project: { _id: 0, status: '$_id', count: 1 } },
    ]);
  }

  async bulkUpdateCustomerName(customerId, newName) {
    const result = await Quotation.updateMany(
      { customerId, isDeleted: false },
      { $set: { customerName: newName } },
    );
    return result.modifiedCount;
  }
}

const quotationRepository = new QuotationRepository();
export default quotationRepository;
