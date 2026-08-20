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
      siteId: quotation.siteId?._id || quotation.siteId || null,
      billingAddressSource: quotation.billingAddressSource || 'customer',
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
      async () => {
        const doc = await orderRepository.findById(id);
        if (!doc) return null;
        // Surface the site's billing address (Rechnungsadresse) and ownership
        // (Eigentümer) so the order detail can show them alongside the customer.
        const parties = await this._resolveSiteParties(doc.projectId, doc.siteId);
        return { ...doc, ...parties };
      },
      ENTITY_TTL,
    );
    if (!order) throw new NotFoundError('Order', id);
    return order;
  }

  // Resolve the parties attached to the order's site (via its project). Returns
  // only parties that actually carry content; failures are non-fatal.
  async _resolveSiteParties(projectId, directSiteId = null) {
    const empty = { siteBillingAddress: null, siteOwnership: null, siteManagement: null };
    const pid = projectId && typeof projectId === 'object' ? projectId._id : projectId;
    // An order carrying its own site (Objekt-first quotations) wins over the
    // project route, which stays as fallback for older records.
    let sid = directSiteId && typeof directSiteId === 'object' ? directSiteId._id : directSiteId;
    if (!sid && !pid) return empty;
    const hasContent = (p) => Boolean(p && (p.name || p.street || p.city));
    try {
      const Project = (await import('../pm/project.model.js')).default;
      if (!sid && pid) {
        const project = await Project.findById(pid).select('siteId').lean();
        sid = project?.siteId;
      }
      if (!sid) return empty;
      const Site = (await import('../crm/site.model.js')).default;
      const site = await Site.findById(sid).select('billingAddress ownership management').lean();
      return {
        siteBillingAddress: hasContent(site?.billingAddress) ? site.billingAddress : null,
        siteOwnership: hasContent(site?.ownership) ? site.ownership : null,
        siteManagement: hasContent(site?.management) ? site.management : null,
      };
    } catch {
      return empty;
    }
  }

  /**
   * Open a project from an order — the "Projekt eröffnen" step of the customer's
   * project flow, which until now meant creating the project separately and
   * wiring it up by hand. The customer, the object and the title come from the
   * order; everything else is the caller's choice.
   */
  async createProject(id, data, userId, meta = {}) {
    const order = await orderRepository.findById(id);
    if (!order) throw new NotFoundError('Order', id);
    if (order.projectId) {
      throw new ConflictError('This order already belongs to a project');
    }

    const { default: projectService } = await import('../pm/project.service.js');
    const project = await projectService.create({
      name: data.name || order.title || `Projekt ${order.orderNumber}`,
      projectType: data.projectType || 'NEW_INSTALLATION',
      customerId: order.customerId?._id || order.customerId,
      siteId: order.siteId?._id || order.siteId || null,
      projectManagerId: data.projectManagerId || userId,
      description: data.description || null,
      estimatedBudget: order.grandTotalRounded ?? order.grandTotal ?? null,
      currency: order.currency || 'CHF',
    }, userId, meta);

    await orderRepository.updateById(id, { projectId: project._id, updatedBy: userId });
    await this._invalidateOrderCache(id);
    await this._invalidateListCache();

    auditService.logEvent({
      eventType: 'order.project_created',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { orderId: id, projectId: project._id, projectNumber: project.projectNumber },
      module: 'qop',
    });

    logger.info('Project opened from order', {
      module: 'qop',
      action: 'createProject',
      orderId: id,
      projectId: project._id,
    });

    return project;
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
