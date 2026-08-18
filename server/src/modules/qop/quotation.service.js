import quotationRepository from './quotation.repository.js';
import counterService from './counter.service.js';
import { calculateTotals } from './vatCalculation.js';
import auditService from '../auth/audit.service.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';
import qopDocumentPayloadService from './documentPayload.service.js';

const ENTITY_TTL = { l1Ttl: 60, l2Ttl: 300 };
const LIST_TTL = { l1Ttl: 30, l2Ttl: 120 };

// The status is freely adjustable by hand (client feedback: the full status
// list must be offered in "Status ändern"), so any change to a different
// status is accepted; timestamps are still maintained per target status.
const QUOTATION_STATUSES = [
  'DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED', 'CONVERTED',
];

class QuotationService {
  async create(data, createdBy, meta = {}) {
    const quotationNumber = await counterService.getNextQuotationNumber(data.departmentId);

    // Calculate totals from line items
    const totals = calculateTotals(
      data.lineItems || [],
      data.globalDiscountPercent || 0,
      data.currency || 'CHF',
    );

    // The form lets a quotation be captured directly in a later status
    // (e.g. recorded after it was already sent on paper).
    const statusStamps = {};
    if (data.status === 'SENT') statusStamps.sentAt = new Date();
    if (data.status === 'ACCEPTED') statusStamps.acceptedAt = new Date();
    if (data.status === 'DECLINED') statusStamps.declinedAt = new Date();

    const quotation = await quotationRepository.create({
      ...data,
      ...statusStamps,
      quotationNumber,
      lineItems: totals.lineItems,
      subtotal: totals.subtotal,
      vatBreakdown: totals.vatBreakdown,
      grandTotal: totals.grandTotal,
      roundingAmount: totals.roundingAmount,
      grandTotalRounded: totals.grandTotalRounded,
      createdBy,
    });

    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.QUOTATION_CREATED, {
      quotationId: quotation._id,
      quotationNumber,
      customerId: data.customerId,
      createdBy,
    }, { source: 'qop:quotations' });

    auditService.logEvent({
      eventType: 'quotation.created',
      userId: createdBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { quotationId: quotation._id, quotationNumber },
      module: 'qop',
    });

    logger.info('Quotation created', {
      module: 'qop',
      action: 'create',
      quotationId: quotation._id,
      quotationNumber,
    });

