import mongoose from 'mongoose';
import apInvoiceRepository from './apInvoice.repository.js';
import paymentBatchRepository from './paymentBatch.repository.js';
import bankAccountRepository from './bankAccount.repository.js';
import accountRepository from './account.repository.js';
import accountingCounterService from './accounting.counter.service.js';
import { generatePain001 } from './iso20022.parser.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { NotFoundError, ConflictError, ValidationError } from '../../shared/errors/AppError.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

const ENTITY_TTL = { l1Ttl: 60, l2Ttl: 300 };
const LIST_TTL = { l1Ttl: 30, l2Ttl: 120 };

const AP_TRANSITIONS = {
  RECORDED: ['APPROVED', 'DISPUTED', 'CANCELLED'],
  APPROVED: ['PAID', 'PARTIALLY_PAID', 'CANCELLED'],
  PAID: [],
  PARTIALLY_PAID: ['PAID', 'CANCELLED'],
  DISPUTED: ['RECORDED', 'CANCELLED'],
  CANCELLED: [],
};

const DEFAULT_APPROVAL_THRESHOLD = 10000;
const OPEN_AP_STATUSES = ['RECORDED', 'APPROVED', 'PARTIALLY_PAID'];
const AGING_BUCKET_KEYS = ['current', '1_30', '31_60', '61_90', '90_plus'];
const EXPORTABLE_BATCH_STATUSES = ['CREATED', 'EXPORTED'];

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function uniqueIds(ids) {
  return [...new Set(ids.map((id) => String(id)))];
}

function emptyAgingBuckets() {
  return AGING_BUCKET_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});
}

