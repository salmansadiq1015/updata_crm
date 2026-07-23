import crypto from 'crypto';
import mongoose from 'mongoose';
import Counter from './counter.model.js';
import Customer from './customer.model.js';
import SparePart from './sparePart.model.js';
import PurchaseOrder from './purchaseOrder.model.js';
import InventoryMovement from './inventoryMovement.model.js';
import DeliveryNoteOcrJob from './deliveryNoteOcrJob.model.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { buildCursorQuery, buildCursorSort, buildCursorResponse } from '../../shared/utils/pagination.js';
import { NotFoundError, ConflictError, ValidationError } from '../../shared/errors/AppError.js';
import logger from '../../shared/logger/index.js';

const LIST_TTL = { l1Ttl: 20, l2Ttl: 90 };
const ENTITY_TTL = { l1Ttl: 45, l2Ttl: 180 };
// A supplier is a business customer, or one explicitly typed 'supplier' in the CRM.
const SUPPLIER_TYPES = ['business', 'supplier'];

const SUPPLIER_SELECT = '_id customerNumber name email phone street postalCode city';
const PART_SELECT = '_id partNumber name manufacturer category unitPrice currency unit currentStock minStockLevel supplierId supplierPartNumber';
const ACTIVE_ORDER_STATUSES = ['draft', 'sent', 'partial'];

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toObjectId(value) {
  if (!value) return null;
  return value instanceof mongoose.Types.ObjectId ? value : new mongoose.Types.ObjectId(value);
}

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function supplierSnapshot(customer) {
  if (!customer) return {};
  return {
    name: customer.name || '',
    email: customer.email || '',
    phone: customer.phone || customer.mobile || '',
    street: customer.street || '',
    postalCode: customer.postalCode || '',
    city: customer.city || '',
  };
}

function normalizePurchaseItem(item = {}) {
  const quantity = normalizeNumber(item.quantity, 0);
  const unitPrice = roundMoney(item.unitPrice);
  const name = String(item.name || item.partName || item.partNumber || '').trim();
  return {
    sparePartId: item.sparePartId || null,
    partNumber: String(item.partNumber || '').trim(),
    name,
    quantity,
    receivedQuantity: normalizeNumber(item.receivedQuantity, 0),
    unitPrice,
    unit: String(item.unit || 'pcs').trim(),
    supplierPartNumber: String(item.supplierPartNumber || '').trim(),
  };
}

function orderTotal(items) {
  return roundMoney(items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0));
}

function buildSearchFilter(search, fields) {
  if (!search) return {};
  const regex = { $regex: escapeRegex(search), $options: 'i' };
  return { $or: fields.map((field) => ({ [field]: regex })) };
}

function deliveryNoteText(file) {
  const mimetype = file?.mimetype || '';
  if (mimetype.startsWith('text/') || mimetype.includes('csv') || mimetype.includes('json')) {
    return file.buffer.toString('utf8').replace(/^\uFEFF/, '');
  }
  const asUtf8 = file?.buffer?.toString('utf8') || '';
  const printableRatio = asUtf8.length
    ? Array.from(asUtf8).filter(isPrintableTextChar).length / asUtf8.length
    : 0;
  return printableRatio > 0.85 ? asUtf8 : '';
}

function isPrintableTextChar(char) {
  const code = char.charCodeAt(0);
  return code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126) || code >= 160;
}

function parseDelimitedLine(line) {
  const delimiter = line.includes(';') ? ';' : line.includes('\t') ? '\t' : ',';
  const parts = line.split(delimiter).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  const quantityIndex = parts.findIndex((part) => Number.isFinite(Number(part.replace(',', '.'))));
  if (quantityIndex === -1) return null;
  const quantity = Number(parts[quantityIndex].replace(',', '.'));
  const [partNumber, name] = quantityIndex === 0
    ? ['', parts[1] || '']
    : [parts[0] || '', parts[1] || parts[0] || ''];

  return {
    partNumber,
    name,
    quantity,
    unit: parts[quantityIndex + 1] || 'pcs',
    confidence: 0.75,
  };
}