    return quotationRepository.findById(quotation._id);
  }

  async getById(id) {
    const cacheKey = `qop:quotation:${id}`;
    const quotation = await cacheManager.getOrSet(
      cacheKey,
      () => quotationRepository.findById(id),
      ENTITY_TTL,
    );
    if (!quotation) throw new NotFoundError('Quotation', id);
    return quotation;
  }

  async list(queryParams) {
    const { cursor, limit, sortBy, sortOrder, search, ...filters } = queryParams;
    const filterKey = Object.entries(filters)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    const cacheKey = `qop:quotations:list:${cursor || ''}:${limit}:${sortBy}:${sortOrder}:${search || ''}:${filterKey}`;

    return cacheManager.getOrSet(
      cacheKey,
      () => quotationRepository.findWithCursor({ cursor, limit, sortBy, sortOrder, filters, search }),
      LIST_TTL,
    );
  }

  async update(id, data, updatedBy, meta = {}) {
    const existing = await quotationRepository.findById(id);
    if (!existing) throw new NotFoundError('Quotation', id);

    if (existing.status !== 'DRAFT') {
      throw new ConflictError('Only DRAFT quotations can be edited');
    }

    // Optimistic concurrency check
    if (data.version !== undefined && data.version !== existing.version) {
      throw new ConflictError('Quotation has been modified by another user');
    }

    const updateData = { ...data, updatedBy };
    delete updateData.version; // version is incremented via $inc in repository

    // Recalculate totals if line items changed
    if (data.lineItems) {
      const totals = calculateTotals(
        data.lineItems,
        data.globalDiscountPercent ?? existing.globalDiscountPercent,
        data.currency ?? existing.currency,
      );
      updateData.lineItems = totals.lineItems;
      updateData.subtotal = totals.subtotal;
      updateData.vatBreakdown = totals.vatBreakdown;
      updateData.grandTotal = totals.grandTotal;
      updateData.roundingAmount = totals.roundingAmount;
      updateData.grandTotalRounded = totals.grandTotalRounded;
    }

    const updated = await quotationRepository.updateById(id, updateData);
    await this._invalidateQuotationCache(id);
    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.QUOTATION_STATUS_CHANGED, {
      quotationId: id,
      changedFields: Object.keys(data),
      updatedBy,
    }, { source: 'qop:quotations' });

    auditService.logEvent({
      eventType: 'quotation.updated',
      userId: updatedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { quotationId: id, changedFields: Object.keys(data) },
      module: 'qop',
    });

    return updated;
  }

  async softDelete(id, deletedBy, meta = {}) {
    const quotation = await quotationRepository.findById(id);
    if (!quotation) throw new NotFoundError('Quotation', id);

    if (quotation.status !== 'DRAFT') {
      throw new ConflictError('Only DRAFT quotations can be deleted');
    }

    await quotationRepository.softDelete(id);
    await this._invalidateQuotationCache(id);
    await this._invalidateListCache();

    auditService.logEvent({
      eventType: 'quotation.deleted',
      userId: deletedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { quotationId: id, quotationNumber: quotation.quotationNumber },
      module: 'qop',
    });
  }

  async duplicate(id, createdBy, meta = {}) {
    const original = await quotationRepository.findById(id);
    if (!original) throw new NotFoundError('Quotation', id);

    const quotationNumber = await counterService.getNextQuotationNumber(original.departmentId);

    const newQuotation = await quotationRepository.create({
      quotationNumber,
      customerId: original.customerId._id || original.customerId,
      customerName: original.customerName,
      contactId: original.contactId || null,
      projectId: original.projectId?._id || original.projectId || null,
      departmentId: original.departmentId || null,
      status: 'DRAFT',
      language: original.language,
      title: original.title,
      salutation: original.salutation,
      siteId: original.siteId?._id || original.siteId || null,
      billingAddressSource: original.billingAddressSource || 'customer',
      subsidyAmount: original.subsidyAmount,
      subsidyNote: original.subsidyNote,
      clientSideWorks: original.clientSideWorks,
      introduction: original.introduction,
      validFrom: new Date(),
      validUntil: original.validUntil,
      currency: original.currency,
      lineItems: original.lineItems,
      globalDiscountPercent: original.globalDiscountPercent,
      subtotal: original.subtotal,
      vatBreakdown: original.vatBreakdown,
      grandTotal: original.grandTotal,
      roundingAmount: original.roundingAmount,
      grandTotalRounded: original.grandTotalRounded,
      paymentTerms: original.paymentTerms,
      notes: original.notes,
      termsAndConditions: original.termsAndConditions,
      assignedUserId: original.assignedUserId?._id || original.assignedUserId || null,
      sourceQuotationId: original._id,
      createdBy,
    });

    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.QUOTATION_CREATED, {
      quotationId: newQuotation._id,
      quotationNumber,
      originalQuotationId: id,
      createdBy,
    }, { source: 'qop:quotations' });

    auditService.logEvent({
      eventType: 'quotation.duplicated',
      userId: createdBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { originalQuotationId: id, newQuotationId: newQuotation._id, quotationNumber },
      module: 'qop',
    });

    logger.info('Quotation duplicated', {
      module: 'qop',
      action: 'duplicate',
      originalQuotationId: id,
      newQuotationId: newQuotation._id,
    });

    return quotationRepository.findById(newQuotation._id);
  }

  async transitionStatus(id, targetStatus, { reason } = {}, userId, meta = {}) {
    const quotation = await quotationRepository.findById(id);
    if (!quotation) throw new NotFoundError('Quotation', id);

    if (!QUOTATION_STATUSES.includes(targetStatus) || targetStatus === quotation.status) {
      throw new ConflictError(
        `Cannot transition from ${quotation.status} to ${targetStatus}`,
      );
    }

    if (targetStatus === 'SENT' && !quotation.customerId) {
      throw new ConflictError('Cannot send quotation without a customer');
    }

    const updateData = { status: targetStatus, updatedBy: userId };
    if (targetStatus === 'SENT') updateData.sentAt = new Date();
    if (targetStatus === 'ACCEPTED') updateData.acceptedAt = new Date();
    if (targetStatus === 'DECLINED') {
      updateData.declinedAt = new Date();
      updateData.declineReason = reason;
    }

    const updated = await quotationRepository.updateById(id, updateData);
    await this._invalidateQuotationCache(id);
    await this._invalidateListCache();

    // Create DocumentStatusLog entry (lazy import to avoid circular deps)
    try {
      const { default: documentStatusLogService } = await import('./documentStatusLog.service.js');
      await documentStatusLogService.create({
        documentType: 'quotation',
        documentId: id,
        fromStatus: quotation.status,
        toStatus: targetStatus,
        reason,
        changedBy: userId,
      });
    } catch {
      // DocumentStatusLog may not exist yet — non-critical
      logger.debug('DocumentStatusLog not available, skipping', { module: 'qop' });
    }

    eventBus.publish(EVENT_TYPES.QUOTATION_STATUS_CHANGED, {
      quotationId: id,
      fromStatus: quotation.status,
      toStatus: targetStatus,
      userId,
    }, { source: 'qop:quotations' });

    if (targetStatus === 'ACCEPTED') {
      eventBus.publish(EVENT_TYPES.QUOTATION_ACCEPTED, {
        quotationId: id,
        quotationNumber: quotation.quotationNumber,
        acceptedBy: userId,
      }, { source: 'qop:quotations' });
    }

    if (targetStatus === 'EXPIRED') {
      eventBus.publish(EVENT_TYPES.QUOTATION_EXPIRED, {
        quotationId: id,
        quotationNumber: quotation.quotationNumber,
      }, { source: 'qop:quotations' });
    }

    if (['ACCEPTED', 'DECLINED', 'CANCELLED', 'CONVERTED'].includes(targetStatus)) {
      const { default: quotationReminderService } = await import('./quotationReminder.service.js');
      await quotationReminderService.cancelForQuotation(id);
    }

    auditService.logEvent({
      eventType: 'quotation.statusChanged',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { quotationId: id, fromStatus: quotation.status, toStatus: targetStatus },
      module: 'qop',
    });

    return updated;
  }

  async send(id, userId, meta = {}) {
    const updated = await this.transitionStatus(id, 'SENT', {}, userId, meta);
    const payload = await qopDocumentPayloadService.buildQuotationPayload(updated);

    eventBus.publish(EVENT_TYPES.QUOTATION_SENT, {
      quotationId: id,
      quotationNumber: updated.quotationNumber,
      customerId: updated.customerId?._id || updated.customerId,
      customerEmail: payload.recipient.email,
      language: payload.language,
      data: payload.data,
      sentBy: userId,
    }, { source: 'qop:quotations' });

    return updated;
  }

  async generateDocument(id, userId, meta = {}) {
    const quotation = await quotationRepository.findById(id);
    if (!quotation) throw new NotFoundError('Quotation', id);

    const result = await qopDocumentPayloadService.generateDocument({
      documentType: 'quotation',
      documentOrId: quotation,
      generatedBy: userId,
      meta,
    });

    auditService.logEvent({
      eventType: 'quotation.document_generated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { quotationId: id, documentId: result.documentId },
      module: 'qop',
    });

    return result;
  }

  async convertToOrder(id, additionalData, userId, meta = {}) {
    const quotation = await quotationRepository.findById(id);
    if (!quotation) throw new NotFoundError('Quotation', id);

    if (quotation.status === 'CONVERTED') {
      throw new ConflictError('Quotation has already been converted to an order');
    }

    if (quotation.status !== 'ACCEPTED') {
      throw new ConflictError(
        `Cannot convert quotation with status ${quotation.status}. Only ACCEPTED quotations can be converted.`,
      );
    }

    // Lazy import to avoid circular dependencies
    const { default: orderService } = await import('./order.service.js');
    const order = await orderService.createFromQuotation(quotation, additionalData, userId, meta);

    await quotationRepository.updateById(id, {
      status: 'CONVERTED',
      convertedOrderId: order._id,
      updatedBy: userId,
    });
    const { default: quotationReminderService } = await import('./quotationReminder.service.js');
    await quotationReminderService.cancelForQuotation(id);
    await this._invalidateQuotationCache(id);
    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.QUOTATION_CONVERTED, {
      quotationId: id,
      orderId: order._id,
      userId,
    }, { source: 'qop:quotations' });

    auditService.logEvent({
      eventType: 'quotation.converted',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { quotationId: id, orderId: order._id },
      module: 'qop',
    });

    return order;
  }

  // --- Cache helpers ---

  async _invalidateQuotationCache(id) {
    await cacheManager.del(`qop:quotation:${id}`);
  }

  async _invalidateListCache() {
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}qop:quotations:list:*`);
  }
}

const quotationService = new QuotationService();
export default quotationService;
