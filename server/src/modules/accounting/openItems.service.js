import mongoose from 'mongoose';
import journalEntryService from './journalEntry.service.js';
import accountMappingService, { ACCOUNT_MAPPING } from './accountMapping.service.js';
import logger from '../../shared/logger/index.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { AppError, ConflictError, NotFoundError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';

const OPEN_AR_STATUSES = ['SENT', 'PARTIALLY_PAID', 'OVERDUE'];
const OPEN_AP_STATUSES = ['RECORDED', 'APPROVED', 'PARTIALLY_PAID'];
const OPEN_ITEM_SORT_FIELDS = ['dueDate', 'outstandingAmount', 'createdAt', '_id'];
const BUCKET_KEYS = ['current', '1_30', '31_60', '61_90', '90_plus'];

function normalizeLimit(limit) {
  const parsed = Number(limit) || 25;
  return Math.min(Math.max(parsed, 1), 100);
}

function normalizeSort(sortBy) {
  return OPEN_ITEM_SORT_FIELDS.includes(sortBy) ? sortBy : 'dueDate';
}

function coerceCursorFieldTypes(filter, sortBy) {
  if (!filter || !['dueDate', 'createdAt'].includes(sortBy)) return filter;

  const coerceValue = (value) => {
    if (typeof value === 'string') return new Date(value);
    return value;
  };

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

function getAgingDateFilter(bucket, now = new Date()) {
  if (!bucket) return {};

  const day = 24 * 60 * 60 * 1000;
  const daysAgo = (days) => new Date(now.getTime() - days * day);

  if (bucket === 'current') return { dueDate: { $gte: now } };
  if (bucket === '1_30') return { dueDate: { $lt: now, $gte: daysAgo(30) } };
  if (bucket === '31_60') return { dueDate: { $lt: daysAgo(30), $gte: daysAgo(60) } };
  if (bucket === '61_90') return { dueDate: { $lt: daysAgo(60), $gte: daysAgo(90) } };
  if (bucket === '90_plus') return { dueDate: { $lt: daysAgo(90) } };
  return {};
}

function emptyBucketTotals() {
  return BUCKET_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});
}

function normalizeBucketTotals(rows) {
  const buckets = emptyBucketTotals();
  let invoiceCount = 0;

  for (const row of rows) {
    if (row?._id && Object.prototype.hasOwnProperty.call(buckets, row._id)) {
      buckets[row._id] = Math.round((row.totalOutstanding || 0) * 100) / 100;
      invoiceCount += row.count || 0;
    }
  }

  return {
    buckets: { ...buckets, over_90: buckets['90_plus'] },
    totalOutstanding: Math.round(Object.values(buckets).reduce((sum, value) => sum + value, 0) * 100) / 100,
    invoiceCount,
  };
}

function mapArInvoice(inv) {
  const amount = inv.grandTotalRounded ?? inv.grandTotal ?? inv.totalAmount ?? 0;
  const outstandingAmount = inv.amountDue ?? 0;

  return {
    _id: inv._id,
    type: 'AR',
    entityId: inv.customerId,
    entityName: inv.customerName,
    reference: inv.invoiceNumber,
    amount,
    outstandingAmount,
    dueDate: inv.dueDate,
    status: inv.status,
    createdAt: inv.createdAt,
  };
}

function mapApInvoice(inv) {
  return {
    _id: inv._id,
    type: 'AP',
    entityId: inv.supplierId,
    entityName: inv.supplierName,
    reference: inv.apInvoiceNumber || inv.supplierInvoiceNumber,
    amount: inv.totalAmount || 0,
    outstandingAmount: inv.outstandingAmount || 0,
    dueDate: inv.dueDate,
    status: inv.status,
    createdAt: inv.createdAt,
  };
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function sumMoney(items, field) {
  return roundMoney(items.reduce((sum, item) => sum + roundMoney(item[field] || 0), 0));
}

async function aggregateOpenAmount(Model, match, amountField) {
  const [row] = await Model.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: amountField } } },
  ]);
  return roundMoney(row?.total || 0);
}

function allocateAcrossItems(items, field, totalAmount) {
  let remaining = roundMoney(totalAmount);
  const allocations = [];

  for (const item of items) {
    if (remaining <= 0) break;
    const amount = Math.min(roundMoney(item[field] || 0), remaining);
    if (amount <= 0) continue;
    allocations.push({ item, amount: roundMoney(amount) });
    remaining = roundMoney(remaining - amount);
  }

  return allocations;
}

