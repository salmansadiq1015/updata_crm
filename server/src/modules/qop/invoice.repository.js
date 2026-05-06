import Invoice from './invoice.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

const ALLOWED_FILTERS = {
  status: 'exact',
  invoiceType: 'exact',
  customerId: 'objectId',
  sourceOrderId: 'objectId',
  projectId: 'objectId',
};

const ALLOWED_SORT_FIELDS = ['createdAt', 'invoiceNumber', 'customerName', 'grandTotalRounded', 'dueDate', '_id'];

const POPULATE_FIELDS = [
  { path: 'customerId', select: 'customerNumber name' },
  { path: 'contactId', select: 'firstName lastName email' },
  { path: 'projectId', select: 'projectNumber name' },
  { path: 'sourceOrderId', select: 'orderNumber' },
  { path: 'createdBy', select: 'firstName lastName' },
];

class InvoiceRepository {
  async create(data) {
    const invoice = new Invoice(data);
    return invoice.save();
  }

  async findById(id) {
    return Invoice.findById(id)
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
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
      ];
    }

    const sort = buildCursorSort(sortBy, sortOrder);

    const docs = await Invoice.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .populate(POPULATE_FIELDS)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, sortBy);
  }

  async findByOrderId(orderId) {
    return Invoice.find({ sourceOrderId: orderId })
      .populate(POPULATE_FIELDS)
      .sort({ createdAt: -1 })
      .lean();
  }

  async findAdvancesByProject(projectId) {
    return Invoice.find({
      projectId,
      invoiceType: 'ADVANCE',
      status: { $ne: 'CANCELLED' },
    })
      .sort({ createdAt: 1 })
      .lean();
  }

  async findOverdue() {
    return Invoice.find({
      status: { $in: ['SENT', 'PARTIALLY_PAID'] },
      dueDate: { $lt: new Date() },
    })
      .populate(POPULATE_FIELDS)
      .sort({ dueDate: 1 })
      .lean();
  }

  async updateById(id, data) {
    return Invoice.findByIdAndUpdate(
      id,
      { ...data, $inc: { version: 1 } },
      { returnDocument: 'after', runValidators: true },
    )
      .populate(POPULATE_FIELDS)
      .lean();
  }

  async softDelete(id) {
    return Invoice.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { returnDocument: 'after' },
    );
  }

  async findAgingReport() {
    return Invoice.aggregate([
      {
        $match: {
          isDeleted: false,
          status: { $in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
        },
      },
      {
        $addFields: {
          daysOverdue: {
            $dateDiff: { startDate: '$dueDate', endDate: '$$NOW', unit: 'day' },
          },
        },
      },
      {
        $addFields: {
          bucket: {
            $switch: {
              branches: [
                { case: { $lte: ['$daysOverdue', 0] }, then: 'current' },
                { case: { $lte: ['$daysOverdue', 30] }, then: '1-30' },
                { case: { $lte: ['$daysOverdue', 60] }, then: '31-60' },
                { case: { $lte: ['$daysOverdue', 90] }, then: '61-90' },
              ],
              default: '90+',
            },
          },
        },
      },
      {
        $group: {
          _id: '$bucket',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amountDue' },
        },
      },
      {
        $project: {
          _id: 0,
          bucket: '$_id',
          count: 1,
          totalAmount: 1,
        },
      },
    ]);
  }
}

const invoiceRepository = new InvoiceRepository();
export default invoiceRepository;
