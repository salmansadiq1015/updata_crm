import invoiceRepository from './invoice.repository.js';
import counterService from './counter.service.js';
import { calculateTotals, roundToFiveRappen } from './vatCalculation.js';
import fiscalPeriodService from '../accounting/fiscalPeriod.service.js';
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
  DRAFT: ['FINALIZED', 'SENT', 'CANCELLED'],
  FINALIZED: ['SENT', 'CANCELLED'],
  SENT: ['PARTIALLY_PAID', 'PAID', 'OVERDUE', 'WRITTEN_OFF'],
  PARTIALLY_PAID: ['PAID', 'OVERDUE', 'WRITTEN_OFF'],
  PAID: [],
  OVERDUE: ['PARTIALLY_PAID', 'PAID', 'WRITTEN_OFF'],
  CANCELLED: [],
  WRITTEN_OFF: [],
};

function isFinalizedInvoice(invoice) {
  return Boolean(invoice.pdfDocumentId || invoice.pdfGeneratedAt || invoice.qrBillReference || invoice.sentAt);
}

function buildCreditNoteTotals(sourceInvoice, lineItems) {
  const sourceTotal = sourceInvoice.invoiceType === 'FINAL'
    ? sourceInvoice.netSubtotal || sourceInvoice.amountDue || 0
    : sourceInvoice.grandTotalRounded || sourceInvoice.amountDue || 0;

  if (!lineItems?.length) {
    const subtotal = -Math.abs(sourceInvoice.subtotal || sourceTotal);
    const vatBreakdown = (sourceInvoice.vatBreakdown || []).map((vat) => ({
      rate: vat.rate,
      base: -Math.abs(vat.base || 0),
      amount: -Math.abs(vat.amount || 0),
    }));
    const vatTotal = vatBreakdown.reduce((sum, vat) => sum + vat.amount, 0);
    const grandTotal = Math.round((subtotal + vatTotal) * 100) / 100;
    const grandTotalRounded = sourceInvoice.currency === 'CHF' ? roundToFiveRappen(grandTotal) : grandTotal;

    return {
      lineItems: (sourceInvoice.lineItems || []).map((item) => ({
        ...item,
        lineTotal: -Math.abs(item.lineTotal || ((item.quantity || 0) * (item.unitPrice || 0))),
      })),
      subtotal,
      vatBreakdown,
      grandTotal,
      roundingAmount: Math.round((grandTotalRounded - grandTotal) * 100) / 100,
      grandTotalRounded,
      amountDue: grandTotalRounded,
    };
  }

  const totals = calculateTotals(lineItems, 0, sourceInvoice.currency || 'CHF');
  return {
    ...totals,
    lineItems: totals.lineItems.map((item) => ({ ...item, lineTotal: -Math.abs(item.lineTotal) })),
    subtotal: -Math.abs(totals.subtotal),
    vatBreakdown: totals.vatBreakdown.map((vat) => ({
      ...vat,
      base: -Math.abs(vat.base),
      amount: -Math.abs(vat.amount),
    })),
    grandTotal: -Math.abs(totals.grandTotal),
    roundingAmount: -Math.abs(totals.roundingAmount || 0),
    grandTotalRounded: -Math.abs(totals.grandTotalRounded),
    amountDue: -Math.abs(totals.grandTotalRounded),
  };
}

function roundQuantity(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 10000) / 10000;
}

function getSourceOrderLinePosition(lineItem) {
  const position = Number(lineItem?.sourceOrderLinePosition ?? lineItem?.position);
  return Number.isInteger(position) && position > 0 ? position : null;
}

function buildLineSelectionMap(lineSelections = []) {
  const selections = new Map();
  for (const selection of lineSelections) {
    const position = Number(selection.sourceOrderLinePosition);
    if (!Number.isInteger(position) || position < 1) {
      throw new ConflictError('Invalid source order line position');
    }
    if (selections.has(position)) {
      throw new ConflictError(`Duplicate order line selection for position ${position}`);
    }
    selections.set(position, selection.quantity === undefined ? null : roundQuantity(selection.quantity));
  }
  return selections;
}