class OpenItemsService {
  /**
   * Get combined AR + AP open items with cursor pagination.
   * Filters by entityType: AR, AP, or ALL.
   */
  async getOpenItems(params = {}) {
    const {
      cursor, limit = 25, sortBy = 'dueDate', sortOrder = 'asc',
      entityType = 'ALL', customerId, supplierId, agingBucket,
    } = params;

    const safeLimit = normalizeLimit(limit);
    const safeSortBy = normalizeSort(sortBy);
    const safeSortOrder = sortOrder === 'desc' ? 'desc' : 'asc';
    const sort = buildCursorSort(safeSortBy, safeSortOrder);
    const cursorFilter = coerceCursorFieldTypes(
      buildCursorQuery(cursor, safeSortBy, safeSortOrder),
      safeSortBy,
    );
    const agingFilter = getAgingDateFilter(agingBucket);
    const projection = {
      __v: 0,
      lineItems: 0,
      payments: 0,
      vatBreakdown: 0,
      advanceDeductions: 0,
    };

    const queries = [];

    if (entityType === 'ALL' || entityType === 'AR') {
      queries.push((async () => {
        const Invoice = (await import('../qop/invoice.model.js')).default;
        const arFilter = {
          isDeleted: false,
          status: { $in: OPEN_AR_STATUSES },
          amountDue: { $gt: 0 },
          ...agingFilter,
          ...cursorFilter,
        };
        if (customerId) arFilter.customerId = customerId;

        const docs = await Invoice.find(arFilter)
          .sort(sort)
          .limit(safeLimit + 1)
          .select(projection)
          .lean()
          .setOptions({ includeDeleted: true });

        return docs.map(mapArInvoice);
      })().catch(() => {
        logger.warn('QOP Invoice model not available for open items', {
          module: 'accounting',
          action: 'openItems.list',
        });
        return [];
      }));
    }

    if (entityType === 'ALL' || entityType === 'AP') {
      queries.push((async () => {
        const ApInvoice = (await import('./apInvoice.model.js')).default;
        const apFilter = {
          isDeleted: false,
          status: { $in: OPEN_AP_STATUSES },
          outstandingAmount: { $gt: 0 },
          ...agingFilter,
          ...cursorFilter,
        };
        if (supplierId) apFilter.supplierId = supplierId;

        const docs = await ApInvoice.find(apFilter)
          .sort(sort)
          .limit(safeLimit + 1)
          .select(projection)
          .lean()
          .setOptions({ includeDeleted: true });

        return docs.map(mapApInvoice);
      })().catch(() => {
        logger.warn('AP invoice repository not available for open items', {
          module: 'accounting',
          action: 'openItems.list',
        });
        return [];
      }));
    }

    const itemGroups = await Promise.all(queries);
    const combined = itemGroups.flat();
    combined.sort((a, b) => {
      const aVal = a[safeSortBy] || a.dueDate;
      const bVal = b[safeSortBy] || b.dueDate;
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      if (cmp !== 0) return safeSortOrder === 'asc' ? cmp : -cmp;
      const idCmp = String(a._id).localeCompare(String(b._id));
      return safeSortOrder === 'asc' ? idCmp : -idCmp;
    });

    return buildCursorResponse(combined, safeLimit, safeSortBy);
  }

  /**
   * Get aging buckets for AR and/or AP.
   */
  async getAging(params = {}) {
    const { entityType = 'ALL' } = params;
    const now = new Date();
    const result = { ar: null, ap: null };

    if (entityType === 'ALL' || entityType === 'AR') {
      try {
        const Invoice = (await import('../qop/invoice.model.js')).default;
        const rows = await Invoice.aggregate(this._agingPipeline(OPEN_AR_STATUSES, '$amountDue', now));
        result.ar = normalizeBucketTotals(rows);
      } catch {
        logger.warn('QOP Invoice model not available for AR aging', {
          module: 'accounting',
          action: 'openItems.aging',
        });
      }
    }

    if (entityType === 'ALL' || entityType === 'AP') {
      try {
        const ApInvoice = (await import('./apInvoice.model.js')).default;
        const rows = await ApInvoice.aggregate(this._agingPipeline(OPEN_AP_STATUSES, '$outstandingAmount', now));
        result.ap = normalizeBucketTotals(rows);
      } catch {
        logger.warn('AP Invoice model not available for AP aging', {
          module: 'accounting',
          action: 'openItems.aging',
        });
      }
    }

    return result;
  }

