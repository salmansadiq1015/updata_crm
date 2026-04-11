import invoiceRepository from './invoice.repository.js';
import counterService from './counter.service.js';
import { calculateTotals, roundToFiveRappen } from './vatCalculation.js';
import auditService from '../auth/audit.service.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import queueManager from '../../shared/queue/QueueManager.js';
import { NotFoundError, ConflictError, AppError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

const ENTITY_TTL = { l1Ttl: 60, l2Ttl: 300 };
const LIST_TTL = { l1Ttl: 30, l2Ttl: 120 };

const INVOICE_TRANSITIONS = {
  DRAFT: ['SENT', 'CANCELLED'],
  SENT: ['PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'],
  PARTIALLY_PAID: ['PAID', 'OVERDUE', 'CANCELLED'],
  PAID: [],
  OVERDUE: ['PARTIALLY_PAID', 'PAID', 'CANCELLED'],
  CANCELLED: [],
};

class InvoiceService {
  async create(data, createdBy, meta = {}) {
    const invoiceNumber = await counterService.getNextInvoiceNumber(data.departmentId);

    let totals = {};
    if (data.lineItems?.length) {
      totals = calculateTotals(data.lineItems, data.globalDiscountPercent || 0, data.currency || 'CHF');
    }

    const amountDue = totals.grandTotalRounded ?? data.grandTotalRounded ?? 0;

    const invoice = await invoiceRepository.create({
      ...data,
      ...totals,
      invoiceNumber,
      invoiceType: data.invoiceType || 'STANDARD',
      amountDue,
      createdBy,
    });

    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.INVOICE_CREATED, {
      invoiceId: invoice._id,
      invoiceNumber,
      invoiceType: invoice.invoiceType,
      customerId: invoice.customerId,
      createdBy,
    }, { source: 'qop:invoices' });

    auditService.logEvent({
      eventType: 'invoice.created',
      userId: createdBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { invoiceId: invoice._id, invoiceNumber },
      module: 'qop',
    });

    logger.info('Invoice created', { module: 'qop', action: 'create', invoiceId: invoice._id, invoiceNumber });

    return invoiceRepository.findById(invoice._id);
  }

  async createAdvanceInvoice(data, createdBy, meta = {}) {
    const { default: orderRepository } = await import('./order.repository.js');

    const order = await orderRepository.findById(data.sourceOrderId);
    if (!order) throw new NotFoundError('Order', data.sourceOrderId);

    if (!data.milestonePercent || data.milestonePercent <= 0 || data.milestonePercent > 100) {
      throw new ConflictError('milestonePercent is required and must be between 1 and 100');
    }

    // Validate total advance does not exceed 100%
    const existingAdvances = await invoiceRepository.findAdvancesByProject(order.projectId);
    const existingPercent = existingAdvances.reduce((sum, inv) => sum + (inv.milestonePercent || 0), 0);
    if (existingPercent + data.milestonePercent > 100) {
      throw new ConflictError(
        `Total advance percentage would exceed 100% (existing: ${existingPercent}%, requested: ${data.milestonePercent}%)`,
      );
    }

    const advanceAmount = roundToFiveRappen(order.grandTotalRounded * data.milestonePercent / 100);

    // Build line items from milestone
    const lineItems = [
      {
        position: 1,
        description: data.milestoneDescription || `Advance payment (${data.milestonePercent}%)`,
        quantity: 1,
        unitPrice: advanceAmount,
        vatRate: order.vatBreakdown?.[0]?.rate || 0,
        discountPercent: 0,
        unit: 'pcs',
      },
    ];

    const totals = calculateTotals(lineItems, 0, order.currency || 'CHF');

    const invoiceNumber = await counterService.getNextInvoiceNumber(order.departmentId);

    const invoice = await invoiceRepository.create({
      invoiceNumber,
      invoiceType: 'ADVANCE',
      sourceOrderId: order._id,
      sourceQuotationId: order.sourceQuotationId || null,
      customerId: order.customerId?._id || order.customerId,
      customerName: order.customerName,
      contactId: order.contactId?._id || order.contactId || null,
      projectId: order.projectId?._id || order.projectId || null,
      departmentId: order.departmentId || null,
      language: order.language,
      title: data.title || `Advance Invoice - ${data.milestoneDescription || ''}`,
      ...totals,
      currency: order.currency,
      dueDate: data.dueDate,
      paymentTermsDays: data.paymentTermsDays || 30,
      paymentTermsText: data.paymentTermsText || '',
      milestoneDescription: data.milestoneDescription,
      milestonePercent: data.milestonePercent,
      amountDue: totals.grandTotalRounded,
      createdBy,
    });

    // Link invoice to order
    await orderRepository.addInvoiceId(order._id, invoice._id);

    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.INVOICE_CREATED, {
      invoiceId: invoice._id,
      invoiceNumber,
      invoiceType: 'ADVANCE',
      sourceOrderId: order._id,
      createdBy,
    }, { source: 'qop:invoices' });

    auditService.logEvent({
      eventType: 'invoice.advance_created',
      userId: createdBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { invoiceId: invoice._id, invoiceNumber, milestonePercent: data.milestonePercent },
      module: 'qop',
    });

    logger.info('Advance invoice created', {
      module: 'qop',
      action: 'createAdvanceInvoice',
      invoiceId: invoice._id,
      invoiceNumber,
    });

    return invoiceRepository.findById(invoice._id);
  }

  async createFinalInvoice(data, createdBy, meta = {}) {
    const { default: orderRepository } = await import('./order.repository.js');

    const order = await orderRepository.findById(data.sourceOrderId);
    if (!order) throw new NotFoundError('Order', data.sourceOrderId);

    // 1. Calculate totals on line items (full project value)
    const lineItems = data.lineItems || JSON.parse(JSON.stringify(order.lineItems || []));
    const totals = calculateTotals(
      lineItems,
      data.globalDiscountPercent ?? order.globalDiscountPercent,
      order.currency || 'CHF',
    );

    // 2. Query all ADVANCE invoices for this order/project
    const advances = await invoiceRepository.findAdvancesByProject(order.projectId?._id || order.projectId);
    const orderAdvances = advances.filter(
      (inv) => String(inv.sourceOrderId) === String(order._id),
    );

    // 3. Build advance deductions
    const advanceDeductions = orderAdvances.map((adv) => ({
      advanceInvoiceId: adv._id,
      advanceInvoiceNumber: adv.invoiceNumber,
      advanceInvoiceDate: adv.invoiceDate,
      netAmount: adv.subtotal || 0,
      vatAmount: adv.vatBreakdown?.reduce((s, v) => s + v.amount, 0) || 0,
      totalAmount: adv.grandTotalRounded || 0,
    }));

    // 4. Calculate deduction total
    const advanceDeductionTotal = advanceDeductions.reduce((sum, d) => sum + d.totalAmount, 0);

    // 5. Net subtotal
    const netSubtotal = roundToFiveRappen(totals.grandTotalRounded - advanceDeductionTotal);

    // 6. Validate non-negative balance
    if (netSubtotal < 0) {
      throw new AppError(
        'Final invoice net subtotal is negative — advance deductions exceed total',
        400,
        ERROR_CODES.INVOICE_NEGATIVE_BALANCE,
      );
    }

    const invoiceNumber = await counterService.getNextInvoiceNumber(order.departmentId);

    const invoice = await invoiceRepository.create({
      invoiceNumber,
      invoiceType: 'FINAL',
      sourceOrderId: order._id,
      sourceQuotationId: order.sourceQuotationId || null,
      customerId: order.customerId?._id || order.customerId,
      customerName: order.customerName,
      contactId: order.contactId?._id || order.contactId || null,
      projectId: order.projectId?._id || order.projectId || null,
      departmentId: order.departmentId || null,
      language: order.language,
      title: data.title || 'Final Invoice',
      ...totals,
      currency: order.currency,
      dueDate: data.dueDate,
      paymentTermsDays: data.paymentTermsDays || 30,
      paymentTermsText: data.paymentTermsText || '',
      advanceDeductions,
      advanceDeductionTotal,
      netSubtotal,
      amountDue: netSubtotal,
      createdBy,
    });

    // Link invoice to order
    await orderRepository.addInvoiceId(order._id, invoice._id);

    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.INVOICE_CREATED, {
      invoiceId: invoice._id,
      invoiceNumber,
      invoiceType: 'FINAL',
      sourceOrderId: order._id,
      createdBy,
    }, { source: 'qop:invoices' });

    auditService.logEvent({
      eventType: 'invoice.final_created',
      userId: createdBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: {
        invoiceId: invoice._id,
        invoiceNumber,
        advanceDeductionTotal,
        netSubtotal,
      },
      module: 'qop',
    });

    logger.info('Final invoice created', {
      module: 'qop',
      action: 'createFinalInvoice',
      invoiceId: invoice._id,
      invoiceNumber,
    });

    return invoiceRepository.findById(invoice._id);
  }

  async getById(id) {
    const cacheKey = `qop:invoice:${id}`;
    const invoice = await cacheManager.getOrSet(
      cacheKey,
      () => invoiceRepository.findById(id),
      ENTITY_TTL,
    );
    if (!invoice) throw new NotFoundError('Invoice', id);
    return invoice;
  }

  async list(queryParams) {
    const { cursor, limit, sortBy, sortOrder, search, ...filters } = queryParams;
    const filterKey = Object.entries(filters)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    const cacheKey = `qop:invoices:list:${cursor || ''}:${limit}:${sortBy}:${sortOrder}:${search || ''}:${filterKey}`;

    return cacheManager.getOrSet(
      cacheKey,
      () => invoiceRepository.findWithCursor({ cursor, limit, sortBy, sortOrder, filters, search }),
      LIST_TTL,
    );
  }

  async update(id, data, updatedBy, meta = {}) {
    const existing = await invoiceRepository.findById(id);
    if (!existing) throw new NotFoundError('Invoice', id);

    if (existing.status !== 'DRAFT') {
      throw new AppError(
        'Only DRAFT invoices can be edited',
        400,
        ERROR_CODES.INVOICE_NOT_EDITABLE,
      );
    }

    let totals = {};
    if (data.lineItems?.length) {
      totals = calculateTotals(
        data.lineItems,
        data.globalDiscountPercent ?? existing.globalDiscountPercent,
        data.currency ?? existing.currency,
      );
      totals.amountDue = totals.grandTotalRounded;
    }

    const { version, ...updateData } = data;
    const updated = await invoiceRepository.updateById(id, { ...updateData, ...totals, updatedBy });

    await this._invalidateInvoiceCache(id);
    await this._invalidateListCache();

    auditService.logEvent({
      eventType: 'invoice.updated',
      userId: updatedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { invoiceId: id, changedFields: Object.keys(data) },
      module: 'qop',
    });

    return updated;
  }

  async transitionStatus(id, targetStatus, { reason = null } = {}, userId, meta = {}) {
    const Invoice = (await import('./invoice.model.js')).default;

    const invoice = await Invoice.findById(id);
    if (!invoice) throw new NotFoundError('Invoice', id);

    const currentStatus = invoice.status;

    if (!INVOICE_TRANSITIONS[currentStatus]?.includes(targetStatus)) {
      throw new ConflictError(`Cannot transition invoice from ${currentStatus} to ${targetStatus}`);
    }

    // DRAFT -> SENT requires finalization
    if (currentStatus === 'DRAFT' && targetStatus === 'SENT' && !invoice.sentAt) {
      throw new AppError(
        'Invoice must be finalized before it can be sent',
        400,
        ERROR_CODES.INVOICE_NOT_FINALIZED,
      );
    }

    invoice.status = targetStatus;
    if (targetStatus === 'CANCELLED') {
      invoice.cancelledAt = new Date();
      invoice.cancellationReason = reason || null;
    }
    await invoice.save();

    // Log status transition
    const { default: documentStatusLogService } = await import('./documentStatusLog.service.js');
    await documentStatusLogService.logTransition('invoice', id, currentStatus, targetStatus, userId, reason);

    await this._invalidateInvoiceCache(id);
    await this._invalidateListCache();

    auditService.logEvent({
      eventType: 'invoice.status_changed',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { invoiceId: id, fromStatus: currentStatus, toStatus: targetStatus },
      module: 'qop',
    });

    logger.info('Invoice status changed', {
      module: 'qop',
      action: 'transitionStatus',
      invoiceId: id,
      fromStatus: currentStatus,
      toStatus: targetStatus,
    });

    return {
      invoiceId: id,
      fromStatus: currentStatus,
      toStatus: targetStatus,
    };
  }

  async finalize(id, userId, meta = {}) {
    const Invoice = (await import('./invoice.model.js')).default;

    const invoice = await Invoice.findById(id);
    if (!invoice) throw new NotFoundError('Invoice', id);

    if (invoice.status !== 'DRAFT') {
      throw new AppError(
        'Only DRAFT invoices can be finalized',
        400,
        ERROR_CODES.INVOICE_NOT_EDITABLE,
      );
    }

    if (invoice.sentAt) {
      throw new AppError(
        'Invoice is already finalized',
        400,
        ERROR_CODES.INVOICE_ALREADY_FINALIZED,
      );
    }

    if (!invoice.invoiceDate) {
      invoice.invoiceDate = new Date();
    }

    // Placeholder: generate PDF document
    // await documentGenerator.generateInvoicePdf(invoice);

    invoice.sentAt = null; // Will be set on actual send
    await invoice.save();

    await this._invalidateInvoiceCache(id);

    eventBus.publish(EVENT_TYPES.INVOICE_FINALIZED, {
      invoiceId: id,
      invoiceNumber: invoice.invoiceNumber,
      userId,
    }, { source: 'qop:invoices' });

    auditService.logEvent({
      eventType: 'invoice.finalized',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { invoiceId: id, invoiceNumber: invoice.invoiceNumber },
      module: 'qop',
    });

    logger.info('Invoice finalized', { module: 'qop', action: 'finalize', invoiceId: id });

    return invoiceRepository.findById(id);
  }

  async send(id, userId, meta = {}) {
    const Invoice = (await import('./invoice.model.js')).default;

    const invoice = await Invoice.findById(id);
    if (!invoice) throw new NotFoundError('Invoice', id);

    if (invoice.status !== 'DRAFT') {
      throw new ConflictError(`Cannot send invoice in ${invoice.status} status`);
    }

    invoice.status = 'SENT';
    invoice.sentAt = new Date();
    await invoice.save();

    // Log status transition
    const { default: documentStatusLogService } = await import('./documentStatusLog.service.js');
    await documentStatusLogService.logTransition('invoice', id, 'DRAFT', 'SENT', userId);

    await this._invalidateInvoiceCache(id);
    await this._invalidateListCache();

    // Enqueue email
    await queueManager.addJob('auth-email', 'send-invoice', {
      invoiceId: id,
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
    });

    eventBus.publish(EVENT_TYPES.INVOICE_SENT, {
      invoiceId: id,
      invoiceNumber: invoice.invoiceNumber,
      userId,
    }, { source: 'qop:invoices' });

    auditService.logEvent({
      eventType: 'invoice.sent',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { invoiceId: id, invoiceNumber: invoice.invoiceNumber },
      module: 'qop',
    });

    logger.info('Invoice sent', { module: 'qop', action: 'send', invoiceId: id });

    return invoiceRepository.findById(id);
  }

  async recordPayment(id, paymentData, userId, meta = {}) {
    const Invoice = (await import('./invoice.model.js')).default;

    const invoice = await Invoice.findById(id);
    if (!invoice) throw new NotFoundError('Invoice', id);

    if (['PAID', 'CANCELLED'].includes(invoice.status)) {
      throw new ConflictError(`Cannot record payment on invoice in ${invoice.status} status`);
    }

    const payment = {
      date: paymentData.date,
      amount: paymentData.amount,
      reference: paymentData.reference || '',
      method: paymentData.method || 'bank_transfer',
      note: paymentData.note || '',
      recordedBy: userId,
      recordedAt: new Date(),
    };

    invoice.payments.push(payment);

    // Recalculate paid amounts
    const amountPaid = invoice.payments.reduce((sum, p) => sum + p.amount, 0);
    invoice.amountPaid = amountPaid;

    // For FINAL invoices, amountDue is based on netSubtotal
    const totalDue = invoice.invoiceType === 'FINAL' ? invoice.netSubtotal : invoice.grandTotalRounded;
    invoice.amountDue = Math.max(0, totalDue - amountPaid);

    const previousStatus = invoice.status;

    // Auto-transition status
    if (amountPaid >= totalDue) {
      invoice.status = 'PAID';
      invoice.paidAt = new Date();
    } else if (amountPaid > 0 && invoice.status !== 'PARTIALLY_PAID') {
      invoice.status = 'PARTIALLY_PAID';
    }

    await invoice.save();

    // Log status transition if changed
    if (invoice.status !== previousStatus) {
      const { default: documentStatusLogService } = await import('./documentStatusLog.service.js');
      await documentStatusLogService.logTransition('invoice', id, previousStatus, invoice.status, userId);
    }

    await this._invalidateInvoiceCache(id);
    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.INVOICE_PAYMENT_RECORDED, {
      invoiceId: id,
      invoiceNumber: invoice.invoiceNumber,
      paymentAmount: paymentData.amount,
      totalPaid: invoice.amountPaid,
      amountDue: invoice.amountDue,
      userId,
    }, { source: 'qop:invoices' });

    if (invoice.status === 'PAID') {
      eventBus.publish(EVENT_TYPES.INVOICE_PAID, {
        invoiceId: id,
        invoiceNumber: invoice.invoiceNumber,
        paidAt: invoice.paidAt,
        userId,
      }, { source: 'qop:invoices' });
    }

    auditService.logEvent({
      eventType: 'invoice.payment_recorded',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: {
        invoiceId: id,
        paymentAmount: paymentData.amount,
        totalPaid: invoice.amountPaid,
        newStatus: invoice.status,
      },
      module: 'qop',
    });

    logger.info('Payment recorded', {
      module: 'qop',
      action: 'recordPayment',
      invoiceId: id,
      amount: paymentData.amount,
      totalPaid: invoice.amountPaid,
    });

    return invoiceRepository.findById(id);
  }

  async getPayments(id) {
    const invoice = await invoiceRepository.findById(id);
    if (!invoice) throw new NotFoundError('Invoice', id);
    return invoice.payments || [];
  }

  async getAgingReport(filters = {}) {
    return invoiceRepository.findAgingReport();
  }

  async _invalidateInvoiceCache(id) {
    await cacheManager.del(`qop:invoice:${id}`);
  }

  async _invalidateListCache() {
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}qop:invoices:list:*`);
  }
}

const invoiceService = new InvoiceService();
export default invoiceService;
