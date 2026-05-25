import mongoose from 'mongoose';
import { arPaymentRepository, arPaymentAllocationRepository } from './arPayment.repository.js';
import journalEntryService from './journalEntry.service.js';
import accountMappingService, { ACCOUNT_MAPPING } from './accountMapping.service.js';
import dunningTemplateRepository from './dunningTemplate.repository.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { NotFoundError } from '../../shared/errors/AppError.js';
import { AppError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import logger from '../../shared/logger/index.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';

const OPEN_AR_STATUSES = ['SENT', 'PARTIALLY_PAID', 'OVERDUE'];
const AGING_BUCKET_KEYS = ['current', '1_30', '31_60', '61_90', '90_plus'];
const RECEIVABLE_SORT_FIELDS = ['createdAt', 'dueDate', 'invoiceNumber', 'customerName', 'amountDue', '_id'];

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function sumAllocationsByInvoice(allocations) {
  const grouped = new Map();

  for (const allocation of allocations) {
    const invoiceId = String(allocation.invoiceId || '');
    const amount = roundMoney(allocation.amount);
    grouped.set(invoiceId, roundMoney((grouped.get(invoiceId) || 0) + amount));
  }

  return grouped;
}

function normalizeLimit(limit) {
  const parsed = Number(limit) || 25;
  return Math.min(Math.max(parsed, 1), 100);
}

function normalizeSort(sortBy) {
  return RECEIVABLE_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt';
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

function buildAgingPipeline(now = new Date()) {
  return [
    {
      $match: {
        isDeleted: false,
        status: { $in: OPEN_AR_STATUSES },
        amountDue: { $gt: 0 },
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
        totalOutstanding: { $sum: '$amountDue' },
      },
    },
  ];
}

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
      const [bankAccountId, receivableAccountId] = await Promise.all([
        accountMappingService.resolveGlobal(ACCOUNT_MAPPING.BANK_CLEARING),
        accountMappingService.resolveGlobal(ACCOUNT_MAPPING.AR_RECEIVABLE),
      ]);

      await journalEntryService.createFromEvent(
        'AR_PAYMENT',
        payment._id,
        bankAccountId,
        receivableAccountId,
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
    if (!Array.isArray(allocations) || allocations.length === 0) {
      throw new AppError(
        'At least one allocation is required',
        400,
        ERROR_CODES.ACCT_AR_ALLOCATION_EXCEEDS_PAYMENT,
      );
    }

    const groupedAllocations = sumAllocationsByInvoice(allocations);
    const totalAllocating = roundMoney([...groupedAllocations.values()].reduce((sum, amount) => sum + amount, 0));
    if (totalAllocating <= 0) {
      throw new AppError(
        'Allocation total must be greater than zero',
        400,
        ERROR_CODES.ACCT_AR_ALLOCATION_EXCEEDS_PAYMENT,
      );
    }

    const session = await mongoose.startSession();
    const results = [];
    let payment;

    try {
      await session.withTransaction(async () => {
        payment = await arPaymentRepository.findById(paymentId, { session });
        if (!payment) throw new NotFoundError('ArPayment', paymentId);

        if (totalAllocating > roundMoney(payment.unallocatedAmount)) {
          throw new AppError(
            'Allocation total exceeds unallocated amount',
            400,
            ERROR_CODES.ACCT_AR_ALLOCATION_EXCEEDS_PAYMENT,
          );
        }

        const Invoice = (await import('../qop/invoice.model.js')).default;
        const invoiceIds = [...groupedAllocations.keys()];
        const invoices = await Invoice.find({ _id: { $in: invoiceIds } })
          .session(session)
          .lean();
        const invoicesById = new Map(invoices.map((invoice) => [String(invoice._id), invoice]));

        for (const [invoiceId, amount] of groupedAllocations) {
          const invoice = invoicesById.get(invoiceId);
          if (!invoice) throw new NotFoundError('Invoice', invoiceId);

          if (String(invoice.customerId) !== String(payment.customerId)) {
            throw new AppError(
              'Payment customer does not match invoice customer',
              400,
              ERROR_CODES.ACCT_AR_PAYMENT_EXCEEDS_OUTSTANDING,
            );
          }

          if (!OPEN_AR_STATUSES.includes(invoice.status) || roundMoney(invoice.amountDue) <= 0) {
            throw new AppError(
              'Invoice is not open for allocation',
              400,
              ERROR_CODES.ACCT_AR_PAYMENT_EXCEEDS_OUTSTANDING,
            );
          }

          if (amount > roundMoney(invoice.amountDue)) {
            throw new AppError(
              'Allocation exceeds invoice outstanding amount',
              400,
              ERROR_CODES.ACCT_AR_PAYMENT_EXCEEDS_OUTSTANDING,
            );
          }
        }

        const paymentUpdate = await arPaymentRepository.applyAllocationDelta(payment._id, totalAllocating, { session });
        if (paymentUpdate.matchedCount !== 1) {
          throw new AppError(
            'Payment unallocated amount changed during allocation',
            409,
            ERROR_CODES.ACCT_AR_ALLOCATION_EXCEEDS_PAYMENT,
          );
        }

        results.length = 0;
        for (const alloc of allocations) {
          const allocation = await arPaymentAllocationRepository.create({
            paymentId: payment._id,
            invoiceId: alloc.invoiceId,
            amount: roundMoney(alloc.amount),
            allocatedBy: userId,
          }, { session });
          results.push(allocation);
        }

        for (const [invoiceId, amount] of groupedAllocations) {
          const invoice = invoicesById.get(invoiceId);
          const newAmountPaid = roundMoney((invoice.amountPaid || 0) + amount);
          const newAmountDue = roundMoney((invoice.amountDue || 0) - amount);
          const updateData = {
            amountPaid: newAmountPaid,
            amountDue: newAmountDue,
            status: newAmountDue <= 0 ? 'PAID' : 'PARTIALLY_PAID',
          };
          if (newAmountDue <= 0) updateData.paidAt = new Date();

          const invoiceUpdate = await Invoice.updateOne(
            {
              _id: invoiceId,
              isDeleted: false,
              status: { $in: OPEN_AR_STATUSES },
              amountDue: { $gte: amount },
            },
            { $set: updateData },
            { session },
          );

          if (invoiceUpdate.matchedCount !== 1) {
            throw new AppError(
              'Invoice outstanding amount changed during allocation',
              409,
              ERROR_CODES.ACCT_AR_PAYMENT_EXCEEDS_OUTSTANDING,
            );
          }
        }
      });
    } finally {
      await session.endSession();
    }
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
      const safeLimit = normalizeLimit(limit);
      const safeSortBy = normalizeSort(sortBy);
      const safeSortOrder = sortOrder === 'asc' ? 'asc' : 'desc';
      const cursorFilter = coerceCursorFieldTypes(
        buildCursorQuery(cursor, safeSortBy, safeSortOrder),
        safeSortBy,
      );

      const filter = {
        isDeleted: false,
        status: { $in: OPEN_AR_STATUSES },
        amountDue: { $gt: 0 },
        ...cursorFilter,
      };
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
        .sort(buildCursorSort(safeSortBy, safeSortOrder))
        .limit(safeLimit + 1)
        .select('-__v -lineItems -payments -vatBreakdown -advanceDeductions')
        .lean();

      return buildCursorResponse(docs, safeLimit, safeSortBy);
    } catch {
      logger.warn('QOP Invoice model not available for open receivables');
      return { data: [], pagination: { hasMore: false, nextCursor: null } };
    }
  }

  async getAgingReport() {
    try {
      const Invoice = (await import('../qop/invoice.model.js')).default;
      const now = new Date();

      const rows = await Invoice.aggregate(buildAgingPipeline(now));
      return normalizeAgingRows(rows);
    } catch {
      logger.warn('QOP Invoice model not available for aging report');
      const buckets = emptyAgingBuckets();
      return { buckets: { ...buckets, over_90: 0 }, totalOutstanding: 0, invoiceCount: 0 };
    }
  }

  async getSummary() {
    try {
      const Invoice = (await import('../qop/invoice.model.js')).default;
      const now = new Date();

      const [summary] = await Invoice.aggregate([
        {
          $match: {
            isDeleted: false,
            status: { $in: OPEN_AR_STATUSES },
            amountDue: { $gt: 0 },
          },
        },
        {
          $addFields: {
            daysOutstanding: {
              $max: [
                0,
                {
                  $dateDiff: {
                    startDate: { $ifNull: ['$createdAt', '$invoiceDate'] },
                    endDate: now,
                    unit: 'day',
                  },
                },
              ],
            },
            isOverdue: { $lt: ['$dueDate', now] },
          },
        },
        {
          $group: {
            _id: null,
            totalOutstanding: { $sum: '$amountDue' },
            openCount: { $sum: 1 },
            overdueAmount: {
              $sum: { $cond: ['$isOverdue', '$amountDue', 0] },
            },
            overdueCount: {
              $sum: { $cond: ['$isOverdue', 1, 0] },
            },
            totalDaysOutstanding: { $sum: '$daysOutstanding' },
          },
        },
      ]);

      const totalOutstanding = roundMoney(summary?.totalOutstanding || 0);
      const openCount = summary?.openCount || 0;
      const overdueAmount = roundMoney(summary?.overdueAmount || 0);
      const overdueCount = summary?.overdueCount || 0;
      const avgDaysOutstanding = openCount ? Math.round((summary?.totalDaysOutstanding || 0) / openCount) : 0;

      return {
        totalOutstanding,
        openAmount: totalOutstanding,
        openCount,
        overdueAmount,
        overdueCount,
        avgDaysOutstanding,
        totalInvoices: openCount,
      };
    } catch {
      logger.warn('QOP Invoice model not available for summary');
      return { totalOutstanding: 0, overdueCount: 0, avgDaysOutstanding: 0, totalInvoices: 0 };
    }
  }

  async writeOff(invoiceId, reason, userId, meta = {}) {
    const Invoice = (await import('../qop/invoice.model.js')).default;
    const session = await mongoose.startSession();
    let invoice;

    try {
      await session.withTransaction(async () => {
        invoice = await Invoice.findOne({
          _id: invoiceId,
          isDeleted: false,
          status: { $in: OPEN_AR_STATUSES },
          amountDue: { $gt: 0 },
        }).session(session).lean();
        if (!invoice) throw new NotFoundError('Invoice', invoiceId);

        const [writeOffExpenseAccountId, receivableAccountId] = await Promise.all([
          accountMappingService.resolveGlobal(ACCOUNT_MAPPING.WRITE_OFF_EXPENSE, { session }),
          accountMappingService.resolveGlobal(ACCOUNT_MAPPING.AR_RECEIVABLE, { session }),
        ]);

        await journalEntryService.createFromEvent(
          'WRITE_OFF',
          invoiceId,
          writeOffExpenseAccountId,
          receivableAccountId,
          invoice.amountDue || 0,
          `Write-off: ${reason}`,
          userId,
          { session },
        );

        const update = await Invoice.updateOne(
          {
            _id: invoiceId,
            isDeleted: false,
            status: { $in: OPEN_AR_STATUSES },
            amountDue: { $gt: 0 },
          },
          {
            $set: {
              status: 'WRITTEN_OFF',
              amountDue: 0,
              writtenOffAt: new Date(),
              writeOffReason: reason,
            },
          },
          { session },
        );
        if (update.matchedCount !== 1) {
          throw new AppError(
            'Invoice changed while write-off was being posted',
            409,
            ERROR_CODES.ACCT_AR_PAYMENT_EXCEEDS_OUTSTANDING,
          );
        }
      });
    } finally {
      await session.endSession();
    }

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
      const { limit = 25, customerId } = queryParams;
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
    return this.generateDunningLettersWithOutput(invoiceIds, level, {}, userId, meta);
  }

  async _resolveInvoiceRecipient(invoice) {
    if (invoice.contactId) {
      try {
        const Contact = (await import('../crm/contact.model.js')).default;
        const contact = await Contact.findById(invoice.contactId).select('email firstName lastName').lean();
        if (contact?.email) {
          return {
            email: contact.email,
            name: [contact.firstName, contact.lastName].filter(Boolean).join(' '),
          };
        }
      } catch {
        logger.warn('Contact model not available for dunning recipient lookup', {
          module: 'accounting',
          action: 'dunning.recipient',
        });
      }
    }

    try {
      const Customer = (await import('../crm/customer.model.js')).default;
      const customer = await Customer.findById(invoice.customerId).select('email name companyName').lean();
      return {
        email: customer?.email || null,
        name: customer?.companyName || customer?.name || invoice.customerName,
      };
    } catch {
      return { email: null, name: invoice.customerName };
    }
  }

  async generateDunningLettersWithOutput(invoiceIds, level, options = {}, userId, meta = {}) {
    const accountingDocumentOutputService = (await import('./accountingDocumentOutput.service.js')).default;
    const template = await dunningTemplateRepository.findByLevel(level);
    if (!template) throw new NotFoundError('DunningTemplate', level);

    const Invoice = (await import('../qop/invoice.model.js')).default;
    const invoices = await Invoice.find({
      _id: { $in: invoiceIds },
      isDeleted: false,
      status: { $in: OPEN_AR_STATUSES },
      amountDue: { $gt: 0 },
    }).lean();
    if (invoices.length !== invoiceIds.length) {
      const found = new Set(invoices.map((invoice) => String(invoice._id)));
      const missing = invoiceIds.find((id) => !found.has(String(id)));
      throw new NotFoundError('Open invoice for dunning', missing);
    }

    const letters = [];
    for (const invoice of invoices) {
      const recipient = await this._resolveInvoiceRecipient(invoice);
      const templateData = {
        invoice,
        invoiceNumber: invoice.invoiceNumber,
        customerName: recipient.name || invoice.customerName,
        amountDue: roundMoney(invoice.amountDue),
        dueDate: invoice.dueDate,
        level,
        graceDays: template.graceDays,
        feeAmount: template.feeAmount || 0,
        currency: invoice.currency || 'CHF',
      };
      const letter = {
        invoiceId: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        customerId: invoice.customerId,
        customerName: templateData.customerName,
        recipientEmail: recipient.email,
        amountDue: templateData.amountDue,
        dueDate: invoice.dueDate,
        currency: templateData.currency,
        level,
        subject: accountingDocumentOutputService.renderTemplate(template.subject, templateData),
        bodyHtml: accountingDocumentOutputService.renderTemplate(template.bodyHtml, templateData),
        feeAmount: template.feeAmount,
        generatedAt: new Date(),
        generatedBy: userId,
      };
      letters.push(
        options.format === 'pdf' || options.sendEmail
          ? await accountingDocumentOutputService.createDunningOutput(letter, options, userId, meta)
          : letter,
      );
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

  async getCustomerCreditBalance(customerId) {
    return arPaymentRepository.getCustomerCreditBalance(customerId);
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
