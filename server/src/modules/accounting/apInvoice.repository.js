import { CURRENCIES } from '../../shared/data/currencies.js';
import mongoose from 'mongoose';
import ApInvoice from './apInvoice.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

const ALLOWED_FILTERS = {
  currency: 'exact',
  status: 'exact',
  supplierId: 'objectId',
  dueDateFrom: 'dateFrom',
  dueDateTo: 'dateTo',
};

const POPULATE_FIELDS = [
  { path: 'approvedBy', select: 'firstName lastName email' },
  { path: 'secondApproverId', select: 'firstName lastName email' },
  { path: 'documentId', select: 'fileName filePath' },
  { path: 'paymentBatchId', select: 'batchNumber status totalAmount' },
];

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

class ApInvoiceRepository {
  async create(data, options = {}) {
    const invoice = new ApInvoice(data);
    return invoice.save({ session: options.session });
  }

  async findById(id, options = {}) {
    return ApInvoice.findById(id)
      .session(options.session || null)
      .populate(POPULATE_FIELDS)
      .populate({ path: 'lineItems.accountId', select: 'accountNumber name' })
      .populate({ path: 'lineItems.allocations.accountId', select: 'accountNumber name' })
      .lean();
  }

  async findByIds(ids, options = {}) {
    return ApInvoice.find({ _id: { $in: ids } })
      .session(options.session || null)
      .populate(POPULATE_FIELDS)
      .select('-__v')
      .lean();
  }

  async findByPaymentBatchId(batchId, options = {}) {
    return ApInvoice.find({ paymentBatchId: batchId, isDeleted: false })
      .session(options.session || null)
      .sort({ dueDate: 1, _id: 1 })
      .select('-__v')
      .lean()
      .setOptions({ includeDeleted: true });
  }

  async findOpenForAutoMatch({ reference, amount, payeeName, currency }) {
    const openFilter = {
      ...(currency && { currency }),
      isDeleted: false,
      status: { $in: ['RECORDED', 'APPROVED', 'PARTIALLY_PAID'] },
      outstandingAmount: { $gt: 0 },
    };

    if (reference) {
      const referenceMatch = await ApInvoice.findOne({
        ...openFilter,
        outstandingAmount: { $gte: amount },
        $or: [
          { apInvoiceNumber: reference },
          { supplierInvoiceNumber: reference },
        ],
      })
        .sort({ dueDate: 1, _id: 1 })
        .lean()
        .setOptions({ includeDeleted: true });

      if (referenceMatch) return referenceMatch;
    }

    const exactAmountCandidates = await ApInvoice.find({
      ...openFilter,
      outstandingAmount: amount,
    })
      .sort({ dueDate: 1, _id: 1 })
      .limit(50)
      .lean()
      .setOptions({ includeDeleted: true });

    if (exactAmountCandidates.length === 1) return exactAmountCandidates[0];
    if (!payeeName || exactAmountCandidates.length === 0) return null;

    const payeeLower = payeeName.toLowerCase();
    const nameMatches = exactAmountCandidates.filter((invoice) => {
      const supplierName = (invoice.supplierName || '').toLowerCase();
      return supplierName && payeeLower.includes(supplierName);
    });

    return nameMatches.length === 1 ? nameMatches[0] : null;
  }

  async findSingleOpenBySupplierAndAmount({ supplierId, amount, currency }) {
    const filter = {
      supplierId,
      isDeleted: false,
      status: { $in: ['RECORDED', 'APPROVED', 'PARTIALLY_PAID'] },
      outstandingAmount: amount,
    };
    if (currency) filter.currency = currency;

    const candidates = await ApInvoice.find(filter)
      .sort({ dueDate: 1, _id: 1 })
      .limit(2)
      .lean()
      .setOptions({ includeDeleted: true });

    return candidates.length === 1 ? candidates[0] : null;
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {} }) {
    const mappedFilters = {};
    if (filters.currency) mappedFilters.currency = filters.currency;
    if (filters.status) mappedFilters.status = filters.status;
    if (filters.supplierId) mappedFilters.supplierId = filters.supplierId;
    if (filters.dueDateFrom) mappedFilters.dueDateFrom = filters.dueDateFrom;
    if (filters.dueDateTo) mappedFilters.dueDateTo = filters.dueDateTo;

    const filter = {
      ...buildFilter(mappedFilters, ALLOWED_FILTERS),
      ...coerceCursorFieldTypes(buildCursorQuery(cursor, sortBy, sortOrder), sortBy),
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

    if (filters.q) {
      const regex = new RegExp(escapeRegExp(filters.q), 'i');
      const searchFilter = {
        $or: [
          { apInvoiceNumber: regex },
          { supplierInvoiceNumber: regex },
          { supplierName: regex },
          { projectReference: regex },
          { orderReference: regex },
        ],
      };
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, searchFilter];
        delete filter.$or;
      } else {
        filter.$or = searchFilter.$or;
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

  async updateById(id, data, options = {}) {
    return ApInvoice.findByIdAndUpdate(
      id,
      { ...data, $inc: { version: 1 } },
      { returnDocument: 'after', runValidators: true, session: options.session },
    )
      .populate(POPULATE_FIELDS)
      .lean();
  }

  async reserveForPaymentBatch(invoiceIds, batchId, options = {}) {
    return ApInvoice.updateMany(
      {
        _id: { $in: invoiceIds },
        isDeleted: false,
        status: 'APPROVED',
        outstandingAmount: { $gt: 0 },
        paymentBatchId: null,
      },
      { $set: { paymentBatchId: batchId } },
      { session: options.session, updatePipeline: true },
    );
  }

  async applyPaymentDelta(id, amount, options = {}) {
    const invoiceId = typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id;
    const digits = { $switch: { branches: [0, 3, 4].map(unit => ({ case: { $in: ['$currency', CURRENCIES.filter(row => row.digits === unit).map(row => row.code)] }, then: unit })), default: 2 } };

    return ApInvoice.collection.updateOne(
      {
        _id: invoiceId,
        isDeleted: false,
        status: { $in: ['RECORDED', 'APPROVED', 'PARTIALLY_PAID'] },
        outstandingAmount: { $gte: amount },
      },
      [
        {
          $set: {
            paidAmount: { $round: [{ $add: ['$paidAmount', amount] }, digits] },
            outstandingAmount: { $round: [{ $subtract: ['$outstandingAmount', amount] }, digits] },
            status: {
              $cond: [
                { $lte: [{ $round: [{ $subtract: ['$outstandingAmount', amount] }, digits] }, 0] },
                'PAID',
                'PARTIALLY_PAID',
              ],
            },
            version: { $add: ['$version', 1] },
          },
        },
      ],
      { session: options.session },
    );
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
      outstandingAmount: { $gt: 0 },
      ...coerceCursorFieldTypes(buildCursorQuery(cursor, sortBy, sortOrder), sortBy),
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

  async findForCashForecast(dateFrom, dateTo, currency) {
    return ApInvoice.find({
      isDeleted: false,
      status: { $in: ['RECORDED', 'APPROVED', 'PARTIALLY_PAID'] },
      outstandingAmount: { $gt: 0 },
      currency,
      dueDate: { $gte: new Date(dateFrom), $lte: new Date(dateTo) },
    }).select('dueDate outstandingAmount totalAmount currency').lean();
  }

  async findForPaymentBatch(dueDateFrom, dueDateTo) {
    const filter = {
      status: 'APPROVED',
      isDeleted: false,
      outstandingAmount: { $gt: 0 },
      paymentBatchId: null,
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
