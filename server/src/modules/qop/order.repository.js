import Order from './order.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

const ALLOWED_FILTERS = {
  status: 'exact',
  customerId: 'objectId',
  projectId: 'objectId',
  sourceQuotationId: 'objectId',
};

const ALLOWED_SORT_FIELDS = ['createdAt', 'orderNumber', 'customerName', 'grandTotalRounded', '_id'];

const POPULATE_FIELDS = [
  { path: 'customerId', select: 'customerNumber name' },
  { path: 'contactId', select: 'firstName lastName email' },
  { path: 'projectId', select: 'projectNumber name' },
  { path: 'createdBy', select: 'firstName lastName' },
];

class OrderRepository {
  async create(data) {
    const order = new Order(data);
    return order.save();
  }

  async findById(id) {
    return Order.findById(id)
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
        { orderNumber: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
      ];
    }

    const sort = buildCursorSort(sortBy, sortOrder);

    const docs = await Order.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .populate(POPULATE_FIELDS)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, sortBy);
  }

  async findByQuotationId(quotationId) {
    return Order.find({ sourceQuotationId: quotationId })
      .populate(POPULATE_FIELDS)
      .lean();
  }

  async updateById(id, data) {
    return Order.findByIdAndUpdate(
      id,
      { ...data, $inc: { version: 1 } },
      { new: true, runValidators: true },
    )
      .populate(POPULATE_FIELDS)
      .lean();
  }

  async softDelete(id) {
    return Order.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { new: true },
    );
  }

  async addInvoiceId(orderId, invoiceId) {
    return Order.findByIdAndUpdate(
      orderId,
      { $push: { invoiceIds: invoiceId } },
      { new: true },
    ).lean();
  }
}

const orderRepository = new OrderRepository();
export default orderRepository;
