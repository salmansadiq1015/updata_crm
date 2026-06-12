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
  departmentId: 'objectId',
};

const ALLOWED_SORT_FIELDS = [
  'createdAt', 'invoiceNumber', 'customerName', 'grandTotalRounded', 'dueDate', '_id',
];

const POPULATE_FIELDS = [
  { path: 'customerId', select: 'customerNumber name' },
  { path: 'contactId', select: 'firstName lastName email' },
  { path: 'projectId', select: 'projectNumber name' },
  { path: 'sourceOrderId', select: 'orderNumber' },
  { path: 'createdBy', select: 'firstName lastName' },
  { path: 'pdfDocumentId', select: 'fileName filePath fileHash createdAt' },
];

function coerceCursorFieldTypes(filter, sortBy) {
  if (!filter || !['dueDate', 'createdAt'].includes(sortBy)) return filter;
  const coerceValue = (value) => (typeof value === 'string' ? new Date(value) : value);

  if (filter.$or) {
    return {
      ...filter,
      $or: filter.$or.map((clause) => {
        if (!clause[sortBy]) return clause;
        if (typeof clause[sortBy] === 'object' && clause[sortBy] !== null) {
          const op = Object.keys(clause[sortBy])[0];
          return { ...clause, [sortBy]: { [op]: coerceValue(clause[sortBy][op]) } };
        }
        return { ...clause, [sortBy]: coerceValue(clause[sortBy]) };
      }),
    };
  }

  if (filter[sortBy] && typeof filter[sortBy] === 'object') {
    const op = Object.keys(filter[sortBy])[0];
    return { ...filter, [sortBy]: { [op]: coerceValue(filter[sortBy][op]) } };
  }

  return filter;
}

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
    const safeSortBy = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt';
    const {
      dateFrom, dateTo, amountMin, amountMax, ...baseFilters
    } = filters;
    const filter = {
      ...buildFilter(baseFilters, ALLOWED_FILTERS),
      ...coerceCursorFieldTypes(buildCursorQuery(cursor, safeSortBy, sortOrder), safeSortBy),
    };

    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
    }
    if (amountMin !== undefined || amountMax !== undefined) {
      filter.grandTotalRounded = {};
      if (amountMin !== undefined) filter.grandTotalRounded.$gte = Number(amountMin);
      if (amountMax !== undefined) filter.grandTotalRounded.$lte = Number(amountMax);
    }

    if (search) {
      filter.$or = [
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
      ];
    }

    const sort = buildCursorSort(safeSortBy, sortOrder);

    const docs = await Invoice.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .populate(POPULATE_FIELDS)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, safeSortBy);
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