  _agingPipeline(statuses, amountField, now) {
    return [
      {
        $match: {
          isDeleted: false,
          status: { $in: statuses },
        },
      },
      {
        $addFields: {
          agingDays: {
            $dateDiff: { startDate: '$dueDate', endDate: now, unit: 'day' },
          },
        },
      },
      {
        $addFields: {
          agingBucket: {
            $switch: {
              branches: [
                { case: { $lte: ['$agingDays', 0] }, then: 'current' },
                { case: { $lte: ['$agingDays', 30] }, then: '1_30' },
                { case: { $lte: ['$agingDays', 60] }, then: '31_60' },
                { case: { $lte: ['$agingDays', 90] }, then: '61_90' },
              ],
              default: '90_plus',
            },
          },
        },
      },
      {
        $group: {
          _id: '$agingBucket',
          count: { $sum: 1 },
          totalOutstanding: { $sum: amountField },
        },
      },
    ];
  }

  /**
   * Generate a statement for a customer (AR) or supplier (AP) over a date range.
   * Returns structured data suitable for PDF generation via doctpl module.
   */
  async generateStatement(entityId, entityType, dateRange = {}) {
    const { dateFrom, dateTo } = dateRange;
    const items = [];
    let entityName = null;
    let currency = 'CHF';

    if (entityType === 'customer') {
      // AR statement — invoices + payments for this customer
      try {
        const Invoice = (await import('../qop/invoice.model.js')).default;
        const filter = { customerId: entityId };
        if (dateFrom || dateTo) {
          filter.createdAt = {};
          if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
          if (dateTo) filter.createdAt.$lte = new Date(dateTo);
        }

        const invoices = await Invoice.find(filter)
          .sort({ createdAt: 1 })
          .lean();

        for (const inv of invoices) {
          entityName ||= inv.customerName;
          currency = inv.currency || currency;
          items.push({
            recordId: inv._id,
            date: inv.invoiceDate || inv.createdAt,
            type: 'INVOICE',
            reference: inv.invoiceNumber,
            description: inv.description || `Invoice ${inv.invoiceNumber}`,
            debit: inv.totalGross || inv.totalAmount || 0,
            credit: 0,
            balance: inv.amountDue || 0,
            status: inv.status,
          });
        }

        // Add payments
        try {
          const { arPaymentRepository } = await import('./arPayment.repository.js');
          const paymentResult = await arPaymentRepository.findWithCursor({
            limit: 100000,
            sortBy: 'paymentDate',
            sortOrder: 'asc',
            filters: { customerId: entityId },
          });

          for (const pmt of (paymentResult.data || [])) {
            const pmtDate = pmt.paymentDate || pmt.createdAt;
            if (dateFrom && new Date(pmtDate) < new Date(dateFrom)) continue;
            if (dateTo && new Date(pmtDate) > new Date(dateTo)) continue;

            items.push({
              date: pmtDate,
              type: 'PAYMENT',
              reference: pmt.paymentReference || String(pmt._id),
              description: `Payment received`,
              debit: 0,
              credit: pmt.amount || 0,
              balance: 0,
              status: 'APPLIED',
            });
          }
        } catch {
          // Payments may not be available
        }
      } catch {
        logger.warn('QOP Invoice model not available for statement generation', {
          module: 'accounting',
          action: 'openItems.statement',
        });
      }
    } else if (entityType === 'supplier') {
      // AP statement
      try {
        const ApInvoice = (await import('./apInvoice.model.js')).default;
        const filter = { supplierId: entityId, isDeleted: false };
        if (dateFrom || dateTo) {
          filter.createdAt = {};
          if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
          if (dateTo) filter.createdAt.$lte = new Date(dateTo);
        }

        const invoices = await ApInvoice.find(filter)
          .sort({ createdAt: 1 })
          .lean();

        for (const inv of invoices) {
          entityName ||= inv.supplierName;
          currency = inv.currency || currency;
          items.push({
            recordId: inv._id,
            date: inv.invoiceDate || inv.createdAt,
            type: 'AP_INVOICE',
            reference: inv.apInvoiceNumber || inv.supplierInvoiceNumber,
            description: inv.description || `AP Invoice ${inv.apInvoiceNumber}`,
            debit: 0,
            credit: inv.totalAmount || 0,
            balance: inv.outstandingAmount || 0,
            status: inv.status,
          });
        }
      } catch {
        logger.warn('AP Invoice model not available for statement generation', {
          module: 'accounting',
          action: 'openItems.statement',
        });
      }
    }

    // Sort by date
    items.sort((a, b) => new Date(a.date) - new Date(b.date));

    return {
      entityId,
      entityName,
      entityType,
      currency,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      items,
      totalDebit: roundMoney(items.reduce((sum, i) => sum + i.debit, 0)),
      totalCredit: roundMoney(items.reduce((sum, i) => sum + i.credit, 0)),
      closingBalance: roundMoney(items.reduce((sum, i) => sum + (i.debit || 0) - (i.credit || 0), 0)),
      generatedAt: new Date(),
    };
  }

