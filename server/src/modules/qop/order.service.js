import orderRepository from './order.repository.js';
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

const ORDER_TRANSITIONS = {
  CONFIRMED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

class OrderService {
  async create(data, createdBy, meta = {}) {
    const orderNumber = await counterService.getNextOrderNumber(data.departmentId);

    let totals = {};
    if (data.lineItems?.length) {
      totals = calculateTotals(data.lineItems, data.globalDiscountPercent || 0, data.currency || 'CHF');
    }

    const order = await orderRepository.create({
      ...data,
      ...totals,
      orderNumber,
      createdBy,
    });

    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.ORDER_CREATED, {
      orderId: order._id,
      orderNumber,
      customerId: order.customerId,
      createdBy,
    }, { source: 'qop:orders' });

    const createdOrder = await orderRepository.findById(order._id);
    const payload = await qopDocumentPayloadService.buildOrderPayload(createdOrder);
    eventBus.publish(EVENT_TYPES.ORDER_CONFIRMED, {
      orderId: order._id,
      orderNumber,
      customerId: order.customerId,
      customerEmail: payload.recipient.email,
      language: payload.language,
      data: payload.data,
      createdBy,
    }, { source: 'qop:orders' });

    auditService.logEvent({
      eventType: 'order.created',
      userId: createdBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { orderId: order._id, orderNumber },
      module: 'qop',
    });

    logger.info('Order created', { module: 'qop', action: 'create', orderId: order._id, orderNumber });

    return createdOrder;
  }

  async createFromQuotation(quotationId, additionalData, createdBy, meta = {}) {
    // Lazy import to avoid circular dependencies
    const { default: quotationRepository } = await import('./quotation.repository.js');

    // Accept either a quotation object or an id string
    let quotation = (quotationId && typeof quotationId === 'object') ? quotationId : null;
    if (!quotation) {
      quotation = await quotationRepository.findById(quotationId);
    }
    if (!quotation) throw new NotFoundError('Quotation', quotationId);

    const { selectedLineItemIds, ...restAdditional } = additionalData || {};

    const orderNumber = await counterService.getNextOrderNumber(quotation.departmentId);

    let lineItems = JSON.parse(JSON.stringify(quotation.lineItems || []));
    if (selectedLineItemIds?.length) {
      const idSet = new Set(selectedLineItemIds.map(String));
      lineItems = lineItems.filter((li) => idSet.has(String(li._id)));
    }

    const totals = lineItems.length
      ? calculateTotals(lineItems, quotation.globalDiscountPercent || 0, quotation.currency || 'CHF')
      : {};

    const orderData = {
      sourceQuotationId: quotation._id,
      sourceQuotationNumber: quotation.quotationNumber,
      customerId: quotation.customerId?._id || quotation.customerId,
      customerName: quotation.customerName,
      contactId: quotation.contactId?._id || quotation.contactId || null,
      projectId: quotation.projectId?._id || quotation.projectId || null,
      departmentId: quotation.departmentId || null,
      language: quotation.language,
      title: quotation.title,
      lineItems,
      currency: quotation.currency,
      globalDiscountPercent: quotation.globalDiscountPercent,
      ...totals,
      paymentTerms: quotation.paymentTerms || null,
      notes: quotation.notes || null,
      termsAndConditions: quotation.termsAndConditions || null,
      ...restAdditional,
      orderNumber,
      createdBy,
    };

    const order = await orderRepository.create(orderData);

    await this._invalidateListCache();

    const createdOrder = await orderRepository.findById(order._id);
    const payload = await qopDocumentPayloadService.buildOrderPayload(createdOrder);

    eventBus.publish(EVENT_TYPES.ORDER_CREATED, {
      orderId: order._id,
      orderNumber,
      sourceQuotationId: quotation._id,
      createdBy,
    }, { source: 'qop:orders' });

    eventBus.publish(EVENT_TYPES.ORDER_CONFIRMED, {
      orderId: order._id,
      orderNumber,
      customerId: order.customerId,
      customerEmail: payload.recipient.email,
      language: payload.language,
      data: payload.data,
      createdBy,
    }, { source: 'qop:orders' });

    auditService.logEvent({
      eventType: 'order.created_from_quotation',
      userId: createdBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { orderId: order._id, orderNumber, sourceQuotationId: quotation._id },
      module: 'qop',
    });

    logger.info('Order created from quotation', {
      module: 'qop',
      action: 'createFromQuotation',
      orderId: order._id,
      orderNumber,
      sourceQuotationId: quotation._id,
    });

    return createdOrder;
  }

  async generateDocument(id, userId, meta = {}) {
    const order = await orderRepository.findById(id);
    if (!order) throw new NotFoundError('Order', id);

    const result = await qopDocumentPayloadService.generateDocument({
      documentType: 'order',
      documentOrId: order,
      generatedBy: userId,
      meta,
    });

    const Order = (await import('./order.model.js')).default;
    await Order.updateOne(
      { _id: id, isDeleted: { $ne: true } },
      { $set: { orderConfirmationDocId: result.documentId, updatedBy: userId } },
    );

    auditService.logEvent({
      eventType: 'order.document_generated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { orderId: id, documentId: result.documentId },
      module: 'qop',
    });

    return result;
  }

  async getById(id) {
    const cacheKey = `qop:order:${id}`;
    const order = await cacheManager.getOrSet(
      cacheKey,
      () => orderRepository.findById(id),
      ENTITY_TTL,
    );
    if (!order) throw new NotFoundError('Order', id);
    return order;
  }

  async list(queryParams) {
    const { cursor, limit, sortBy, sortOrder, search, ...filters } = queryParams;
    const filterKey = Object.entries(filters)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    const cacheKey = `qop:orders:list:${cursor || ''}:${limit}:${sortBy}:${sortOrder}:${search || ''}:${filterKey}`;

    return cacheManager.getOrSet(
      cacheKey,
      () => orderRepository.findWithCursor({ cursor, limit, sortBy, sortOrder, filters, search }),
      LIST_TTL,
    );
  }

  async update(id, data, updatedBy, meta = {}) {
    const existing = await orderRepository.findById(id);
    if (!existing) throw new NotFoundError('Order', id);

    if (['COMPLETED', 'CANCELLED'].includes(existing.status)) {
      throw new ConflictError(`Cannot update order in ${existing.status} status`);
    }

    if (data.version !== undefined && data.version !== existing.version) {
      throw new ConflictError('Order version mismatch — another user may have updated this order');
    }

    let totals = {};
    if (data.lineItems?.length) {
      totals = calculateTotals(
        data.lineItems,
        data.globalDiscountPercent ?? existing.globalDiscountPercent,
        data.currency ?? existing.currency,
      );
    }

    const updateData = { ...data };
    delete updateData.version;
    const updated = await orderRepository.updateById(id, { ...updateData, ...totals, updatedBy });

    await this._invalidateOrderCache(id);
    await this._invalidateListCache();

    auditService.logEvent({
      eventType: 'order.updated',
      userId: updatedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { orderId: id, changedFields: Object.keys(data) },
      module: 'qop',
    });

    return updated;
  }

  async softDelete(id, deletedBy, meta = {}) {
    const existing = await orderRepository.findById(id);
    if (!existing) throw new NotFoundError('Order', id);

    if (existing.status !== 'CONFIRMED') {
      throw new ConflictError('Only CONFIRMED orders can be deleted before work starts');
    }

    const { default: invoiceRepository } = await import('./invoice.repository.js');
    const linkedInvoices = await invoiceRepository.findByOrderId(id);
    if ((existing.invoiceIds?.length || 0) > 0 || linkedInvoices.length > 0) {
      throw new ConflictError('Orders with invoices cannot be deleted');
    }

    await orderRepository.softDelete(id);
    await this._invalidateOrderCache(id);
    await this._invalidateListCache();

    auditService.logEvent({
      eventType: 'order.deleted',
      userId: deletedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { orderId: id, orderNumber: existing.orderNumber },
      module: 'qop',
    });

    logger.info('Order deleted', {
      module: 'qop',
      action: 'softDelete',
      orderId: id,
      orderNumber: existing.orderNumber,
    });
  }

  async transitionStatus(id, targetStatus, { reason = null } = {}, userId, meta = {}) {
    const Order = (await import('./order.model.js')).default;

    const order = await Order.findById(id);
    if (!order) throw new NotFoundError('Order', id);

    const currentStatus = order.status;

    if (!ORDER_TRANSITIONS[currentStatus]?.includes(targetStatus)) {
      throw new ConflictError(`Cannot transition order from ${currentStatus} to ${targetStatus}`);
    }

    order.status = targetStatus;
    await order.save();

    // Log status transition
    const { default: documentStatusLogService } = await import('./documentStatusLog.service.js');
    await documentStatusLogService.logTransition('order', id, currentStatus, targetStatus, userId, reason);

    await this._invalidateOrderCache(id);
    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.ORDER_STATUS_CHANGED, {
      orderId: id,
      fromStatus: currentStatus,
      toStatus: targetStatus,
      reason,
      changedBy: userId,
    }, { source: 'qop:orders' });

    auditService.logEvent({
      eventType: 'order.status_changed',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { orderId: id, fromStatus: currentStatus, toStatus: targetStatus },
      module: 'qop',
    });

    logger.info('Order status changed', {
      module: 'qop',
      action: 'transitionStatus',
      orderId: id,
      fromStatus: currentStatus,
      toStatus: targetStatus,
    });

    return {
      orderId: id,
      fromStatus: currentStatus,
      toStatus: targetStatus,
    };
  }

  async _invalidateOrderCache(id) {
    await cacheManager.del(`qop:order:${id}`);
  }

  async _invalidateListCache() {
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}qop:orders:list:*`);
  }
}

const orderService = new OrderService();
export default orderService;
