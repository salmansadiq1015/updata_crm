import ApInvoice from './apInvoice.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

const ALLOWED_FILTERS = {
  status: 'exact',
  supplierId: 'objectId',
  dueDateFrom: 'dateFrom',
  dueDateTo: 'dateTo',
};

const ALLOWED_SORT_FIELDS = ['createdAt', 'dueDate', 'totalAmount', 'apInvoiceNumber', '_id'];

const POPULATE_FIELDS = [
  { path: 'approvedBy', select: 'firstName lastName email' },
  { path: 'secondApproverId', select: 'firstName lastName email' },
  { path: 'documentId', select: 'fileName filePath' },
];

class ApInvoiceRepository {
  async create(data) {
    const invoice = new ApInvoice(data);
    return invoice.save();
  }

  async findById(id) {
    return ApInvoice.findById(id)
      .populate(POPULATE_FIELDS)
      .populate({ path: 'lineItems.accountId', select: 'accountNumber name' })
      .lean();
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {} }) {
    const mappedFilters = {};
    if (filters.status) mappedFilters.status = filters.status;
    if (filters.supplierId) mappedFilters.supplierId = filters.supplierId;
    if (filters.dueDateFrom) mappedFilters.dueDateFrom = filters.dueDateFrom;
    if (filters.dueDateTo) mappedFilters.dueDateTo = filters.dueDateTo;

    const filter = {
      ...buildFilter(mappedFilters, ALLOWED_FILTERS),
      ...buildCursorQuery(cursor, sortBy, sortOrder),
    };

    // Remap dateFrom/dateTo to dueDate field
    if (filter.dueDateFrom || filter.dueDateTo) {
      filter.dueDate = {};
      if (filter.dueDateFrom) {
        filter.dueDate.$gte = filter.dueDateFrom.$gte || filter.dueDateFrom;
        delete filter.dueDateFrom;
      }
      if (filter.dueDateTo) {
        filter.dueDate.$lte = filter.dueDateTo.$lte || filter.dueDateTo;
        delete filter.dueDateTo;
      }
    }

    const sort = buildCursorSort(sortBy, sortOrder);

    const docs = await ApInvoice.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .populate(POPULATE_FIELDS)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, sortBy);
  }

  async findBySupplierAndNumber(supplierId, invoiceNumber) {
    return ApInvoice.findOne({
      supplierId,
      supplierInvoiceNumber: invoiceNumber,
    }).lean();
  }

  async updateById(id, data) {
    return ApInvoice.findByIdAndUpdate(
      id,
      { ...data, $inc: { version: 1 } },
      { returnDocument: 'after', runValidators: true },
    )
      .populate(POPULATE_FIELDS)
      .lean();
  }

  async softDelete(id) {
    return ApInvoice.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { returnDocument: 'after' },
    );
  }

  async findOpenPayables({ cursor, limit = 25, sortBy = 'dueDate', sortOrder = 'asc' } = {}) {
    const filter = {
      status: { $in: ['RECORDED', 'APPROVED', 'PARTIALLY_PAID'] },
      isDeleted: false,
      ...buildCursorQuery(cursor, sortBy, sortOrder),
    };

    const sort = buildCursorSort(sortBy, sortOrder);

    const docs = await ApInvoice.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .populate(POPULATE_FIELDS)
      .select('-__v')
      .lean()
      .setOptions({ includeDeleted: true });

    return buildCursorResponse(docs, limit, sortBy);
  }

  async findForPaymentBatch(dueDateFrom, dueDateTo) {
    const filter = {
      status: 'APPROVED',
      isDeleted: false,
      dueDate: {},
    };
    if (dueDateFrom) filter.dueDate.$gte = new Date(dueDateFrom);
    if (dueDateTo) filter.dueDate.$lte = new Date(dueDateTo);
    if (!dueDateFrom && !dueDateTo) delete filter.dueDate;

    return ApInvoice.find(filter)
      .populate(POPULATE_FIELDS)
      .select('-__v')
      .lean()
      .setOptions({ includeDeleted: true });
  }
}

const apInvoiceRepository = new ApInvoiceRepository();
export default apInvoiceRepository;
