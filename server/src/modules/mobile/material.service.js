import materialLineItemRepository from './materialLineItem.repository.js';
import auditService from '../auth/audit.service.js';
import { NotFoundError, ValidationError } from '../../shared/errors/AppError.js';

function normalizeCatalogSource(value) {
  const source = String(value || '').toUpperCase();
  if (source === 'IGH') return 'IGH';
  if (source === 'INTERNAL' || source === 'CATALOG') return 'INTERNAL';
  return 'CUSTOM';
}

function serializeMaterial(item, user) {
  return {
    id: String(item._id || item.id),
    _id: item._id,
    orderId: item.orderId ? String(item.orderId) : '',
    workReportId: item.workReportId ? String(item.workReportId) : null,
    articleCode: item.catalogItemId || '',
    catalogItemId: item.catalogItemId || null,
    catalogSource: item.catalogSource,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    sortOrder: item.sortOrder || 0,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

class MaterialService {
  async listByOrder(orderId, user) {
    const items = await materialLineItemRepository.findByOrderId(orderId);
    return items.map((item) => serializeMaterial(item, user));
  }

  async create(orderId, data, user, meta = {}) {
    if (!orderId) {
      throw new ValidationError('Order id is required for mobile material lines');
    }

    const item = await materialLineItemRepository.create({
      orderId,
      catalogSource: normalizeCatalogSource(data.catalogSource),
      catalogItemId: data.catalogItemId || data.articleCode || null,
      description: data.description,
      quantity: data.quantity,
      unit: data.unit,
      sortOrder: data.sortOrder || 0,
    });

    auditService.logEvent({
      eventType: 'mobile.material.created',
      userId: user._id,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { materialId: item._id, orderId },
      module: 'mobile',
    });

    return serializeMaterial(item.toObject ? item.toObject() : item, user);
  }

  async update(orderId, materialId, data, user, meta = {}) {
    const existing = await materialLineItemRepository.findByIdAndOrderId(
      materialId,
      orderId,
    );
    if (!existing) throw new NotFoundError('MaterialLineItem', materialId);

    const updateData = {
      ...data,
      ...(data.catalogSource
        ? { catalogSource: normalizeCatalogSource(data.catalogSource) }
        : {}),
      ...(data.articleCode !== undefined
        ? { catalogItemId: data.articleCode || null }
        : {}),
    };
    delete updateData.articleCode;
    delete updateData.unitPrice;

    const updated = await materialLineItemRepository.updateByIdAndOrderId(
      materialId,
      orderId,
      updateData,
    );

    auditService.logEvent({
      eventType: 'mobile.material.updated',
      userId: user._id,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { materialId, orderId, changedFields: Object.keys(data) },
      module: 'mobile',
    });

    return serializeMaterial(updated, user);
  }

  async remove(orderId, materialId, user, meta = {}) {
    const result = await materialLineItemRepository.deleteByIdAndOrderId(
      materialId,
      orderId,
    );
    if (result.deletedCount === 0) {
      throw new NotFoundError('MaterialLineItem', materialId);
    }

    auditService.logEvent({
      eventType: 'mobile.material.deleted',
      userId: user._id,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { materialId, orderId },
      module: 'mobile',
    });
  }
}

const materialService = new MaterialService();
export default materialService;
