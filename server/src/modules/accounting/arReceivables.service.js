import { arPaymentRepository, arPaymentAllocationRepository } from './arPayment.repository.js';
import journalEntryService from './journalEntry.service.js';
import dunningTemplateRepository from './dunningTemplate.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';
import { AppError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

const LIST_TTL = { l1Ttl: 30, l2Ttl: 120 };

class ArReceivablesService {
  async recordPayment(data, userId, meta = {}) {
    const payment = await arPaymentRepository.create({
      ...data,
      unallocatedAmount: data.amount,
      allocatedAmount: 0,
      createdBy: userId,
    });

    // Create journal entry: debit Bank, credit AR
    if (data.bankAccountId) {
      await journalEntryService.createFromEvent(
        'AR_PAYMENT',
        payment._id,
        data.bankAccountId,
        data.customerId, // AR account — placeholder, real mapping in production
        data.amount,
        `AR Payment received - ${data.paymentReference || payment._id}`,
        userId,
      );
    }

    eventBus.publish(EVENT_TYPES.ACCOUNTING_AR_PAYMENT_RECORDED, {
      paymentId: payment._id,
      amount: payment.amount,
      customerId: payment.customerId,
      createdBy: userId,
    }, { source: 'accounting:ar' });

    auditService.logEvent({
      eventType: 'ar_payment.recorded',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { paymentId: payment._id, amount: payment.amount },
      module: 'accounting',
    });

    logger.info('AR payment recorded', { module: 'accounting', action: 'recordPayment', paymentId: payment._id });

    return arPaymentRepository.findById(payment._id);
  }

  async allocatePayment(paymentId, allocations, userId, meta = {}) {
    const payment = await arPaymentRepository.findById(paymentId);
    if (!payment) throw new NotFoundError('ArPayment', paymentId);

    const totalAllocating = allocations.reduce((sum, a) => sum + a.amount, 0);
    if (totalAllocating > payment.unallocatedAmount) {
      throw new AppError(
        'Allocation total exceeds unallocated amount',
        400,
        ERROR_CODES.ACCT_AR_ALLOCATION_EXCEEDS_PAYMENT,
      );
    }

    const results = [];

    for (const alloc of allocations) {
      const allocation = await arPaymentAllocationRepository.create({
        paymentId: payment._id,
        invoiceId: alloc.invoiceId,
        amount: alloc.amount,
        allocatedBy: userId,
      });
      results.push(allocation);

      // Lazy import QOP Invoice model to update payment status
      try {
        const Invoice = (await import('../qop/invoice.model.js')).default;
        const invoice = await Invoice.findById(alloc.invoiceId);
        if (invoice) {
          const newAmountPaid = (invoice.amountPaid || 0) + alloc.amount;
          const newAmountDue = (invoice.totalGross || invoice.totalAmount || 0) - newAmountPaid;
          const updateData = { amountPaid: newAmountPaid, amountDue: newAmountDue };
          if (newAmountDue <= 0) updateData.status = 'PAID';
          else if (newAmountPaid > 0) updateData.status = 'PARTIALLY_PAID';
          await Invoice.findByIdAndUpdate(alloc.invoiceId, { $set: updateData });
        }
      } catch {
        // QOP module may not be available — log and continue
        logger.warn('Could not update QOP invoice for allocation', { invoiceId: alloc.invoiceId });
      }
    }

    // Update payment allocated/unallocated amounts
    const newAllocated = payment.allocatedAmount + totalAllocating;
    const newUnallocated = payment.unallocatedAmount - totalAllocating;
    await arPaymentRepository.updateAllocatedAmount(payment._id, newAllocated, newUnallocated);

    eventBus.publish(EVENT_TYPES.ACCOUNTING_AR_PAYMENT_ALLOCATED, {
      paymentId: payment._id,
      allocations: allocations.map((a) => ({ invoiceId: a.invoiceId, amount: a.amount })),
      userId,
    }, { source: 'accounting:ar' });

    auditService.logEvent({
      eventType: 'ar_payment.allocated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { paymentId: payment._id, allocationCount: allocations.length, totalAllocated: totalAllocating },
      module: 'accounting',
    });

    return results;
  }

  async getOpenReceivables(queryParams) {
    try {
      const Invoice = (await import('../qop/invoice.model.js')).default;
      const { cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', ...filters } = queryParams;

      const filter = { status: { $in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] } };
      if (filters.customerId) filter.customerId = filters.customerId;
      if (filters.dueDateFrom || filters.dueDateTo) {
        filter.dueDate = {};
        if (filters.dueDateFrom) filter.dueDate.$gte = new Date(filters.dueDateFrom);
        if (filters.dueDateTo) filter.dueDate.$lte = new Date(filters.dueDateTo);
      }
      if (filters.amountMin || filters.amountMax) {
        filter.amountDue = {};
        if (filters.amountMin) filter.amountDue.$gte = Number(filters.amountMin);
        if (filters.amountMax) filter.amountDue.$lte = Number(filters.amountMax);
      }
      if (filters.overdue === 'true' || filters.overdue === true) {
        filter.dueDate = { ...filter.dueDate, $lt: new Date() };
      }

      const docs = await Invoice.find(filter)
        .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
        .limit(limit + 1)
        .lean();

      const hasMore = docs.length > limit;
      const data = hasMore ? docs.slice(0, limit) : docs;
      const nextCursor = hasMore && data.length ? data[data.length - 1]._id : null;

      return { data, pagination: { hasMore, nextCursor } };
    } catch {
      logger.warn('QOP Invoice model not available for open receivables');
      return { data: [], pagination: { hasMore: false, nextCursor: null } };
    }
  }

  async getAgingReport() {
    try {
      const Invoice = (await import('../qop/invoice.model.js')).default;
      const now = new Date();

      const invoices = await Invoice.find({
        status: { $in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
      }).lean();

      const buckets = { current: 0, '1_30': 0, '31_60': 0, '61_90': 0, '90_plus': 0 };
      const bucketDetails = { current: [], '1_30': [], '31_60': [], '61_90': [], '90_plus': [] };

      for (const inv of invoices) {
        const dueDate = new Date(inv.dueDate);
        const daysOverdue = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));
        const amount = inv.amountDue || 0;

        if (daysOverdue <= 0) {
          buckets.current += amount;
          bucketDetails.current.push(inv);
        } else if (daysOverdue <= 30) {
          buckets['1_30'] += amount;
          bucketDetails['1_30'].push(inv);
        } else if (daysOverdue <= 60) {
          buckets['31_60'] += amount;
          bucketDetails['31_60'].push(inv);
        } else if (daysOverdue <= 90) {
          buckets['61_90'] += amount;
          bucketDetails['61_90'].push(inv);
        } else {
          buckets['90_plus'] += amount;
          bucketDetails['90_plus'].push(inv);
        }
      }

      return { buckets, totalOutstanding: Object.values(buckets).reduce((s, v) => s + v, 0), invoiceCount: invoices.length };
    } catch {
      logger.warn('QOP Invoice model not available for aging report');
      return { buckets: { current: 0, '1_30': 0, '31_60': 0, '61_90': 0, '90_plus': 0 }, totalOutstanding: 0, invoiceCount: 0 };
    }
  }

  async getSummary() {
    try {
      const Invoice = (await import('../qop/invoice.model.js')).default;
      const now = new Date();

      const outstanding = await Invoice.find({
        status: { $in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
      }).lean();

      const totalOutstanding = outstanding.reduce((sum, inv) => sum + (inv.amountDue || 0), 0);
      const overdue = outstanding.filter((inv) => new Date(inv.dueDate) < now);
      const overdueCount = overdue.length;

      const totalDaysOutstanding = outstanding.reduce((sum, inv) => {
        const days = Math.max(0, Math.floor((now - new Date(inv.createdAt || inv.invoiceDate)) / (1000 * 60 * 60 * 24)));
        return sum + days;
      }, 0);
      const avgDaysOutstanding = outstanding.length ? Math.round(totalDaysOutstanding / outstanding.length) : 0;

      return { totalOutstanding, overdueCount, avgDaysOutstanding, totalInvoices: outstanding.length };
    } catch {
      logger.warn('QOP Invoice model not available for summary');
      return { totalOutstanding: 0, overdueCount: 0, avgDaysOutstanding: 0, totalInvoices: 0 };
    }
  }

  async writeOff(invoiceId, reason, userId, meta = {}) {
    const Invoice = (await import('../qop/invoice.model.js')).default;
    const invoice = await Invoice.findById(invoiceId).lean();
    if (!invoice) throw new NotFoundError('Invoice', invoiceId);

    // Create write-off journal entry
    await journalEntryService.createFromEvent(
      'WRITE_OFF',
      invoiceId,
      invoiceId, // write-off expense account — placeholder
      invoice.customerId, // AR account — placeholder
      invoice.amountDue || 0,
      `Write-off: ${reason}`,
      userId,
    );

    // Update invoice status
    await Invoice.findByIdAndUpdate(invoiceId, { $set: { status: 'WRITTEN_OFF' } });

    auditService.logEvent({
      eventType: 'ar_invoice.written_off',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { invoiceId, reason, amount: invoice.amountDue },
      module: 'accounting',
    });

    logger.info('Invoice written off', { module: 'accounting', action: 'writeOff', invoiceId });

    return { invoiceId, status: 'WRITTEN_OFF', reason };
  }

  async getOverdueForDunning(queryParams) {
    try {
      const Invoice = (await import('../qop/invoice.model.js')).default;
      const { cursor, limit = 25, customerId } = queryParams;
      const now = new Date();

      const filter = {
        status: { $in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
        dueDate: { $lt: now },
      };
      if (customerId) filter.customerId = customerId;

      const invoices = await Invoice.find(filter)
        .sort({ dueDate: 1 })
        .limit(limit + 1)
        .lean();

      const hasMore = invoices.length > limit;
      const data = hasMore ? invoices.slice(0, limit) : invoices;

      // Group by customer
      const grouped = {};
      for (const inv of data) {
        const custId = String(inv.customerId);
        if (!grouped[custId]) grouped[custId] = [];
        grouped[custId].push(inv);
      }

      return { data: grouped, pagination: { hasMore, nextCursor: hasMore && data.length ? data[data.length - 1]._id : null } };
    } catch {
      logger.warn('QOP Invoice model not available for dunning');
      return { data: {}, pagination: { hasMore: false, nextCursor: null } };
    }
  }

  async generateDunningLetters(invoiceIds, level, userId, meta = {}) {
    const template = await dunningTemplateRepository.findByLevel(level);
    if (!template) throw new NotFoundError('DunningTemplate', level);

    const letters = [];
    for (const invoiceId of invoiceIds) {
      letters.push({
        invoiceId,
        level,
        subject: template.subject,
        bodyHtml: template.bodyHtml,
        feeAmount: template.feeAmount,
        generatedAt: new Date(),
        generatedBy: userId,
      });
    }

    eventBus.publish(EVENT_TYPES.ACCOUNTING_AR_DUNNING_GENERATED, {
      invoiceIds,
      level,
      letterCount: letters.length,
      userId,
    }, { source: 'accounting:ar' });

    auditService.logEvent({
      eventType: 'ar_dunning.generated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { invoiceIds, level, letterCount: letters.length },
      module: 'accounting',
    });

    logger.info('Dunning letters generated', { module: 'accounting', action: 'generateDunning', level, count: letters.length });

    return letters;
  }

  async listPayments(queryParams) {
    const { cursor, limit, sortBy, sortOrder, ...filters } = queryParams;
    return arPaymentRepository.findWithCursor({ cursor, limit, sortBy, sortOrder, filters });
  }

  async getPaymentById(id) {
    const payment = await arPaymentRepository.findById(id);
    if (!payment) throw new NotFoundError('ArPayment', id);
    return payment;
  }

  async getDunningTemplates() {
    return dunningTemplateRepository.findAll();
  }

  async updateDunningTemplate(level, data, userId, meta = {}) {
    const template = await dunningTemplateRepository.updateByLevel(level, data);

    auditService.logEvent({
      eventType: 'dunning_template.updated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { level, changedFields: Object.keys(data) },
      module: 'accounting',
    });

    return template;
  }

  async importPayments(payments, userId, meta = {}) {
    const results = [];
    for (const paymentData of payments) {
      const payment = await this.recordPayment({ ...paymentData, source: 'BANK_IMPORT' }, userId, meta);
      results.push(payment);
    }
    return results;
  }

  async exportReceivables(format) {
    const result = await this.getOpenReceivables({ limit: 100000, sortBy: 'createdAt', sortOrder: 'desc' });
    const invoices = result.data || [];

    if (format === 'csv') {
      const header = 'InvoiceId,CustomerId,Amount,AmountDue,DueDate,Status';
      const rows = invoices.map((inv) => [inv._id, inv.customerId, inv.totalGross || inv.totalAmount || 0, inv.amountDue || 0, inv.dueDate ? new Date(inv.dueDate).toISOString().split('T')[0] : '', inv.status].join(','));
      return [header, ...rows].join('\n');
    }

    return { data: invoices, format };
  }
}

const arReceivablesService = new ArReceivablesService();
export default arReceivablesService;
