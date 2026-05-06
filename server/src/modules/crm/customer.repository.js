import Customer from './customer.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

const ALLOWED_FILTERS = {
  status: 'exact',
  type: 'exact',
  postalCode: 'exact',
  canton: 'exact',
  newsletterOptIn: 'boolean',
};

const ALLOWED_SORT_FIELDS = ['createdAt', 'name', 'customerNumber', '_id'];

class CustomerRepository {
  async create(data) {
    const customer = new Customer(data);
    return customer.save();
  }

  async findById(id) {
    return Customer.findById(id).lean();
  }

  async findByCustomerNumber(customerNumber) {
    return Customer.findOne({ customerNumber }).lean();
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {}, search }) {
    const filter = {
      ...buildFilter(filters, ALLOWED_FILTERS),
      ...buildCursorQuery(cursor, sortBy, sortOrder),
    };

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { customerNumber: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { city: { $regex: search, $options: 'i' } },
      ];
    }

    const sort = buildCursorSort(sortBy, sortOrder);

    const docs = await Customer.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, sortBy);
  }

  async findDuplicates(name, postalCode) {
    const filter = { name: { $regex: name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } };
    if (postalCode) filter.postalCode = postalCode;
    return Customer.find(filter)
      .select('_id customerNumber name postalCode city')
      .limit(5)
      .lean();
  }

  async textSearch(searchTerm, limit = 25) {
    return Customer.find(
      { $text: { $search: searchTerm } },
      { score: { $meta: 'textScore' } },
    )
      .sort({ score: { $meta: 'textScore' } })
      .limit(limit)
      .select('-__v')
      .lean();
  }

  async updateById(id, data) {
    return Customer.findByIdAndUpdate(id, data, {
      returnDocument: 'after',
      runValidators: true,
    }).lean();
  }

  async softDelete(id) {
    return Customer.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date(), status: 'archived' },
      { returnDocument: 'after' },
    );
  }

  async bulkUpdate(ids, data) {
    const result = await Customer.updateMany(
      { _id: { $in: ids }, isDeleted: false },
      { $set: data },
      { runValidators: true },
    );
    return result.modifiedCount;
  }

  async bulkSoftDelete(ids) {
    const result = await Customer.updateMany(
      { _id: { $in: ids }, isDeleted: false },
      { $set: { isDeleted: true, deletedAt: new Date(), status: 'archived' } },
    );
    return result.modifiedCount;
  }

  async findByIds(ids) {
    return Customer.find({ _id: { $in: ids }, isDeleted: false }).lean();
  }

  async countAll() {
    return Customer.countDocuments({ isDeleted: false });
  }
}

const customerRepository = new CustomerRepository();
export default customerRepository;
