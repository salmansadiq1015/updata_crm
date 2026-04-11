import apInvoiceRepository from './apInvoice.repository.js';
import paymentBatchRepository from './paymentBatch.repository.js';
import accountingCounterService from './accounting.counter.service.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';
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

    return ApInvoice.aggregate([
      {
        $match: {
          isDeleted: false,
          status: { $in: ['RECORDED', 'APPROVED', 'PARTIALLY_PAID'] },
        },
      },
      {
        $addFields: {
          agingDays: {
            $divide: [{ $subtract: [now, '$dueDate'] }, 1000 * 60 * 60 * 24],
          },
        },
      },
      {
        $bucket: {
          groupBy: '$agingDays',
          boundaries: [-Infinity, 0, 30, 60, 90, Infinity],
          default: 'over90',
          output: {
            count: { $sum: 1 },
            totalOutstanding: { $sum: '$outstandingAmount' },
          },
        },
      },
    ]);
  }

  async getSummary() {
    const ApInvoice = (await import('./apInvoice.model.js')).default;

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

    return result;
  }

  async createPaymentBatch(invoiceIds, bankAccountId, userId, meta = {}) {
    // Validate all invoices are APPROVED
    const invoices = [];
    for (const invoiceId of invoiceIds) {
      const invoice = await apInvoiceRepository.findById(invoiceId);
      if (!invoice) throw new NotFoundError('ApInvoice', invoiceId);
      if (invoice.status !== 'APPROVED') {
        throw new ConflictError(`Invoice ${invoice.apInvoiceNumber} is not in APPROVED status`);
      }
      invoices.push(invoice);
    }

    const batchNumber = await accountingCounterService.getNextPaymentBatchNumber();
    const totalAmount = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);

    const batch = await paymentBatchRepository.create({
      batchNumber,
      totalAmount,
      invoiceCount: invoices.length,
      invoiceIds,
      bankAccountId,
      createdBy: userId,
    });

    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.ACCOUNTING_AP_PAYMENT_BATCH_CREATED, {
      batchId: batch._id,
      batchNumber,
      totalAmount,
      invoiceCount: invoices.length,
      createdBy: userId,
    }, { source: 'accounting:ap' });

    auditService.logEvent({
      eventType: 'accounting.payment_batch.created',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { batchId: batch._id, batchNumber, totalAmount, invoiceCount: invoices.length },
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

  _calculateTotals(lineItems) {
    if (!lineItems || !lineItems.length) {
      return { subtotal: 0, vatAmount: 0, totalAmount: 0 };
    }

    let subtotal = 0;
    let vatAmount = 0;

    for (const item of lineItems) {
      const lineTotal = (item.quantity || 0) * (item.unitPrice || 0);
      item.lineTotal = lineTotal;
      subtotal += lineTotal;
      vatAmount += lineTotal * ((item.vatRate || 0) / 100);
    }

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      vatAmount: Math.round(vatAmount * 100) / 100,
      totalAmount: Math.round((subtotal + vatAmount) * 100) / 100,
    };
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