function normalizeAgingRows(rows) {
  const buckets = emptyAgingBuckets();
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

function buildPaymentReference(invoice) {
  return [
    invoice.apInvoiceNumber,
    invoice.supplierInvoiceNumber,
  ].filter(Boolean).join(' / ');
}

function normalizeCreditorIban(value) {
  return String(value || '').replace(/\s+/g, '').toUpperCase();
}

function getReferenceId(value) {
  return value?._id || value || null;
}

class ApInvoiceService {
  async create(data, createdBy, meta = {}) {
    const apInvoiceNumber = await accountingCounterService.getNextApInvoiceNumber();

    // Check duplicate supplier + supplier invoice number
    const existing = await apInvoiceRepository.findBySupplierAndNumber(
      data.supplierId,
      data.supplierInvoiceNumber,
    );
    if (existing) {
      throw new ConflictError(
        `AP invoice already exists for supplier ${data.supplierId} with invoice number ${data.supplierInvoiceNumber}`,
      );
    }

    // Calculate totals from line items
    const { subtotal, vatAmount, totalAmount } = this._calculateTotals(data.lineItems);

    const invoice = await apInvoiceRepository.create({
      ...data,
      apInvoiceNumber,
      subtotal,
      vatAmount,
      totalAmount,
      outstandingAmount: totalAmount,
      createdBy,
    });

    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.ACCOUNTING_AP_INVOICE_RECORDED, {
      apInvoiceId: invoice._id,
      apInvoiceNumber,
      supplierId: data.supplierId,
      totalAmount,
      createdBy,
    }, { source: 'accounting:ap' });

    auditService.logEvent({
      eventType: 'accounting.ap_invoice.created',
      userId: createdBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { apInvoiceId: invoice._id, apInvoiceNumber, totalAmount },
      module: 'accounting',
    });

    logger.info('AP invoice created', {
      module: 'accounting',
      action: 'ap.create',
      apInvoiceId: invoice._id,
      apInvoiceNumber,
    });

    return apInvoiceRepository.findById(invoice._id);
  }

  async getById(id) {
    const cacheKey = `accounting:ap:${id}`;
    const invoice = await cacheManager.getOrSet(
      cacheKey,
      () => apInvoiceRepository.findById(id),
      ENTITY_TTL,
    );
    if (!invoice) throw new NotFoundError('ApInvoice', id);
    return invoice;
  }

  async list(queryParams) {
    const { cursor, limit, sortBy, sortOrder, ...filters } = queryParams;
    const filterKey = Object.entries(filters)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    const cacheKey = `accounting:ap:list:${cursor || ''}:${limit}:${sortBy}:${sortOrder}:${filterKey}`;

    return cacheManager.getOrSet(
      cacheKey,
      () => apInvoiceRepository.findWithCursor({ cursor, limit, sortBy, sortOrder, filters }),
      LIST_TTL,
    );
  }

  async update(id, data, updatedBy, meta = {}) {
    const existing = await apInvoiceRepository.findById(id);
    if (!existing) throw new NotFoundError('ApInvoice', id);

    if (existing.status !== 'RECORDED') {
      throw new ConflictError('Only RECORDED invoices can be updated');
    }

    if (data.version !== undefined && data.version !== existing.version) {
      throw new ConflictError('Version conflict: invoice has been modified by another user');
    }

    // Recalculate totals if line items changed
    let totals = {};
    if (data.lineItems) {
      totals = this._calculateTotals(data.lineItems);
      totals.outstandingAmount = totals.totalAmount - (existing.paidAmount || 0);
    }

    const updated = await apInvoiceRepository.updateById(id, {
      ...data,
      ...totals,
      updatedBy,
    });

    await this._invalidateApCache(id);
    await this._invalidateListCache();

    auditService.logEvent({
      eventType: 'accounting.ap_invoice.updated',
      userId: updatedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { apInvoiceId: id, changedFields: Object.keys(data) },
      module: 'accounting',
    });

    return updated;
  }

  async approve(id, approverId, meta = {}) {
    const invoice = await apInvoiceRepository.findById(id);
    if (!invoice) throw new NotFoundError('ApInvoice', id);

    this._validateTransition(invoice.status, 'APPROVED');
    await this._validateCompleteAllocations(invoice);

    const threshold = config.accounting?.approvalThreshold || DEFAULT_APPROVAL_THRESHOLD;

    if (invoice.totalAmount > threshold) {
      // High-value: set first approver, keep status as RECORDED until second approval
      const updated = await apInvoiceRepository.updateById(id, {
        approvedBy: approverId,
        approvedAt: new Date(),
      });

      await this._invalidateApCache(id);

      auditService.logEvent({
        eventType: 'accounting.ap_invoice.first_approved',
        userId: approverId,
        ipAddress: meta.ipAddress || 'internal',
        userAgent: meta.userAgent,
        result: 'success',
        details: { apInvoiceId: id, totalAmount: invoice.totalAmount, requiresSecondApproval: true },
        module: 'accounting',
      });

      return updated;
    }

    // Below threshold: directly approve
    const updated = await apInvoiceRepository.updateById(id, {
      status: 'APPROVED',
      approvedBy: approverId,
      approvedAt: new Date(),
    });

    await this._invalidateApCache(id);
    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.ACCOUNTING_AP_INVOICE_APPROVED, {
      apInvoiceId: id,
      approverId,
      totalAmount: invoice.totalAmount,
    }, { source: 'accounting:ap' });

    auditService.logEvent({
      eventType: 'accounting.ap_invoice.approved',
      userId: approverId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { apInvoiceId: id, totalAmount: invoice.totalAmount },
      module: 'accounting',
    });

    return updated;
  }

  async secondApprove(id, approverId, meta = {}) {
    const invoice = await apInvoiceRepository.findById(id);
    if (!invoice) throw new NotFoundError('ApInvoice', id);

    if (!invoice.approvedBy) {
      throw new ConflictError('First approval is required before second approval');
    }

    if (invoice.status !== 'RECORDED') {
      throw new ConflictError('Invoice must be in RECORDED status for second approval');
    }

    if (String(invoice.approvedBy?._id || invoice.approvedBy) === String(approverId)) {
      throw new ConflictError('Second approver must be different from first approver');
    }
    await this._validateCompleteAllocations(invoice);

    const updated = await apInvoiceRepository.updateById(id, {
      status: 'APPROVED',
      secondApproverId: approverId,
      secondApprovedAt: new Date(),
    });

    await this._invalidateApCache(id);
    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.ACCOUNTING_AP_INVOICE_APPROVED, {
      apInvoiceId: id,
      approverId,
      secondApproverId: approverId,
      totalAmount: invoice.totalAmount,
    }, { source: 'accounting:ap' });

    auditService.logEvent({
      eventType: 'accounting.ap_invoice.second_approved',
      userId: approverId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { apInvoiceId: id, totalAmount: invoice.totalAmount },
      module: 'accounting',
    });

    return updated;
  }

  async dispute(id, reason, userId, meta = {}) {
    const invoice = await apInvoiceRepository.findById(id);
    if (!invoice) throw new NotFoundError('ApInvoice', id);

    this._validateTransition(invoice.status, 'DISPUTED');

    const updated = await apInvoiceRepository.updateById(id, {
      status: 'DISPUTED',
      updatedBy: userId,
    });

    await this._invalidateApCache(id);
    await this._invalidateListCache();

    auditService.logEvent({
      eventType: 'accounting.ap_invoice.disputed',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { apInvoiceId: id, reason },
      module: 'accounting',
    });

    return updated;
  }

  async getOpenPayables(params = {}) {
    return apInvoiceRepository.findOpenPayables(params);
  }

  async getAgingReport() {
    const ApInvoice = (await import('./apInvoice.model.js')).default;
    const now = new Date();

    const rows = await ApInvoice.aggregate([
      {
        $match: {
          isDeleted: false,
          status: { $in: OPEN_AP_STATUSES },
          outstandingAmount: { $gt: 0 },
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
          totalOutstanding: { $sum: '$outstandingAmount' },
        },
      },
    ]);

    return normalizeAgingRows(rows);
  }

  async getSummary() {
    const ApInvoice = (await import('./apInvoice.model.js')).default;
    const now = new Date();

    const result = await ApInvoice.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          total: { $sum: '$totalAmount' },
          outstanding: { $sum: '$outstandingAmount' },
        },
      },
      {
        $project: {
          _id: 0,
          status: '$_id',
          count: 1,
          total: 1,
          outstanding: 1,
        },
      },
    ]);

    const byStatus = result.reduce((acc, row) => {
      acc[row.status] = row;
      return acc;
    }, {});
    const openStatuses = OPEN_AP_STATUSES;
    const openAmount = openStatuses.reduce((sum, status) => sum + (byStatus[status]?.outstanding || 0), 0);
    const openCount = openStatuses.reduce((sum, status) => sum + (byStatus[status]?.count || 0), 0);

    const overdueRows = await ApInvoice.aggregate([
      {
        $match: {
          isDeleted: false,
          status: { $in: OPEN_AP_STATUSES },
          dueDate: { $lt: now },
          outstandingAmount: { $gt: 0 },
        },
      },
      {
        $group: {
          _id: null,
          overdueCount: { $sum: 1 },
          overdueAmount: { $sum: '$outstandingAmount' },
        },
      },
    ]);
    const overdue = overdueRows[0] || {};

    return {
      byStatus: result,
      openAmount: Math.round(openAmount * 100) / 100,
      openCount,
      overdueAmount: Math.round((overdue.overdueAmount || 0) * 100) / 100,
      overdueCount: overdue.overdueCount || 0,
    };
  }

  async createPaymentBatch(invoiceIds, bankAccountId, userId, meta = {}) {
    const uniqueInvoiceIds = uniqueIds(invoiceIds);
    if (uniqueInvoiceIds.length !== invoiceIds.length) {
      throw new ConflictError('Payment batch invoice list contains duplicate invoices');
    }

    const session = await mongoose.startSession();
    let batch;
    let batchNumber;
    let totalAmount = 0;

    try {
      await session.withTransaction(async () => {
        const invoices = await apInvoiceRepository.findByIds(uniqueInvoiceIds, { session });
        if (invoices.length !== uniqueInvoiceIds.length) {
          const foundIds = new Set(invoices.map((invoice) => String(invoice._id)));
          const missingId = uniqueInvoiceIds.find((invoiceId) => !foundIds.has(invoiceId));
          throw new NotFoundError('ApInvoice', missingId);
        }

        for (const invoice of invoices) {
          if (invoice.status !== 'APPROVED') {
            throw new ConflictError(`Invoice ${invoice.apInvoiceNumber} is not in APPROVED status`);
          }
          if (roundMoney(invoice.outstandingAmount) <= 0) {
            throw new ConflictError(`Invoice ${invoice.apInvoiceNumber} has no outstanding amount`);
          }
          if (invoice.paymentBatchId) {
            throw new ConflictError(`Invoice ${invoice.apInvoiceNumber} is already assigned to a payment batch`);
          }
        }

        batchNumber = await accountingCounterService.getNextPaymentBatchNumber({ session });
        totalAmount = roundMoney(invoices.reduce((sum, inv) => sum + roundMoney(inv.outstandingAmount), 0));

        batch = await paymentBatchRepository.create({
          batchNumber,
          totalAmount,
          invoiceCount: invoices.length,
          invoiceIds: uniqueInvoiceIds,
          bankAccountId,
          createdBy: userId,
        }, { session });

        const reservation = await apInvoiceRepository.reserveForPaymentBatch(uniqueInvoiceIds, batch._id, { session });
        if (reservation.modifiedCount !== uniqueInvoiceIds.length) {
          throw new ConflictError('One or more invoices changed while creating the payment batch');
        }
      });
    } finally {
      await session.endSession();
    }

    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.ACCOUNTING_AP_PAYMENT_BATCH_CREATED, {
      batchId: batch._id,
      batchNumber,
      totalAmount,
      invoiceCount: uniqueInvoiceIds.length,
      createdBy: userId,
    }, { source: 'accounting:ap' });

    auditService.logEvent({
      eventType: 'accounting.payment_batch.created',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { batchId: batch._id, batchNumber, totalAmount, invoiceCount: uniqueInvoiceIds.length },
      module: 'accounting',
    });

    logger.info('Payment batch created', {
      module: 'accounting',
      action: 'payment_batch.create',
      batchId: batch._id,
      batchNumber,
    });

    return paymentBatchRepository.findById(batch._id);
  }

  async exportPaymentBatchPain001(batchId, userId, meta = {}) {
    const batch = await paymentBatchRepository.findById(batchId);
    if (!batch) throw new NotFoundError('PaymentBatch', batchId);

    if (!EXPORTABLE_BATCH_STATUSES.includes(batch.status)) {
      throw new ConflictError(`Payment batch ${batch.batchNumber} cannot be exported from ${batch.status} status`);
    }

    const [bankAccount, invoices] = await Promise.all([
      bankAccountRepository.findById(batch.bankAccountId),
      apInvoiceRepository.findByPaymentBatchId(batch._id),
    ]);

    if (!bankAccount) throw new NotFoundError('BankAccount', batch.bankAccountId);
    if (!invoices.length) {
      throw new ConflictError(`Payment batch ${batch.batchNumber} has no reserved invoices`);
    }
    if (invoices.length !== Number(batch.invoiceCount)) {
      throw new ConflictError(`Payment batch ${batch.batchNumber} invoice count does not match reserved invoices`);
    }

    const transfers = invoices.map((invoice) => {
      if (invoice.status !== 'APPROVED') {
        throw new ConflictError(`Invoice ${invoice.apInvoiceNumber} is not in APPROVED status`);
      }

      const amount = roundMoney(invoice.outstandingAmount);
      if (amount <= 0) {
        throw new ConflictError(`Invoice ${invoice.apInvoiceNumber} has no outstanding amount`);
      }

      const creditorIban = normalizeCreditorIban(invoice.supplierIban);
      if (!creditorIban) {
        throw new ConflictError(`Invoice ${invoice.apInvoiceNumber} is missing supplier IBAN for pain.001 export`);
      }

      return {
        instructionId: invoice.apInvoiceNumber,
        endToEndId: invoice.supplierInvoiceNumber || invoice.apInvoiceNumber,
        amount,
        currency: invoice.currency || bankAccount.currency || 'CHF',
        creditorName: invoice.supplierName,
        creditorIban,
        creditorBic: invoice.supplierBic,
        remittanceText: buildPaymentReference(invoice),
      };
    });

    const xml = generatePain001(batch, bankAccount, transfers);
    const exported = await paymentBatchRepository.updateStatus(batch._id, 'EXPORTED', {
      exportedAt: new Date(),
      exportedBy: userId,
    });

    auditService.logEvent({
      eventType: 'accounting.payment_batch.pain001_exported',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: {
        batchId: batch._id,
        batchNumber: batch.batchNumber,
        totalAmount: batch.totalAmount,
        invoiceCount: invoices.length,
      },
      module: 'accounting',
    });

    logger.info('Payment batch pain.001 exported', {
      module: 'accounting',
      action: 'payment_batch.export_pain001',
      batchId: batch._id,
      batchNumber: batch.batchNumber,
    });

    return {
      batch: exported,
      fileName: `${batch.batchNumber}.pain001.xml`,
      contentType: 'application/xml',
      xml,
    };
  }

  _calculateTotals(lineItems) {
    if (!lineItems || !lineItems.length) {
      return { subtotal: 0, vatAmount: 0, totalAmount: 0 };
    }

    let subtotal = 0;
    let vatAmount = 0;

    for (const item of lineItems) {
      const lineTotal = roundMoney((item.quantity || 0) * (item.unitPrice || 0));
      item.lineTotal = lineTotal;
      this._validateSplitAllocationSum(item, lineTotal);
      subtotal += lineTotal;
      vatAmount += lineTotal * ((item.vatRate || 0) / 100);
    }

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      vatAmount: Math.round(vatAmount * 100) / 100,
      totalAmount: Math.round((subtotal + vatAmount) * 100) / 100,
    };
  }

  _validateSplitAllocationSum(item, lineTotal) {
    if (!Array.isArray(item.allocations) || item.allocations.length === 0) return;
    if (item.allocations.length > 10) {
      throw new ValidationError('A supplier invoice line can be split across at most 10 allocations');
    }

    const allocatedTotal = roundMoney(
      item.allocations.reduce((sum, allocation) => sum + roundMoney(allocation.amount), 0),
    );
    if (allocatedTotal !== lineTotal) {
      throw new ValidationError(
        `Split allocations for line "${item.description}" must equal the line total`,
        [{ field: 'lineItems.allocations', expected: lineTotal, actual: allocatedTotal }],
      );
    }
  }

  async _validateCompleteAllocations(invoice) {
    const lineItems = invoice.lineItems || [];
    if (!lineItems.length) {
      throw new ConflictError('Invoice cannot be approved without line items');
    }

    const accountIds = new Set();
    for (const item of lineItems) {
      const lineTotal = roundMoney(item.lineTotal ?? ((item.quantity || 0) * (item.unitPrice || 0)));
      const allocations = Array.isArray(item.allocations) ? item.allocations : [];

      if (allocations.length) {
        this._validateSplitAllocationSum(item, lineTotal);
        for (const allocation of allocations) {
          const accountId = getReferenceId(allocation.accountId);
          if (!accountId) {
            throw new ConflictError(`Invoice line "${item.description}" has an allocation without an account`);
          }
          accountIds.add(String(accountId));
        }
        continue;
      }

      const accountId = getReferenceId(item.accountId);
      if (!accountId) {
        throw new ConflictError(`Invoice line "${item.description}" is missing account allocation`);
      }
      accountIds.add(String(accountId));
    }

    await this._validatePostingAccounts([...accountIds]);
  }

  async _validatePostingAccounts(accountIds) {
    await Promise.all(accountIds.map(async (accountId) => {
      const account = await accountRepository.findById(accountId);
      if (!account) throw new NotFoundError('Account', accountId);
      if (!account.isActive || account.isGroup) {
        throw new ConflictError(`Account ${account.accountNumber || accountId} is not an active posting account`);
      }
    }));
  }

  _validateTransition(currentStatus, targetStatus) {
    const allowed = AP_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(targetStatus)) {
      throw new ConflictError(
        `Cannot transition from ${currentStatus} to ${targetStatus}`,
      );
    }
  }

  async _invalidateApCache(id) {
    await cacheManager.del(`accounting:ap:${id}`);
  }

  async _invalidateListCache() {
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}accounting:ap:list:*`);
  }
}

const apInvoiceService = new ApInvoiceService();
export default apInvoiceService;