function calculateInvoicedOrderLineQuantities(invoices = []) {
  const invoicedByPosition = new Map();

  for (const invoice of invoices) {
    if (!invoice || invoice.isDeleted || invoice.status === 'CANCELLED' || invoice.invoiceType === 'ADVANCE') {
      continue;
    }

    const sign = invoice.invoiceType === 'CREDIT_NOTE' ? -1 : 1;
    for (const lineItem of invoice.lineItems || []) {
      const sourcePosition = getSourceOrderLinePosition(lineItem);
      if (!sourcePosition) continue;

      const current = invoicedByPosition.get(sourcePosition) || 0;
      invoicedByPosition.set(
        sourcePosition,
        roundQuantity(current + sign * roundQuantity(lineItem.quantity)),
      );
    }
  }

  return invoicedByPosition;
}

function buildOrderInvoiceLines(order, existingInvoices, lineSelections) {
  const orderLines = order.lineItems || [];
  const selections = lineSelections?.length ? buildLineSelectionMap(lineSelections) : null;
  const invoicedByPosition = calculateInvoicedOrderLineQuantities(existingInvoices);
  const selectedLines = [];
  const availability = [];

  for (const orderLine of orderLines) {
    const sourcePosition = Number(orderLine.position);
    if (!Number.isInteger(sourcePosition) || sourcePosition < 1) continue;

    const orderedQuantity = roundQuantity(orderLine.quantity);
    const invoicedQuantity = Math.max(0, roundQuantity(invoicedByPosition.get(sourcePosition) || 0));
    const remainingQuantity = Math.max(0, roundQuantity(orderedQuantity - invoicedQuantity));
    const requestedQuantity = selections?.has(sourcePosition)
      ? selections.get(sourcePosition) ?? remainingQuantity
      : remainingQuantity;

    availability.push({
      sourceOrderLinePosition: sourcePosition,
      description: orderLine.description,
      orderedQuantity,
      invoicedQuantity,
      remainingQuantity,
      isFullyInvoiced: remainingQuantity <= 0,
    });

    if (selections && !selections.has(sourcePosition)) continue;
    if (requestedQuantity <= 0) continue;
    if (requestedQuantity > remainingQuantity) {
      throw new ConflictError(
        `Order line ${sourcePosition} has only ${remainingQuantity} remaining, requested ${requestedQuantity}`,
      );
    }

    selectedLines.push({
      ...orderLine,
      position: selectedLines.length + 1,
      quantity: requestedQuantity,
      sourceOrderLinePosition: sourcePosition,
      sourceOrderLineQuantity: orderedQuantity,
    });
  }

  if (selections) {
    for (const sourcePosition of selections.keys()) {
      if (!availability.some((line) => line.sourceOrderLinePosition === sourcePosition)) {
        throw new ConflictError(`Order line ${sourcePosition} does not exist on this order`);
      }
    }
  }

  return { lineItems: selectedLines, availability };
}

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

  async createFromOrder(data, createdBy, meta = {}) {
    const { default: orderRepository } = await import('./order.repository.js');

    const order = await orderRepository.findById(data.sourceOrderId);
    if (!order) throw new NotFoundError('Order', data.sourceOrderId);
    if (order.status === 'CANCELLED') {
      throw new ConflictError('Cannot create an invoice from a cancelled order');
    }

    const existingInvoices = await invoiceRepository.findByOrderId(order._id);
    const { lineItems } = buildOrderInvoiceLines(order, existingInvoices, data.lineSelections);
    if (!lineItems.length) {
      throw new ConflictError('No remaining order line quantity is available to invoice');
    }

    const totals = calculateTotals(
      lineItems,
      data.globalDiscountPercent ?? order.globalDiscountPercent ?? 0,
      order.currency || 'CHF',
    );
    const invoiceNumber = await counterService.getNextInvoiceNumber(order.departmentId);

    const invoice = await invoiceRepository.create({
      invoiceNumber,
      invoiceType: 'STANDARD',
      sourceOrderId: order._id,
      sourceQuotationId: order.sourceQuotationId || null,
      customerId: order.customerId?._id || order.customerId,
      customerName: order.customerName,
      contactId: order.contactId?._id || order.contactId || null,
      projectId: order.projectId?._id || order.projectId || null,
      departmentId: order.departmentId || null,
      language: order.language,
      title: data.title || `Invoice for order ${order.orderNumber}`,
      ...totals,
      currency: order.currency,
      globalDiscountPercent: data.globalDiscountPercent ?? order.globalDiscountPercent ?? 0,
      dueDate: data.dueDate,
      paymentTermsDays: data.paymentTermsDays || 30,
      paymentTermsText: data.paymentTermsText ?? order.paymentTerms ?? '',
      amountDue: totals.grandTotalRounded,
      createdBy,
    });

    await orderRepository.addInvoiceId(order._id, invoice._id);
    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.INVOICE_CREATED, {
      invoiceId: invoice._id,
      invoiceNumber,
      invoiceType: 'STANDARD',
      sourceOrderId: order._id,
      createdBy,
    }, { source: 'qop:invoices' });

    auditService.logEvent({
      eventType: 'invoice.created_from_order',
      userId: createdBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: {
        invoiceId: invoice._id,
        invoiceNumber,
        sourceOrderId: order._id,
        lineCount: lineItems.length,
      },
      module: 'qop',
    });

    logger.info('Invoice created from order', {
      module: 'qop',
      action: 'createFromOrder',
      invoiceId: invoice._id,
      invoiceNumber,
      sourceOrderId: order._id,
    });

    return invoiceRepository.findById(invoice._id);
  }

  async createFromQuotation(data, createdBy, meta = {}) {
    const { default: quotationRepository } = await import('./quotation.repository.js');

    const quotation = await quotationRepository.findById(data.sourceQuotationId);
    if (!quotation) throw new NotFoundError('Quotation', data.sourceQuotationId);
    if (!['ACCEPTED', 'CONVERTED'].includes(quotation.status)) {
      throw new ConflictError(
        `Cannot create an invoice from quotation in ${quotation.status} status`,
      );
    }

    const lineItems = (quotation.lineItems || []).map((item, index) => ({
      position: item.position || index + 1,
      articleNumber: item.articleNumber || '',
      catalogItemId: item.catalogItemId || null,
      catalogSnapshot: item.catalogSnapshot || null,
      description: item.description,
      unit: item.unit || 'pcs',
      quantity: item.quantity || 0,
      unitPrice: item.unitPrice || 0,
      discountPercent: item.discountPercent || 0,
      vatRate: item.vatRate || 0,
    }));
    if (!lineItems.length) {
      throw new ConflictError('Quotation has no invoiceable line items');
    }

    const totals = calculateTotals(
      lineItems,
      data.globalDiscountPercent ?? quotation.globalDiscountPercent ?? 0,
      quotation.currency || 'CHF',
    );
    const invoiceNumber = await counterService.getNextInvoiceNumber(quotation.departmentId);

    const invoice = await invoiceRepository.create({
      invoiceNumber,
      invoiceType: 'STANDARD',
      sourceQuotationId: quotation._id,
      customerId: quotation.customerId?._id || quotation.customerId,
      customerName: quotation.customerName,
      contactId: quotation.contactId?._id || quotation.contactId || null,
      projectId: quotation.projectId?._id || quotation.projectId || null,
      departmentId: quotation.departmentId || null,
      language: quotation.language,
      title: data.title || `Invoice for quotation ${quotation.quotationNumber}`,
      ...totals,
      currency: quotation.currency,
      globalDiscountPercent: data.globalDiscountPercent ?? quotation.globalDiscountPercent ?? 0,
      dueDate: data.dueDate,
      paymentTermsDays: data.paymentTermsDays || 30,
      paymentTermsText: data.paymentTermsText ?? quotation.paymentTerms ?? '',
      amountDue: totals.grandTotalRounded,
      createdBy,
    });

    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.INVOICE_CREATED, {
      invoiceId: invoice._id,
      invoiceNumber,
      invoiceType: 'STANDARD',
      sourceQuotationId: quotation._id,
      createdBy,
    }, { source: 'qop:invoices' });

    auditService.logEvent({
      eventType: 'invoice.created_from_quotation',
      userId: createdBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: {
        invoiceId: invoice._id,
        invoiceNumber,
        sourceQuotationId: quotation._id,
      },
      module: 'qop',
    });

    logger.info('Invoice created from quotation', {
      module: 'qop',
      action: 'createFromQuotation',
      invoiceId: invoice._id,
      invoiceNumber,
      sourceQuotationId: quotation._id,
    });

    return invoiceRepository.findById(invoice._id);
  }

  async createAdvanceInvoice(data, createdBy, meta = {}) {
    const { default: orderRepository } = await import('./order.repository.js');

    const order = await orderRepository.findById(data.sourceOrderId);
    if (!order) throw new NotFoundError('Order', data.sourceOrderId);

    // Support percentage OR fixed amount
    if (!data.milestonePercent && !data.milestoneAmount) {
      throw new ConflictError('Either milestonePercent or milestoneAmount is required');
    }

    let advanceAmount;
    if (data.milestoneAmount && data.milestoneAmount > 0) {
      advanceAmount = roundToFiveRappen(data.milestoneAmount);
      if (!data.milestonePercent) {
        data.milestonePercent = order.grandTotalRounded > 0
          ? Math.round((advanceAmount / order.grandTotalRounded) * 10000) / 100
          : 0;
      }
    } else {
      if (!data.milestonePercent || data.milestonePercent <= 0 || data.milestonePercent > 100) {
        throw new ConflictError('milestonePercent must be between 1 and 100');
      }
      // Validate total advance does not exceed 100%
      const existingAdvances = await invoiceRepository.findAdvancesByProject(order.projectId);
      const existingPercent = existingAdvances.reduce((sum, inv) => sum + (inv.milestonePercent || 0), 0);
      if (existingPercent + data.milestonePercent > 100) {
        throw new ConflictError(
          `Total advance percentage would exceed 100% (existing: ${existingPercent}%, requested: ${data.milestonePercent}%)`,
        );
      }
      advanceAmount = roundToFiveRappen(order.grandTotalRounded * data.milestonePercent / 100);
    }

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

    // Mark all advance invoices for this order as DEDUCTED
    if (orderAdvances.length > 0) {
      const Invoice = (await import('./invoice.model.js')).default;
      await Invoice.updateMany(
        { _id: { $in: orderAdvances.map((a) => a._id) } },
        { $set: { isDeducted: true } },
      );
    }

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

  async createCreditNote(originalInvoiceId, data = {}, createdBy, meta = {}) {
    const Invoice = (await import('./invoice.model.js')).default;
    const original = await Invoice.findOne({
      _id: originalInvoiceId,
      isDeleted: false,
      invoiceType: { $ne: 'CREDIT_NOTE' },
    }).lean();
    if (!original) throw new NotFoundError('Invoice', originalInvoiceId);
    if (original.status === 'DRAFT') {
      throw new ConflictError('Draft invoices can be deleted or edited; credit notes require a finalized invoice');
    }
    if (original.status === 'CANCELLED') {
      throw new ConflictError('Invoice is already cancelled');
    }

    const invoiceNumber = await counterService.getNextInvoiceNumber(original.departmentId);
    const creditTotals = buildCreditNoteTotals(original, data.lineItems);
    const creditNote = await invoiceRepository.create({
      invoiceNumber,
      invoiceType: 'CREDIT_NOTE',
      sourceOrderId: original.sourceOrderId || null,
      sourceQuotationId: original.sourceQuotationId || null,
      creditNoteForInvoiceId: original._id,
      customerId: original.customerId,
      customerName: original.customerName,
      contactId: original.contactId || null,
      projectId: original.projectId || null,
      departmentId: original.departmentId || null,
      language: original.language || 'de',
      title: data.title || `Credit note for ${original.invoiceNumber}`,
      currency: original.currency || 'CHF',
      dueDate: data.dueDate || new Date(),
      paymentTermsDays: 0,
      paymentTermsText: data.reason || `Credit note for invoice ${original.invoiceNumber}`,
      ...creditTotals,
      createdBy,
    });

    if (data.cancelOriginal !== false) {
      const update = await Invoice.updateOne(
        {
          _id: original._id,
          isDeleted: false,
          status: { $ne: 'CANCELLED' },
        },
        {
          $set: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancellationReason: data.reason || `Cancelled by credit note ${invoiceNumber}`,
            updatedBy: createdBy,
          },
          $inc: { version: 1 },
        },
      );
      if (update.matchedCount !== 1) {
        throw new ConflictError('Original invoice changed while credit note was being created');
      }
    }

    await this._invalidateInvoiceCache(original._id);
    await this._invalidateListCache();

    auditService.logEvent({
      eventType: 'invoice.credit_note_created',
      userId: createdBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: {
        originalInvoiceId,
        creditNoteId: creditNote._id,
        creditNoteNumber: invoiceNumber,
        cancelledOriginal: data.cancelOriginal !== false,
      },
      module: 'qop',
    });

    logger.info('Credit note created', {
      module: 'qop',
      action: 'createCreditNote',
      originalInvoiceId,
      creditNoteId: creditNote._id,
    });

    return invoiceRepository.findById(creditNote._id);
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

    if (existing.status !== 'DRAFT' || isFinalizedInvoice(existing)) {
      throw new AppError(
        'Only unfinalized DRAFT invoices can be edited',
        400,
        ERROR_CODES.INVOICE_NOT_EDITABLE,
      );
    }

    if (data.version !== undefined && data.version !== existing.version) {
      throw new ConflictError('Invoice version mismatch - another user may have updated this invoice');
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

    const { version: _version, ...updateData } = data;
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

  async softDelete(id, deletedBy, meta = {}) {
    const invoice = await invoiceRepository.findById(id);
    if (!invoice) throw new NotFoundError('Invoice', id);

    if (invoice.status !== 'DRAFT' || isFinalizedInvoice(invoice)) {
      throw new AppError(
        'Only unfinalized DRAFT invoices can be deleted',
        400,
        ERROR_CODES.INVOICE_NOT_EDITABLE,
      );
    }

    await invoiceRepository.softDelete(id);
    await this._invalidateInvoiceCache(id);
    await this._invalidateListCache();

    auditService.logEvent({
      eventType: 'invoice.deleted',
      userId: deletedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { invoiceId: id, invoiceNumber: invoice.invoiceNumber },
      module: 'qop',
    });

    logger.info('Invoice deleted', {
      module: 'qop',
      action: 'softDelete',
      invoiceId: id,
      invoiceNumber: invoice.invoiceNumber,
    });
  }

  async transitionStatus(id, targetStatus, { reason = null } = {}, userId, meta = {}) {
    const Invoice = (await import('./invoice.model.js')).default;

    const invoice = await Invoice.findById(id);
    if (!invoice) throw new NotFoundError('Invoice', id);

    const currentStatus = invoice.status;

    if (!INVOICE_TRANSITIONS[currentStatus]?.includes(targetStatus)) {
      throw new ConflictError(`Cannot transition invoice from ${currentStatus} to ${targetStatus}`);
    }

    // A not-yet-sent invoice (draft or finalized) can still be cancelled
    // directly; once sent it can only be reversed with a credit note.
    if (targetStatus === 'CANCELLED' && !['DRAFT', 'FINALIZED'].includes(currentStatus)) {
      throw new ConflictError('Sent invoices can only be cancelled by issuing a credit note');
    }
    if (targetStatus === 'WRITTEN_OFF' && !reason) {
      throw new ConflictError('Write-off reason is required');
    }

    // DRAFT -> SENT requires finalization
    if (currentStatus === 'DRAFT' && targetStatus === 'SENT' && !isFinalizedInvoice(invoice)) {
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
    if (targetStatus === 'WRITTEN_OFF') {
      invoice.writtenOffAt = new Date();
      invoice.writeOffReason = reason;
      invoice.amountDue = 0;
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

    if (invoice.status !== 'DRAFT' || isFinalizedInvoice(invoice)) {
      throw new AppError(
        'Only unfinalized DRAFT invoices can be finalized',
        400,
        ERROR_CODES.INVOICE_NOT_EDITABLE,
      );
    }

    if (!invoice.invoiceDate) {
      invoice.invoiceDate = new Date();
    }

    await fiscalPeriodService.assertPostingDateOpen(invoice.invoiceDate);

    // Move the draft into the finalized state so it visibly leaves "Entwurf"
    // and can no longer be edited; sending later transitions it to SENT.
    invoice.status = 'FINALIZED';
    await invoice.save();

    await this._generateDoctplInvoicePdf(id, userId, meta);

    await this._invalidateInvoiceCache(id);
    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.INVOICE_FINALIZED, {
      invoiceId: id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      totalAmount: invoice.invoiceType === 'FINAL' ? invoice.netSubtotal : invoice.grandTotalRounded,
      totalGross: invoice.grandTotalRounded,
      vatBreakdown: invoice.vatBreakdown || [],
      customerId: invoice.customerId,
      customerName: invoice.customerName,
      currency: invoice.currency,
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

  async generatePdf(id, userId, meta = {}) {
    const result = await this._generateDoctplInvoicePdf(id, userId, meta);
    await this._invalidateInvoiceCache(id);
    await this._invalidateListCache();
    return result;
  }

  async send(id, userId, meta = {}) {
    const Invoice = (await import('./invoice.model.js')).default;

    const invoice = await Invoice.findById(id);
    if (!invoice) throw new NotFoundError('Invoice', id);

    // A draft can be sent directly (it is finalized on the fly below); a
    // finalized invoice is simply sent.
    if (!['DRAFT', 'FINALIZED'].includes(invoice.status)) {
      throw new ConflictError(`Cannot send invoice in ${invoice.status} status`);
    }
    const fromStatus = invoice.status;

    if (!invoice.pdfDocumentId) {
      await this._generateDoctplInvoicePdf(id, userId, meta);
      await this._invalidateInvoiceCache(id);
    }

    invoice.status = 'SENT';
    invoice.sentAt = new Date();
    await invoice.save();

    // Log status transition
    const { default: documentStatusLogService } = await import('./documentStatusLog.service.js');
    await documentStatusLogService.logTransition('invoice', id, fromStatus, 'SENT', userId);

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

    await fiscalPeriodService.assertPostingDateOpen(payment.date);

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
      amount: paymentData.amount,
      paymentAmount: paymentData.amount,
      paymentDate: paymentData.date,
      totalPaid: invoice.amountPaid,
      amountDue: invoice.amountDue,
      currency: invoice.currency,
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

  async getAgingReport(_filters = {}) {
    return invoiceRepository.findAgingReport();
  }

  async getBillingPlan(orderId) {
    const { default: orderRepository } = await import('./order.repository.js');
    const order = await orderRepository.findById(orderId);
    if (!order) throw new NotFoundError('Order', orderId);

    const orderInvoices = await invoiceRepository.findByOrderId(order._id);
    const advances = await invoiceRepository.findAdvancesByProject(
      order.projectId?._id || order.projectId,
    );
    const orderAdvances = advances.filter(
      (inv) => String(inv.sourceOrderId) === String(order._id),
    );
    const { availability } = buildOrderInvoiceLines(order, orderInvoices, null);

    const projectTotal = order.grandTotalRounded || 0;
    const advancesInvoiced = orderAdvances.reduce((s, a) => s + (a.grandTotalRounded || 0), 0);
    const percentInvoiced = projectTotal > 0
      ? Math.round((advancesInvoiced / projectTotal) * 10000) / 100
      : 0;

    return {
      orderId: order._id,
      orderNumber: order.orderNumber,
      projectTotal,
      advancesInvoiced: roundToFiveRappen(advancesInvoiced),
      remainingForFinal: roundToFiveRappen(projectTotal - advancesInvoiced),
      percentInvoiced,
      lineItems: availability,
      remainingLineCount: availability.filter((line) => !line.isFullyInvoiced).length,
      isFullyInvoiced: availability.length > 0 && availability.every((line) => line.isFullyInvoiced),
      advances: orderAdvances.map((a) => ({
        _id: a._id,
        invoiceNumber: a.invoiceNumber,
        invoiceDate: a.invoiceDate,
        milestonePercent: a.milestonePercent,
        milestoneDescription: a.milestoneDescription,
        grandTotalRounded: a.grandTotalRounded,
        status: a.status,
        isDeducted: a.isDeducted || false,
      })),
    };
  }

  async _invalidateInvoiceCache(id) {
    await cacheManager.del(`qop:invoice:${id}`);
  }

  async _generateDoctplInvoicePdf(id, userId, meta = {}) {
    const { default: qopDocumentPayloadService } = await import('./documentPayload.service.js');
    const result = await qopDocumentPayloadService.generateDocument({
      documentType: 'invoice',
      documentOrId: id,
      generatedBy: userId,
      meta,
    });

    const Invoice = (await import('./invoice.model.js')).default;
    await Invoice.updateOne(
      { _id: id },
      {
        $set: {
          pdfDocumentId: result.documentId,
          pdfGeneratedAt: new Date(),
          qrBillReference: result.document?.metadata?.documentNumber || result.document?.metadata?.qrReference || undefined,
        },
        $inc: { version: 1 },
      },
    );

    return {
      ...result,
      documentId: result.documentId,
      generatedDocumentId: result.documentId,
    };
  }

  async _invalidateListCache() {
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}qop:invoices:list:*`);
  }
}

const invoiceService = new InvoiceService();
export default invoiceService;