function parseDeliveryNoteItems(rawText) {
  const text = String(rawText || '');
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const items = [];

  for (const line of lines) {
    if (/^(supplier|lieferant|delivery|lieferschein|date|datum)\b/i.test(line)) continue;

    const explicit = line.match(
      /(?:part|artikel|article|art\.?-?nr|nr\.?)\s*[:#-]?\s*([A-Z0-9._/-]+).*?(?:qty|menge|quantity|anzahl)\s*[:#-]?\s*([0-9]+(?:[.,][0-9]+)?)(?:\s*(pcs|stk|stuck|stück|m|kg|l))?/i,
    );
    if (explicit) {
      items.push({
        partNumber: explicit[1],
        name: explicit[1],
        quantity: Number(explicit[2].replace(',', '.')),
        unit: explicit[3] || 'pcs',
        confidence: 0.82,
      });
      continue;
    }

    const delimited = parseDelimitedLine(line);
    if (delimited) items.push(delimited);
  }

  return items.filter((item) => item.quantity > 0 && (item.name || item.partNumber)).slice(0, 100);
}

function normalizeProviderLineItems(lineItems = []) {
  if (!Array.isArray(lineItems)) return [];
  return lineItems.map((item) => ({
    partNumber: item.partNumber || item.articleNumber || item.sku || item.code || '',
    name: item.name || item.description || item.title || item.partNumber || '',
    quantity: normalizeNumber(item.quantity ?? item.qty, 0),
    unit: item.unit || item.unitOfMeasure || 'pcs',
    confidence: normalizeNumber(item.confidence, 0.75),
  })).filter((item) => item.quantity > 0 && (item.partNumber || item.name));
}

function dedupeDeliveryNoteItems(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = `${String(item.partNumber || '').toLowerCase()}|${String(item.name || '').toLowerCase()}|${item.quantity}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function parseDeliveryNoteHeader(rawText) {
  const text = String(rawText || '');
  const supplierName = text.match(/(?:supplier|lieferant|fournisseur|fornitore)\s*[:-]\s*(.+)/i)?.[1]?.trim() || '';
  const deliveryNoteNumber = text.match(/(?:delivery note|lieferschein|bulletin de livraison|documento di trasporto)\s*(?:no\.?|nr\.?|number)?\s*[:#-]\s*([A-Z0-9][A-Z0-9/_-]+)/i)?.[1]?.trim() || '';
  return { supplierName, deliveryNoteNumber };
}

async function enrichOcrItems(items) {
  if (!items.length) return [];
  const ids = [...new Set(items.map((item) => item.sparePartId).filter(Boolean).map(String))];
  const partNumbers = [...new Set(items.map((item) => item.partNumber).filter(Boolean))];
  const names = [...new Set(items.map((item) => item.name).filter(Boolean))];
  const [byId, byPartNumber, byName] = await Promise.all([
    ids.length
      ? SparePart.find({ _id: { $in: ids }, isDeleted: false }).select(PART_SELECT).lean()
      : [],
    partNumbers.length
      ? SparePart.find({ partNumber: { $in: partNumbers }, isDeleted: false }).select(PART_SELECT).lean()
      : [],
    names.length
      ? SparePart.find({ name: { $in: names.map((name) => new RegExp(`^${escapeRegex(name)}$`, 'i')) }, isDeleted: false }).select(PART_SELECT).lean()
      : [],
  ]);

  const idMap = new Map(byId.map((part) => [String(part._id), part]));
  const partNumberMap = new Map(byPartNumber.map((part) => [String(part.partNumber).toLowerCase(), part]));
  const nameMap = new Map(byName.map((part) => [String(part.name).toLowerCase(), part]));

  return items.map((item) => {
    const part = idMap.get(String(item.sparePartId || ''))
      || partNumberMap.get(String(item.partNumber || '').toLowerCase())
      || nameMap.get(String(item.name || '').toLowerCase())
      || null;
    return {
      sparePartId: part?._id || null,
      partNumber: item.partNumber || part?.partNumber || '',
      name: part?.name || item.name || item.partNumber || '',
      quantity: item.quantity,
      unit: item.unit || part?.unit || 'pcs',
      confidence: part ? Math.max(item.confidence || 0, 0.9) : item.confidence || 0.45,
      matchedBy: part
        ? (item.partNumber && String(part.partNumber).toLowerCase() === String(item.partNumber).toLowerCase() ? 'partNumber' : 'name')
        : 'none',
    };
  });
}

class ProcurementService {
  async getStats() {
    const cacheKey = 'crm:procurement:stats';
    return cacheManager.getOrSet(cacheKey, async () => {
      const [totalArticles, lowStockRows, openOrdersCount, pendingReceiptsCount] = await Promise.all([
        SparePart.countDocuments({ isDeleted: false, isActive: true }),
        SparePart.aggregate([
          { $match: { isDeleted: false, isActive: true } },
          { $match: { $expr: { $lte: ['$currentStock', '$minStockLevel'] } } },
          { $count: 'total' },
        ]),
        PurchaseOrder.countDocuments({ status: { $in: ACTIVE_ORDER_STATUSES } }),
        PurchaseOrder.countDocuments({ status: { $in: ['sent', 'partial'] } }),
      ]);

      return {
        totalArticles,
        lowStockCount: lowStockRows[0]?.total || 0,
        openOrdersCount,
        pendingReceiptsCount,
      };
    }, LIST_TTL);
  }

  async listLowStock(query = {}) {
    const {
      cursor,
      limit = 25,
      sortBy = 'name',
      sortOrder = 'asc',
      search,
      category,
      supplierId,
    } = query;
    const baseFilter = {
      isDeleted: false,
      isActive: true,
      $expr: { $lte: ['$currentStock', '$minStockLevel'] },
    };
    if (category) baseFilter.category = category;
    if (supplierId) baseFilter.supplierId = supplierId;
    Object.assign(baseFilter, buildSearchFilter(search, ['partNumber', 'name', 'manufacturer', 'supplierPartNumber']));
    const filter = {
      ...baseFilter,
      ...buildCursorQuery(cursor, sortBy, sortOrder),
    };

    const [docs, total] = await Promise.all([
      SparePart.find(filter)
        .populate({ path: 'supplierId', select: SUPPLIER_SELECT })
        .sort(buildCursorSort(sortBy, sortOrder))
        .limit(limit + 1)
        .select('-__v')
        .lean(),
      SparePart.countDocuments(baseFilter),
    ]);
    const response = buildCursorResponse(docs, limit, sortBy);
    response.data = await this._attachSupplierHistory(response.data);
    response.pagination.total = total;
    return response;
  }

  async listInventoryMovements(query = {}) {
    const {
      cursor,
      limit = 50,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      search,
      type,
      supplierId,
      sparePartId,
    } = query;
    const filter = {
      ...buildCursorQuery(cursor, sortBy, sortOrder),
    };
    if (type) filter.type = type;
    if (supplierId) filter.supplierId = supplierId;
    if (sparePartId) filter.sparePartId = sparePartId;
    Object.assign(filter, buildSearchFilter(search, ['referenceNumber', 'reason', 'deliveryNoteNumber']));

    const docs = await InventoryMovement.find(filter)
      .populate({ path: 'sparePartId', select: PART_SELECT })
      .populate({ path: 'supplierId', select: SUPPLIER_SELECT })
      .populate({ path: 'purchaseOrderId', select: 'orderNumber status' })
      .populate({ path: 'createdBy', select: 'firstName lastName email name' })
      .sort(buildCursorSort(sortBy, sortOrder))
      .limit(limit + 1)
      .lean();

    return buildCursorResponse(docs, limit, sortBy);
  }

  async adjustStock(sparePartId, data, userId, meta = {}) {
    const movement = await this._changeStock({
      sparePartId,
      type: data.type === 'correction' ? 'correction' : data.type,
      quantity: data.quantity,
      reason: data.reason || null,
      referenceType: data.deliveryNoteNumber ? 'delivery_note' : 'stock_adjustment',
      referenceNumber: data.deliveryNoteNumber || '',
      deliveryNoteNumber: data.deliveryNoteNumber || '',
      createdBy: userId,
    });

    await this._invalidateProcurementCaches(sparePartId);
    this._audit('inventory.stock_adjusted', userId, meta, {
      sparePartId,
      type: data.type,
      quantity: data.quantity,
      deliveryNoteNumber: data.deliveryNoteNumber || null,
      movementId: movement._id,
    });
    return movement;
  }

  async receiveInstallationOrderRequest({ sparePartId, quantity, installationId, notes }, userId, meta = {}) {
    const movement = await this._changeStock({
      sparePartId,
      type: 'receipt',
      quantity,
      referenceType: 'installation_order_request',
      referenceNumber: installationId ? String(installationId) : '',
      reason: notes || '',
      createdBy: userId,
    });
    await this._invalidateProcurementCaches(sparePartId);
    this._audit('inventory.installation_order_received', userId, meta, {
      sparePartId,
      installationId,
      quantity,
      movementId: movement._id,
    });
    return movement;
  }

  async listSuppliers(query = {}) {
    const {
      cursor,
      limit = 25,
      sortBy = 'name',
      sortOrder = 'asc',
      search,
    } = query;
    const filter = {
      type: { $in: SUPPLIER_TYPES },
      status: 'active',
      isDeleted: false,
      ...buildCursorQuery(cursor, sortBy, sortOrder),
    };
    Object.assign(filter, buildSearchFilter(search, ['name', 'customerNumber', 'email', 'city']));

    const docs = await Customer.find(filter)
      .sort(buildCursorSort(sortBy, sortOrder))
      .limit(limit + 1)
      .select(SUPPLIER_SELECT)
      .lean();

    return buildCursorResponse(docs, limit, sortBy);
  }

  async getSupplierById(id) {
    const supplier = await Customer.findOne({ _id: id, type: { $in: SUPPLIER_TYPES }, isDeleted: false })
      .select(SUPPLIER_SELECT)
      .lean();
    if (!supplier) throw new NotFoundError('Supplier', id);
    return supplier;
  }

  async searchSuppliers(q, limit = 25) {
    const filter = {
      type: { $in: SUPPLIER_TYPES },
      status: 'active',
      isDeleted: false,
      ...buildSearchFilter(q, ['name', 'customerNumber', 'email', 'city']),
    };
    return Customer.find(filter)
      .sort({ name: 1 })
      .limit(limit)
      .select(SUPPLIER_SELECT)
      .lean();
  }

  async createSupplier(data, userId, meta = {}) {
    const supplierNumber = await this._nextSupplierNumber();
    const supplier = await Customer.create({
      customerNumber: supplierNumber,
      name: data.name,
      type: 'business',
      ownerName: data.ownerName || data.name,
      street: data.street || '',
      postalCode: data.postalCode || '',
      city: data.city || '',
      canton: data.canton || null,
      country: data.country || 'CH',
      phone: data.phone || null,
      email: data.email || null,
      website: data.website || null,
      uidNumber: data.uidNumber || null,
      vatNumber: data.vatNumber || null,
      notes: data.notes || null,
      createdBy: userId,
    });
    await cacheManager.invalidatePattern('crm:procurement:*');
    this._audit('supplier.created', userId, meta, { supplierId: supplier._id, supplierNumber });
    return supplier.toObject();
  }

  async updateSupplier(id, data, userId, meta = {}) {
    const supplier = await Customer.findOneAndUpdate(
      { _id: id, type: { $in: SUPPLIER_TYPES }, isDeleted: false },
      { $set: { ...data } },
      { returnDocument: 'after', runValidators: true },
    ).select(SUPPLIER_SELECT).lean();
    if (!supplier) throw new NotFoundError('Supplier', id);
    await cacheManager.invalidatePattern('crm:procurement:*');
    this._audit('supplier.updated', userId, meta, { supplierId: id, changedFields: Object.keys(data) });
    return supplier;
  }

  async deleteSupplier(id, userId, meta = {}) {
    const supplier = await Customer.findOneAndUpdate(
      { _id: id, type: { $in: SUPPLIER_TYPES }, isDeleted: false },
      { $set: { isDeleted: true, deletedAt: new Date(), status: 'archived' } },
      { returnDocument: 'after' },
    ).lean();
    if (!supplier) throw new NotFoundError('Supplier', id);
    await cacheManager.invalidatePattern('crm:procurement:*');
    this._audit('supplier.deleted', userId, meta, { supplierId: id });
    return { id };
  }

  async createPurchaseOrder(data, userId, meta = {}) {
    const supplier = data.supplierId ? await Customer.findById(data.supplierId).select(SUPPLIER_SELECT).lean() : null;
    if (data.supplierId && !supplier) throw new NotFoundError('Supplier', data.supplierId);

    const items = await this._normalizePurchaseItems(data.items || []);
    if (!items.length) {
      throw new ValidationError('Purchase order requires at least one item');
    }

    const orderNumber = await this._nextOrderNumber();
    const order = await PurchaseOrder.create({
      orderNumber,
      supplierId: supplier?._id || null,
      supplierName: supplier?.name || data.supplierName || '',
      supplierSnapshot: supplierSnapshot(supplier),
      status: data.status || 'sent',
      expectedDelivery: data.expectedDelivery || null,
      currency: data.currency || 'CHF',
      items,
      totalAmount: orderTotal(items),
      notes: data.notes || '',
      createdBy: userId,
    });

    await this._invalidateProcurementCaches();
    eventBus.publish(EVENT_TYPES.PURCHASE_ORDER_CREATED, {
      purchaseOrderId: order._id,
      orderNumber,
      supplierId: order.supplierId,
      createdBy: userId,
    }, { source: 'crm:procurement' });
    this._audit('purchase_order.created', userId, meta, { purchaseOrderId: order._id, orderNumber });
    return this.getPurchaseOrderById(order._id);
  }

  async listPurchaseOrders(query = {}) {
    const {
      cursor,
      limit = 25,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      search,
      status,
      supplierId,
    } = query;
    const baseFilter = {};
    if (status === 'open') baseFilter.status = { $in: ACTIVE_ORDER_STATUSES };
    else if (status) baseFilter.status = status;
    if (supplierId) baseFilter.supplierId = supplierId;
    Object.assign(baseFilter, buildSearchFilter(search, ['orderNumber', 'supplierName', 'notes', 'items.name', 'items.partNumber']));
    const filter = {
      ...baseFilter,
      ...buildCursorQuery(cursor, sortBy, sortOrder),
    };

    const [docs, total] = await Promise.all([
      PurchaseOrder.find(filter)
        .populate({ path: 'supplierId', select: SUPPLIER_SELECT })
        .sort(buildCursorSort(sortBy, sortOrder))
        .limit(limit + 1)
        .lean(),
      PurchaseOrder.countDocuments(baseFilter),
    ]);
    const response = buildCursorResponse(docs, limit, sortBy);
    response.pagination.total = total;
    return response;
  }

  async getPurchaseOrderById(id) {
    const cacheKey = `crm:purchase-order:${id}`;
    const order = await cacheManager.getOrSet(cacheKey, () => PurchaseOrder.findById(id)
      .populate({ path: 'supplierId', select: SUPPLIER_SELECT })
      .populate({ path: 'items.sparePartId', select: PART_SELECT })
      .lean(), ENTITY_TTL);
    if (!order) throw new NotFoundError('PurchaseOrder', id);
    return order;
  }

  async updatePurchaseOrder(id, data, userId, meta = {}) {
    const order = await PurchaseOrder.findById(id);
    if (!order) throw new NotFoundError('PurchaseOrder', id);
    if (['received', 'cancelled'].includes(order.status)) {
      throw new ConflictError(`Purchase order is already ${order.status}`);
    }

    let supplier = null;
    if (data.supplierId !== undefined) {
      supplier = data.supplierId ? await Customer.findById(data.supplierId).select(SUPPLIER_SELECT).lean() : null;
      if (data.supplierId && !supplier) throw new NotFoundError('Supplier', data.supplierId);
    }

    const update = {
      updatedBy: userId,
    };
    if (data.supplierId !== undefined) {
      update.supplierId = supplier?._id || null;
      update.supplierName = supplier?.name || data.supplierName || '';
      update.supplierSnapshot = supplierSnapshot(supplier);
    }
    if (data.expectedDelivery !== undefined) update.expectedDelivery = data.expectedDelivery || null;
    if (data.currency !== undefined) update.currency = data.currency || 'CHF';
    if (data.notes !== undefined) update.notes = data.notes || '';
    if (data.status !== undefined) update.status = data.status;
    if (data.items !== undefined) {
      const items = await this._normalizePurchaseItems(data.items);
      update.items = items;
      update.totalAmount = orderTotal(items);
    }

    const updated = await PurchaseOrder.findByIdAndUpdate(id, update, {
      returnDocument: 'after',
      runValidators: true,
    }).lean();
    await this._invalidateProcurementCaches();
    await cacheManager.del(`crm:purchase-order:${id}`);
    this._audit('purchase_order.updated', userId, meta, { purchaseOrderId: id, changedFields: Object.keys(data) });
    return updated;
  }

  async cancelPurchaseOrder(id, userId, meta = {}) {
    const order = await PurchaseOrder.findById(id);
    if (!order) throw new NotFoundError('PurchaseOrder', id);
    if (order.status === 'cancelled') throw new ConflictError('Purchase order is already cancelled');
    if (order.status === 'received') throw new ConflictError('Received purchase orders cannot be cancelled');

    order.status = 'cancelled';
    order.cancelledAt = new Date();
    order.cancelledBy = userId;
    order.updatedBy = userId;
    await order.save();

    await this._invalidateProcurementCaches();
    await cacheManager.del(`crm:purchase-order:${id}`);
    eventBus.publish(EVENT_TYPES.PURCHASE_ORDER_CANCELLED, {
      purchaseOrderId: order._id,
      orderNumber: order.orderNumber,
      cancelledBy: userId,
    }, { source: 'crm:procurement' });
    this._audit('purchase_order.cancelled', userId, meta, { purchaseOrderId: order._id, orderNumber: order.orderNumber });
    return order.toObject();
  }

  async receivePurchaseOrder(id, data, userId, meta = {}) {
    const order = await PurchaseOrder.findById(id);
    if (!order) throw new NotFoundError('PurchaseOrder', id);
    if (['received', 'cancelled'].includes(order.status)) {
      throw new ConflictError(`Purchase order is already ${order.status}`);
    }

    const requestedItems = data.items || [];
    const receiptItems = [];

    for (const requested of requestedItems) {
      const index = order.items.findIndex((item) => {
        if (requested.itemId && String(item._id) === String(requested.itemId)) return true;
        if (requested.sparePartId && item.sparePartId && String(item.sparePartId) === String(requested.sparePartId)) return true;
        if (requested.partNumber && item.partNumber && requested.partNumber === item.partNumber) return true;
        return false;
      });
      if (index === -1) continue;

      const item = order.items[index];
      const receivedQuantity = normalizeNumber(requested.receivedQuantity ?? requested.quantity, 0);
      if (receivedQuantity <= 0) continue;

      const remaining = Number(item.quantity) - Number(item.receivedQuantity || 0);
      if (receivedQuantity > remaining) {
        throw new ValidationError('Received quantity exceeds ordered quantity', [
          { field: `items.${index}.receivedQuantity`, message: `Maximum remaining quantity is ${remaining}` },
        ]);
      }

      let movement = null;
      if (item.sparePartId) {
        movement = await this._changeStock({
          sparePartId: item.sparePartId,
          type: 'receipt',
          quantity: receivedQuantity,
          supplierId: order.supplierId,
          purchaseOrderId: order._id,
          referenceType: 'purchase_order',
          referenceNumber: order.orderNumber,
          deliveryNoteNumber: data.deliveryNoteNumber || '',
          reason: data.notes || '',
          createdBy: userId,
        });
      }

      item.receivedQuantity = Number(item.receivedQuantity || 0) + receivedQuantity;
      receiptItems.push({
        itemId: item._id,
        sparePartId: item.sparePartId || null,
        name: item.name,
        receivedQuantity,
        movementId: movement?._id || null,
      });
    }

    if (!receiptItems.length) {
      throw new ValidationError('No receivable item quantities were provided');
    }

    const allReceived = order.items.every((item) => Number(item.receivedQuantity || 0) >= Number(item.quantity));
    order.status = allReceived ? 'received' : 'partial';
    order.receipts.push({
      receivedBy: userId,
      deliveryNoteNumber: data.deliveryNoteNumber || '',
      notes: data.notes || '',
      items: receiptItems,
    });
    order.updatedBy = userId;
    await order.save();

    await this._invalidateProcurementCaches();
    await cacheManager.del(`crm:purchase-order:${id}`);
    eventBus.publish(EVENT_TYPES.PURCHASE_ORDER_RECEIVED, {
      purchaseOrderId: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
      receivedBy: userId,
    }, { source: 'crm:procurement' });
    this._audit('purchase_order.received', userId, meta, {
      purchaseOrderId: order._id,
      orderNumber: order.orderNumber,
      itemCount: receiptItems.length,
    });
    return this.getPurchaseOrderById(id);
  }

  async uploadDeliveryNote(file, data, userId, meta = {}) {
    if (!file?.buffer?.length) {
      throw new ValidationError('Delivery note file is required', [{ field: 'file', message: 'File is required' }]);
    }

    let rawText = deliveryNoteText(file);
    let provider = rawText ? 'text' : 'unconfigured';
    let rawPayload = { parser: 'delivery-note-regex-v1' };
    let providerItems = [];
    let errorMessage = '';

    if (!rawText) {
      try {
        const ocrProviderService = (await import('../accounting/ocrProvider.service.js')).default;
        const extraction = await ocrProviderService.extract({
          document: {
            _id: new mongoose.Types.ObjectId(),
            fileName: file.originalname,
            mimeType: file.mimetype,
          },
          buffer: file.buffer,
        });
        rawText = extraction.rawText || '';
        provider = extraction.provider || 'http';
        rawPayload = extraction.rawPayload || { provider, parser: 'delivery-note-provider-v1' };
        providerItems = normalizeProviderLineItems(extraction.fields?.lineItems);
      } catch (err) {
        errorMessage = err.message || 'OCR provider is not configured for binary delivery-note files';
      }
    }

    const header = parseDeliveryNoteHeader(rawText);
    const extractedItems = await enrichOcrItems(dedupeDeliveryNoteItems([
      ...providerItems,
      ...parseDeliveryNoteItems(rawText),
    ]));
    const confidence = extractedItems.length
      ? extractedItems.reduce((sum, item) => sum + Number(item.confidence || 0), 0) / extractedItems.length
      : 0;
    const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');
    const supplierId = data.supplierId || extractedItems.find((item) => item.supplierId)?.supplierId || null;

    const job = await DeliveryNoteOcrJob.create({
      fileName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
      fileHash: hash,
      supplierId,
      supplierName: data.supplierName || header.supplierName || '',
      deliveryNoteNumber: data.deliveryNoteNumber || header.deliveryNoteNumber || '',
      provider,
      confidence,
      rawText,
      rawPayload,
      items: extractedItems,
      createdBy: userId,
      status: 'extracted',
      errorMessage,
    });

    eventBus.publish(EVENT_TYPES.DELIVERY_NOTE_OCR_EXTRACTED, {
      deliveryNoteJobId: job._id,
      itemCount: extractedItems.length,
      createdBy: userId,
    }, { source: 'crm:procurement' });
    this._audit('delivery_note.ocr_extracted', userId, meta, {
      deliveryNoteJobId: job._id,
      itemCount: extractedItems.length,
      fileName: file.originalname,
    });

    return {
      jobId: job._id,
      status: job.status,
      confidence: job.confidence,
      supplierName: job.supplierName,
      deliveryNoteNumber: job.deliveryNoteNumber,
      errorMessage: job.errorMessage,
      items: job.items,
    };
  }

  async getDeliveryNoteOcrResult(jobId) {
    const job = await DeliveryNoteOcrJob.findById(jobId)
      .populate({ path: 'supplierId', select: SUPPLIER_SELECT })
      .populate({ path: 'items.sparePartId', select: PART_SELECT })
      .lean();
    if (!job) throw new NotFoundError('DeliveryNoteOcrJob', jobId);
    return job;
  }

  async confirmDeliveryNoteOcr(jobId, data, userId, meta = {}) {
    const job = await DeliveryNoteOcrJob.findById(jobId);
    if (!job) throw new NotFoundError('DeliveryNoteOcrJob', jobId);
    if (job.status === 'confirmed') throw new ConflictError('Delivery note was already confirmed');

    const editedItems = data.items?.length ? data.items : job.items;
    const enriched = await enrichOcrItems(editedItems.map((item) => ({
      sparePartId: item.sparePartId || null,
      partNumber: item.partNumber || '',
      name: item.name || item.partNumber || '',
      quantity: normalizeNumber(item.quantity, 0),
      unit: item.unit || 'pcs',
      confidence: item.confidence || 0.7,
    })));

    const unmatched = enriched.filter((item) => !item.sparePartId || !item.quantity);
    if (unmatched.length) {
      throw new ValidationError('All delivery-note items must match an existing inventory item before approval', unmatched.map((item, index) => ({
        field: `items.${index}`,
        message: `No inventory match for ${item.partNumber || item.name || 'item'}`,
      })));
    }

    const movements = [];
    for (const item of enriched) {
      const movement = await this._changeStock({
        sparePartId: item.sparePartId,
        type: 'receipt',
        quantity: item.quantity,
        supplierId: data.supplierId || job.supplierId || null,
        deliveryNoteJobId: job._id,
        referenceType: 'delivery_note',
        referenceNumber: data.deliveryNoteNumber || job.deliveryNoteNumber || '',
        deliveryNoteNumber: data.deliveryNoteNumber || job.deliveryNoteNumber || '',
        reason: data.notes || '',
        createdBy: userId,
      });
      movements.push(movement);
    }

    job.status = 'confirmed';
    job.confirmedBy = userId;
    job.confirmedAt = new Date();
    job.confirmedItems = enriched;
    job.deliveryNoteNumber = data.deliveryNoteNumber || job.deliveryNoteNumber || '';
    job.supplierId = data.supplierId || job.supplierId || null;
    await job.save();

    await this._invalidateProcurementCaches();
    eventBus.publish(EVENT_TYPES.DELIVERY_NOTE_CONFIRMED, {
      deliveryNoteJobId: job._id,
      movementCount: movements.length,
      confirmedBy: userId,
    }, { source: 'crm:procurement' });
    this._audit('delivery_note.confirmed', userId, meta, {
      deliveryNoteJobId: job._id,
      movementCount: movements.length,
    });

    return {
      jobId: job._id,
      status: job.status,
      movements,
    };
  }

  async _normalizePurchaseItems(rawItems) {
    const normalized = rawItems.map(normalizePurchaseItem).filter((item) => item.name && item.quantity > 0);
    const partIds = [...new Set(normalized.map((item) => item.sparePartId).filter(Boolean).map(String))];
    const parts = partIds.length
      ? await SparePart.find({ _id: { $in: partIds }, isDeleted: false }).select(PART_SELECT).lean()
      : [];
    const partById = new Map(parts.map((part) => [String(part._id), part]));

    return normalized.map((item) => {
      const part = item.sparePartId ? partById.get(String(item.sparePartId)) : null;
      if (item.sparePartId && !part) throw new NotFoundError('SparePart', item.sparePartId);
      return {
        ...item,
        partNumber: item.partNumber || part?.partNumber || '',
        name: item.name || part?.name || '',
        unit: item.unit || part?.unit || 'pcs',
        unitPrice: item.unitPrice || part?.unitPrice || 0,
        supplierPartNumber: item.supplierPartNumber || part?.supplierPartNumber || '',
      };
    });
  }

  async _attachSupplierHistory(parts) {
    if (!parts.length) return parts;
    const missingPreferredIds = parts.filter((part) => !part.supplierId).map((part) => part._id);
    if (!missingPreferredIds.length) {
      return parts.map((part) => ({
        ...part,
        preferredSupplier: part.supplierId || null,
        supplierName: part.supplierId?.name || null,
      }));
    }

    const latestRows = await InventoryMovement.aggregate([
      { $match: { sparePartId: { $in: missingPreferredIds }, supplierId: { $ne: null } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$sparePartId',
          supplierId: { $first: '$supplierId' },
          lastPurchaseDate: { $first: '$createdAt' },
        },
      },
    ]);
    const supplierIds = latestRows.map((row) => row.supplierId);
    const suppliers = supplierIds.length
      ? await Customer.find({ _id: { $in: supplierIds } }).select(SUPPLIER_SELECT).lean()
      : [];
    const supplierById = new Map(suppliers.map((supplier) => [String(supplier._id), supplier]));
    const latestByPart = new Map(latestRows.map((row) => [String(row._id), {
      supplier: supplierById.get(String(row.supplierId)) || null,
      lastPurchaseDate: row.lastPurchaseDate,
    }]));

    return parts.map((part) => {
      const latest = latestByPart.get(String(part._id));
      const preferred = part.supplierId || latest?.supplier || null;
      return {
        ...part,
        preferredSupplier: preferred,
        lastSupplierId: latest?.supplier || null,
        lastPurchaseDate: latest?.lastPurchaseDate || null,
        supplierName: preferred?.name || null,
      };
    });
  }

  async _changeStock({
    sparePartId,
    type,
    quantity,
    supplierId = null,
    purchaseOrderId = null,
    deliveryNoteJobId = null,
    referenceType = 'manual',
    referenceNumber = '',
    deliveryNoteNumber = '',
    reason = '',
    createdBy,
  }) {
    const numericQuantity = normalizeNumber(quantity, 0);
    if (numericQuantity <= 0) {
      throw new ValidationError('Quantity must be greater than zero');
    }

    let part;
    let stockBefore;
    let stockAfter;
    let signedQuantity;

    if (type === 'out' || type === 'issue') {
      part = await SparePart.findOneAndUpdate(
        { _id: sparePartId, isDeleted: false, currentStock: { $gte: numericQuantity } },
        { $inc: { currentStock: -numericQuantity } },
        { returnDocument: 'after', runValidators: true },
      ).lean();
      if (!part) throw new ConflictError('Insufficient stock for goods issue');
      stockAfter = part.currentStock;
      stockBefore = stockAfter + numericQuantity;
      signedQuantity = -numericQuantity;
    } else if (type === 'correction') {
      part = await SparePart.findOneAndUpdate(
        { _id: sparePartId, isDeleted: false },
        { $set: { currentStock: numericQuantity } },
        { returnDocument: 'before', runValidators: true },
      ).lean();
      if (!part) throw new NotFoundError('SparePart', sparePartId);
      stockBefore = part.currentStock || 0;
      stockAfter = numericQuantity;
      signedQuantity = stockAfter - stockBefore;
    } else {
      part = await SparePart.findOneAndUpdate(
        { _id: sparePartId, isDeleted: false },
        { $inc: { currentStock: numericQuantity } },
        { returnDocument: 'after', runValidators: true },
      ).lean();
      if (!part) throw new NotFoundError('SparePart', sparePartId);
      stockAfter = part.currentStock;
      stockBefore = stockAfter - numericQuantity;
      signedQuantity = numericQuantity;
    }

    const movement = await InventoryMovement.create({
      sparePartId,
      type,
      quantity: signedQuantity,
      stockBefore,
      stockAfter,
      unit: part.unit || 'pcs',
      supplierId,
      purchaseOrderId,
      deliveryNoteJobId,
      referenceType,
      referenceNumber: referenceNumber || null,
      deliveryNoteNumber: deliveryNoteNumber || null,
      reason: reason || null,
      createdBy,
    });

    eventBus.publish(EVENT_TYPES.INVENTORY_MOVEMENT_CREATED, {
      movementId: movement._id,
      sparePartId,
      type,
      quantity: signedQuantity,
      stockAfter,
      createdBy,
    }, { source: 'crm:procurement' });

    return movement.toObject();
  }

  async _nextOrderNumber() {
    const year = new Date().getFullYear();
    const counter = await Counter.findOneAndUpdate(
      { _id: `procurement_purchase_order:${year}` },
      { $inc: { seq: 1 } },
      { returnDocument: 'after', upsert: true },
    );
    return `PO-${year}-${String(counter.seq).padStart(5, '0')}`;
  }

  async _nextSupplierNumber() {
    const year = new Date().getFullYear();
    const counter = await Counter.findOneAndUpdate(
      { _id: `procurement_supplier:${year}` },
      { $inc: { seq: 1 } },
      { returnDocument: 'after', upsert: true },
    );
    return `SUP-${year}-${String(counter.seq).padStart(5, '0')}`;
  }

  async _invalidateProcurementCaches(sparePartId = null) {
    await Promise.all([
      cacheManager.invalidatePattern('crm:procurement:*'),
      cacheManager.invalidatePattern('crm:spare-parts:*'),
      sparePartId ? cacheManager.del(`crm:spare-part:${sparePartId}`) : Promise.resolve(),
    ]);
  }

  _audit(eventType, userId, meta, details) {
    auditService.logEvent({
      eventType,
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details,
      module: 'crm',
    });
  }
}

const procurementService = new ProcurementService();
export default procurementService;