  async generateStatementOutput(entityId, entityType, dateRange, options, userId, meta = {}) {
    const accountingDocumentOutputService = (await import('./accountingDocumentOutput.service.js')).default;
    const statement = await this.generateStatement(entityId, entityType, dateRange);
    const output = await accountingDocumentOutputService.createStatementOutput(statement, options, userId, meta);

    return {
      ...statement,
      document: output.document,
      fileName: output.fileName,
      emailQueued: output.emailQueued,
    };
  }

  /**
   * Get net position for an entity that is both customer AND supplier.
   * Returns AR total - AP total = net position.
   */
  async getNetPosition(entityId) {
    let arTotal = 0;
    let apTotal = 0;

    // AR total
    try {
      const Invoice = (await import('../qop/invoice.model.js')).default;
      arTotal = await aggregateOpenAmount(Invoice, {
        customerId: entityId,
        isDeleted: false,
        status: { $in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
        amountDue: { $gt: 0 },
      }, '$amountDue');
    } catch {
      logger.warn('QOP Invoice model not available for net position', {
        module: 'accounting',
        action: 'openItems.netPosition',
      });
    }

    // AP total
    try {
      const ApInvoice = (await import('./apInvoice.model.js')).default;
      apTotal = await aggregateOpenAmount(ApInvoice, {
        supplierId: entityId,
        isDeleted: false,
        status: { $in: ['RECORDED', 'APPROVED', 'PARTIALLY_PAID'] },
        outstandingAmount: { $gt: 0 },
      }, '$outstandingAmount');
    } catch {
      logger.warn('AP Invoice model not available for net position', {
        module: 'accounting',
        action: 'openItems.netPosition',
      });
    }

    return {
      entityId,
      arTotal: Math.round(arTotal * 100) / 100,
      apTotal: Math.round(apTotal * 100) / 100,
      netPosition: Math.round((arTotal - apTotal) * 100) / 100,
    };
  }

  async netItems(data, userId) {
    const {
      customerId,
      supplierId = customerId,
      arInvoiceIds = [],
      apInvoiceIds = [],
      amount,
      reason = '',
    } = data;

    if (!arInvoiceIds.length || !apInvoiceIds.length) {
      throw new AppError(
        'At least one AR invoice and one AP invoice are required for netting',
        400,
        ERROR_CODES.INVALID_INPUT,
      );
    }

    const session = await mongoose.startSession();
    let netAmount = 0;
    let arAllocations = [];
    let apAllocations = [];

    try {
      await session.withTransaction(async () => {
        const [Invoice, ApInvoice] = await Promise.all([
          import('../qop/invoice.model.js').then((module) => module.default),
          import('./apInvoice.model.js').then((module) => module.default),
        ]);

        const [arInvoices, apInvoices] = await Promise.all([
          Invoice.find({
            _id: { $in: arInvoiceIds },
            customerId,
            isDeleted: false,
            status: { $in: OPEN_AR_STATUSES },
            amountDue: { $gt: 0 },
          }).session(session).lean(),
          ApInvoice.find({
            _id: { $in: apInvoiceIds },
            supplierId,
            isDeleted: false,
            status: { $in: OPEN_AP_STATUSES },
            outstandingAmount: { $gt: 0 },
          }).session(session).lean(),
        ]);

        if (arInvoices.length !== arInvoiceIds.length) {
          const found = new Set(arInvoices.map((invoice) => String(invoice._id)));
          const missing = arInvoiceIds.find((id) => !found.has(String(id)));
          throw new NotFoundError('Open AR invoice', missing);
        }
        if (apInvoices.length !== apInvoiceIds.length) {
          const found = new Set(apInvoices.map((invoice) => String(invoice._id)));
          const missing = apInvoiceIds.find((id) => !found.has(String(id)));
          throw new NotFoundError('Open AP invoice', missing);
        }

        const maxNettableAmount = Math.min(
          sumMoney(arInvoices, 'amountDue'),
          sumMoney(apInvoices, 'outstandingAmount'),
        );
        netAmount = amount === undefined || amount === null
          ? maxNettableAmount
          : roundMoney(amount);

        if (netAmount <= 0 || netAmount > maxNettableAmount) {
          throw new ConflictError('Netting amount must be greater than zero and cannot exceed open AR/AP balances');
        }

        arAllocations = allocateAcrossItems(arInvoices, 'amountDue', netAmount);
        apAllocations = allocateAcrossItems(apInvoices, 'outstandingAmount', netAmount);

        for (const { item: invoice, amount: allocationAmount } of arAllocations) {
          const newAmountPaid = roundMoney((invoice.amountPaid || 0) + allocationAmount);
          const newAmountDue = roundMoney((invoice.amountDue || 0) - allocationAmount);
          const update = await Invoice.updateOne(
            {
              _id: invoice._id,
              customerId,
              isDeleted: false,
              status: { $in: OPEN_AR_STATUSES },
              amountDue: { $gte: allocationAmount },
            },
            {
              $set: {
                amountPaid: newAmountPaid,
                amountDue: newAmountDue,
                status: newAmountDue <= 0 ? 'PAID' : 'PARTIALLY_PAID',
                ...(newAmountDue <= 0 ? { paidAt: new Date() } : {}),
              },
            },
            { session },
          );
          if (update.matchedCount !== 1) {
            throw new ConflictError('AR invoice changed while netting was being posted');
          }
        }

        for (const { item: invoice, amount: allocationAmount } of apAllocations) {
          const newPaidAmount = roundMoney((invoice.paidAmount || 0) + allocationAmount);
          const newOutstandingAmount = roundMoney((invoice.outstandingAmount || 0) - allocationAmount);
          const update = await ApInvoice.updateOne(
            {
              _id: invoice._id,
              supplierId,
              isDeleted: false,
              status: { $in: OPEN_AP_STATUSES },
              outstandingAmount: { $gte: allocationAmount },
            },
            {
              $set: {
                paidAmount: newPaidAmount,
                outstandingAmount: newOutstandingAmount,
                status: newOutstandingAmount <= 0 ? 'PAID' : 'PARTIALLY_PAID',
              },
              $inc: { version: 1 },
            },
            { session },
          );
          if (update.matchedCount !== 1) {
            throw new ConflictError('AP invoice changed while netting was being posted');
          }
        }

        const [payableAccountId, receivableAccountId] = await Promise.all([
          accountMappingService.resolveGlobal(ACCOUNT_MAPPING.AP_PAYABLE, { session }),
          accountMappingService.resolveGlobal(ACCOUNT_MAPPING.AR_RECEIVABLE, { session }),
        ]);

        await journalEntryService.createFromEvent(
          'NETTING',
          arAllocations[0]?.item?._id || null,
          payableAccountId,
          receivableAccountId,
          netAmount,
          `Open-item netting${reason ? `: ${reason}` : ''}`,
          userId,
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    return {
      customerId,
      supplierId,
      amount: netAmount,
      arAllocations: arAllocations.map(({ item, amount: allocationAmount }) => ({
        invoiceId: item._id,
        amount: allocationAmount,
      })),
      apAllocations: apAllocations.map(({ item, amount: allocationAmount }) => ({
        invoiceId: item._id,
        amount: allocationAmount,
      })),
    };
  }
}

const openItemsService = new OpenItemsService();
export default openItemsService;
