import accountingDocumentRepository from './accountingDocument.repository.js';
import autoAllocationRuleRepository from './accountingDocumentAutoAllocationRule.repository.js';
import ocrResultRepository from './ocrResult.repository.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { AppError, NotFoundError, ConflictError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import { createStoredZip } from '../../shared/utils/zipStore.js';
import logger from '../../shared/logger/index.js';

const BULK_DOWNLOAD_LIMIT = 500;

function normalizeLinkedRecords(records = []) {
  if (typeof records === 'string') {
    try {
      return JSON.parse(records);
    } catch {
      return [];
    }
  }
  return Array.isArray(records) ? records : [];
}

function safeArchiveName(doc, index) {
  const safeName = String(doc.fileName || `document-${index + 1}`)
    .split('')
    .map((char) => ('<>:"/\\|?*'.includes(char) || char.charCodeAt(0) < 32 ? '_' : char))
    .join('')
    .slice(0, 180);
  return `${String(index + 1).padStart(3, '0')}_${safeName}`;
}

function asDate(value, fallback = new Date()) {
  const date = value ? new Date(value) : fallback;
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

class AccountingDocumentService {
  async upload(fileData, metadata, userId, meta = {}) {
    if (!fileData?.buffer) {
      throw new AppError('Document file is required', 400, ERROR_CODES.FILE_UPLOAD_FAILED);
    }

    // Lazy import crypto for SHA-256 hash
    const { createHash } = await import('crypto');
    const hash = createHash('sha256').update(fileData.buffer).digest('hex');

    // Check duplicate by hash
    const duplicate = await accountingDocumentRepository.findByHash(hash);
    if (duplicate) {
      throw new ConflictError('A document with the same content already exists');
    }

    const fileService = (await import('../files/file.service.js')).default;
    const uploadResult = await fileService.upload({
      buffer: fileData.buffer,
      originalName: fileData.originalname,
      mimeType: fileData.mimetype,
      sizeBytes: fileData.size,
      module: 'accounting',
      entityType: 'document',
      entityId: null,
      uploadedBy: userId,
      bucket: 'documents',
    });

    // Compute retention: 10 years from now
    const retentionUntil = new Date();
    retentionUntil.setFullYear(retentionUntil.getFullYear() + 10);

    const ocrEnabled = ['SUPPLIER_INVOICE', 'RECEIPT'].includes(metadata.documentType);
    const ocrStatus = ocrEnabled ? 'PENDING' : 'NOT_APPLICABLE';

    const doc = await accountingDocumentRepository.create({
      filePath: uploadResult.key,
      fileName: fileData.originalname,
      fileSize: fileData.size,
      mimeType: fileData.mimetype,
      fileHash: hash,
      documentType: metadata.documentType,
      ocrStatus,
      processingStatus: ocrEnabled ? 'IN_REVIEW' : 'PROCESSED',
      notes: metadata.notes || '',
      projectReference: metadata.projectReference || '',
      supplierName: metadata.supplierName || '',
      receiptDate: metadata.receiptDate || null,
      amount: metadata.amount ?? null,
      vat: metadata.vat ?? null,
      receiptType: metadata.receiptType || null,
      accountingCategory: metadata.accountingCategory || '',
      projectId: metadata.projectId || null,
      customerId: metadata.customerId || null,
      employeeId: metadata.employeeId || null,
      autoAssignmentStatus: metadata.autoAssignmentStatus || 'PENDING_REVIEW',
      fullText: metadata.fullText || (fileData.mimetype === 'text/plain' ? fileData.buffer.toString('utf8') : ''),
      linkedRecords: normalizeLinkedRecords(metadata.linkedRecords),
      retentionUntil,
      createdBy: userId,
    });

    const assignedDoc = await this._applyAutoAllocation(doc, userId);

    eventBus.publish(EVENT_TYPES.ACCOUNTING_DOCUMENT_UPLOADED, {
      documentId: assignedDoc._id,
      documentType: metadata.documentType,
      fileName: fileData.originalname,
      createdBy: userId,
    }, { source: 'accounting:documents' });

    auditService.logEvent({
      eventType: 'accounting.document.uploaded',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { documentId: assignedDoc._id, fileName: fileData.originalname, documentType: metadata.documentType },
      module: 'accounting',
    });

    logger.info('Accounting document uploaded', {
      module: 'accounting',
      action: 'document.upload',
      documentId: assignedDoc._id,
    });

    if (ocrEnabled) {
      await this._enqueueOcr(assignedDoc._id, userId, { strict: false });
    }

    return assignedDoc;
  }

  async getById(id) {
    const doc = await accountingDocumentRepository.findById(id);
    if (!doc) throw new NotFoundError('AccountingDocument', id);
    return doc;
  }

  async getDownloadUrl(id) {
    const doc = await accountingDocumentRepository.findById(id);
    if (!doc) throw new NotFoundError('AccountingDocument', id);

    const storageService = (await import('../../shared/storage/StorageService.js')).default;
    return storageService.getPresignedUrl(doc.filePath);
  }

  async list(queryParams) {
    const { cursor, limit, sortBy, sortOrder, search, ...filters } = queryParams;
    return accountingDocumentRepository.findWithCursor({
      cursor,
      limit,
      sortBy,
      sortOrder,
      filters,
      search,
    });
  }

  async triggerOcr(documentId, userId, meta = {}) {
    const doc = await accountingDocumentRepository.findById(documentId);
    if (!doc) throw new NotFoundError('AccountingDocument', documentId);

    if (doc.ocrStatus === 'PROCESSING') {
      throw new ConflictError('OCR processing is already running for this document');
    }
    if (!['SUPPLIER_INVOICE', 'RECEIPT'].includes(doc.documentType)) {
      throw new ConflictError('OCR can only be triggered for supplier invoice and receipt documents');
    }

    await this._enqueueOcr(documentId, userId, { strict: true });

    auditService.logEvent({
      eventType: 'accounting.ocr.triggered',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { documentId },
      module: 'accounting',
    });

    return { documentId, ocrStatus: 'PROCESSING' };
  }

  async getOcrResult(documentId) {
    const result = await ocrResultRepository.findByDocumentId(documentId);
    if (!result) throw new NotFoundError('OcrResult', documentId);
    return result;
  }

  async confirmOcrResult(documentId, corrections, userId, meta = {}) {
    const doc = await accountingDocumentRepository.findById(documentId);
    if (!doc) throw new NotFoundError('AccountingDocument', documentId);

    const result = await ocrResultRepository.findByDocumentId(documentId);
    if (!result) throw new NotFoundError('OcrResult', documentId);

    if (result.status !== 'EXTRACTED') {
      throw new ConflictError('Only extracted OCR results can be confirmed');
    }

    const normalized = this._normalizeOcrCorrections(corrections);
    const updated = await ocrResultRepository.updateStatus(documentId, 'CONFIRMED', {
      ...normalized,
      confirmedBy: userId,
      confirmedAt: new Date(),
    });

    let apInvoice = null;
    if (doc.documentType === 'SUPPLIER_INVOICE') {
      apInvoice = await this._createSupplierInvoiceFromOcr(doc, normalized, corrections, userId, meta);
    }

    await accountingDocumentRepository.updateById(documentId, {
      $set: {
        processingStatus: 'PROCESSED',
        ocrStatus: 'COMPLETED',
        fullText: result.rawText || '',
        supplierName: normalized.extractedSupplierName || doc.supplierName || '',
        receiptDate: normalized.extractedInvoiceDate || doc.receiptDate || null,
        amount: normalized.extractedTotal ?? doc.amount ?? null,
        vat: normalized.extractedVat ?? doc.vat ?? null,
      },
      ...(apInvoice?._id
        ? { $addToSet: { linkedRecords: { recordType: 'AP_INVOICE', recordId: apInvoice._id } } }
        : {}),
    });

    auditService.logEvent({
      eventType: 'accounting.ocr.confirmed',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { documentId, corrections },
      module: 'accounting',
    });

    return {
      ...updated,
      apInvoiceId: apInvoice?._id || null,
      apInvoiceNumber: apInvoice?.apInvoiceNumber || null,
    };
  }

  async rejectOcrResult(documentId, reason, userId, meta = {}) {
    const result = await ocrResultRepository.findByDocumentId(documentId);
    if (!result) throw new NotFoundError('OcrResult', documentId);

    const updated = await ocrResultRepository.updateStatus(documentId, 'REJECTED', {
      rejectedBy: userId,
      rejectedAt: new Date(),
      errorMessage: reason || '',
    });
    await accountingDocumentRepository.updateById(documentId, {
      processingStatus: 'UNPROCESSED',
      ocrStatus: 'FAILED',
    });

    auditService.logEvent({
      eventType: 'accounting.ocr.rejected',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { documentId, reason },
      module: 'accounting',
    });

    return updated;
  }

  async _enqueueOcr(documentId, userId, { strict }) {
    try {
      await accountingDocumentRepository.updateById(documentId, { ocrStatus: 'PROCESSING' });
      const queueManager = (await import('../../shared/queue/QueueManager.js')).default;
      await queueManager.addJob('ocr-processing', 'extract', { documentId, userId });
    } catch (err) {
      await accountingDocumentRepository.updateById(documentId, { ocrStatus: 'PENDING' });
      logger.warn('OCR job could not be enqueued', {
        module: 'accounting',
        action: 'ocr.enqueue',
        documentId,
        error: { message: err.message },
      });
      if (strict) {
        throw new AppError('OCR processing queue is unavailable', 503, ERROR_CODES.QUEUE_ERROR);
      }
    }
  }

  _normalizeOcrCorrections(corrections = {}) {
    return {
      extractedSupplierName: corrections.supplierName ?? corrections.extractedSupplierName,
      extractedSupplierAddress: corrections.supplierAddress ?? corrections.extractedSupplierAddress,
      extractedInvoiceNumber: corrections.invoiceNumber ?? corrections.extractedInvoiceNumber,
      extractedInvoiceDate: corrections.invoiceDate ?? corrections.extractedInvoiceDate,
      extractedDueDate: corrections.dueDate ?? corrections.extractedDueDate,
      extractedTotal: corrections.total ?? corrections.extractedTotal,
      extractedVat: corrections.vat ?? corrections.extractedVat,
      extractedLineItems: corrections.lineItems ?? corrections.extractedLineItems,
      matchedSupplierId: corrections.matchedSupplierId ?? null,
    };
  }

  async _createSupplierInvoiceFromOcr(doc, normalized, corrections = {}, userId, meta = {}) {
    const supplierName = String(normalized.extractedSupplierName || '').trim();
    const supplierInvoiceNumber = String(normalized.extractedInvoiceNumber || '').trim();
    if (!supplierName || !supplierInvoiceNumber) {
      throw new AppError(
        'Supplier name and invoice number are required to create a supplier invoice from OCR',
        400,
        ERROR_CODES.VALIDATION_ERROR,
      );
    }

    const supplier = await this._resolveOcrSupplier({
      supplierId: normalized.matchedSupplierId,
      supplierName,
      supplierAddress: normalized.extractedSupplierAddress,
      userId,
      meta,
    });

    const invoiceDate = asDate(normalized.extractedInvoiceDate, doc.receiptDate ? new Date(doc.receiptDate) : new Date());
    const dueDate = asDate(normalized.extractedDueDate, addDays(invoiceDate, 30));
    const apInvoiceService = (await import('./apInvoice.service.js')).default;

    return apInvoiceService.create({
      supplierId: supplier.supplierId,
      supplierName: supplier.supplierName,
      supplierIban: corrections.supplierIban || null,
      supplierBic: corrections.supplierBic || null,
      supplierInvoiceNumber,
      invoiceDate,
      dueDate,
      paymentTermsDays: Math.max(0, Math.round((dueDate.getTime() - invoiceDate.getTime()) / (24 * 60 * 60 * 1000))),
      lineItems: this._buildApLineItemsFromOcr(normalized),
      currency: corrections.currency || 'CHF',
      projectReference: doc.projectReference || null,
      documentId: doc._id,
    }, userId, meta);
  }

  async _resolveOcrSupplier({ supplierId, supplierName, supplierAddress, userId, meta }) {
    const Customer = (await import('../crm/customer.model.js')).default;
    if (supplierId) {
      const supplier = await Customer.findOne({
        _id: supplierId,
        type: 'business',
        isDeleted: false,
      }).select('_id name').lean();
      if (!supplier) throw new NotFoundError('Supplier', supplierId);
      return { supplierId: supplier._id, supplierName: supplier.name };
    }

    const exactSupplier = await Customer.findOne({
      type: 'business',
      isDeleted: false,
      name: { $regex: `^${supplierName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
    }).select('_id name').lean();
    if (exactSupplier) {
      return { supplierId: exactSupplier._id, supplierName: exactSupplier.name };
    }

    const procurementService = (await import('../crm/procurement.service.js')).default;
    const created = await procurementService.createSupplier({
      name: supplierName,
      street: supplierAddress || '',
      notes: 'Created from OCR supplier invoice review',
    }, userId, meta);
    return { supplierId: created._id, supplierName: created.name };
  }

  _buildApLineItemsFromOcr(normalized) {
    const items = Array.isArray(normalized.extractedLineItems) ? normalized.extractedLineItems : [];
    const mapped = items
      .map((item, index) => {
        const quantity = Number(item.quantity || 1);
        const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
        const lineTotal = item.lineTotal ?? item.total;
        const amount = item.unitPrice ?? (lineTotal !== undefined ? Number(lineTotal) / safeQuantity : 0);
        return {
          position: item.position || index + 1,
          description: String(item.description || `OCR line ${index + 1}`).trim(),
          quantity: safeQuantity,
          unit: item.unit || 'pcs',
          unitPrice: roundMoney(amount),
          vatRate: Number(item.vatRate || 0),
        };
      })
      .filter((item) => item.description && item.unitPrice >= 0);

    if (mapped.length > 0) return mapped;

    const total = roundMoney(normalized.extractedTotal);
    const vat = roundMoney(normalized.extractedVat);
    const net = Math.max(0, roundMoney(total - vat));
    const vatRate = net > 0 ? roundMoney((vat / net) * 100) : 0;
    return [{
      position: 1,
      description: 'OCR supplier invoice total',
      quantity: 1,
      unit: 'pcs',
      unitPrice: net || total,
      vatRate,
    }];
  }

  async assignDocument(documentId, userId, assignedBy, meta = {}, note = '') {
    const doc = await accountingDocumentRepository.findById(documentId);
    if (!doc) throw new NotFoundError('AccountingDocument', documentId);
    await this._assertActiveUser(userId);

    const updated = await accountingDocumentRepository.assignById(
      documentId,
      {
        assignedTo: userId,
        assignedBy,
        note,
        reason: 'MANUAL',
      },
    );

    await this._notifyAssignee(userId, updated, assignedBy, note);

    eventBus.publish(EVENT_TYPES.ACCOUNTING_DOCUMENT_ASSIGNED, {
      documentId,
      assignedTo: userId,
      assignedBy,
    }, { source: 'accounting:documents' });

    auditService.logEvent({
      eventType: 'accounting.document.assigned',
      userId: assignedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { documentId, assignedTo: userId },
      module: 'accounting',
    });

    return updated;
  }

  async bulkAssign(documentIds, userId, assignedBy, meta = {}, note = '') {
    await this._assertActiveUser(userId);
    const uniqueIds = [...new Set(documentIds.map((id) => String(id)))];
    const documents = await accountingDocumentRepository.findByIds(uniqueIds);
    if (documents.length !== uniqueIds.length) {
      const foundIds = new Set(documents.map((doc) => String(doc._id)));
      const missingId = uniqueIds.find((id) => !foundIds.has(id));
      throw new NotFoundError('AccountingDocument', missingId);
    }

    const result = await accountingDocumentRepository.bulkAssign(uniqueIds, {
      assignedTo: userId,
      assignedBy,
      note,
      reason: 'BULK',
    });

    await Promise.all(documents.map((doc) => this._notifyAssignee(
      userId,
      { ...doc, assignedTo: userId },
      assignedBy,
      note,
    )));

    auditService.logEvent({
      eventType: 'accounting.document.bulk_assigned',
      userId: assignedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { documentIds: uniqueIds, assignedTo: userId, modifiedCount: result.modifiedCount },
      module: 'accounting',
    });

    return { modifiedCount: result.modifiedCount };
  }

  async createAutoAllocationRule(data, userId, meta = {}) {
    await this._assertActiveUser(data.assignTo);
    const rule = await autoAllocationRuleRepository.create({
      ...data,
      createdBy: userId,
    });

    auditService.logEvent({
      eventType: 'accounting.document.auto_allocation_rule.created',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { ruleId: rule._id, assignTo: data.assignTo },
      module: 'accounting',
    });

    return rule;
  }

  async listAutoAllocationRules(query = {}) {
    return autoAllocationRuleRepository.list({ includeInactive: query.includeInactive === true || query.includeInactive === 'true' });
  }

  async updateAutoAllocationRule(id, data, userId, meta = {}) {
    const existing = await autoAllocationRuleRepository.findById(id);
    if (!existing) throw new NotFoundError('AccountingDocumentAutoAllocationRule', id);
    if (data.assignTo) await this._assertActiveUser(data.assignTo);

    const updated = await autoAllocationRuleRepository.updateById(id, {
      ...data,
      updatedBy: userId,
    });

    auditService.logEvent({
      eventType: 'accounting.document.auto_allocation_rule.updated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { ruleId: id, changedFields: Object.keys(data) },
      module: 'accounting',
    });

    return updated;
  }

  async bulkDownload(documentIds, userId, meta = {}) {
    const uniqueIds = [...new Set(documentIds.map((id) => String(id)))];
    if (uniqueIds.length > BULK_DOWNLOAD_LIMIT) {
      throw new ConflictError(`Bulk download supports up to ${BULK_DOWNLOAD_LIMIT} documents`);
    }

    const documents = await accountingDocumentRepository.findByIds(uniqueIds);
    if (documents.length !== uniqueIds.length) {
      const foundIds = new Set(documents.map((doc) => String(doc._id)));
      const missingId = uniqueIds.find((id) => !foundIds.has(id));
      throw new NotFoundError('AccountingDocument', missingId);
    }

    const storageService = (await import('../../shared/storage/StorageService.js')).default;
    const files = [];
    for (const [index, doc] of documents.entries()) {
      const data = await storageService.download(doc.filePath);
      files.push({
        name: safeArchiveName(doc, index),
        data,
        modifiedAt: doc.updatedAt || doc.createdAt,
      });
    }

    const zip = createStoredZip(files);
    auditService.logEvent({
      eventType: 'accounting.document.bulk_downloaded',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { documentIds: uniqueIds, documentCount: uniqueIds.length },
      module: 'accounting',
    });

    return {
      fileName: `accounting-documents-${new Date().toISOString().slice(0, 10)}.zip`,
      contentType: 'application/zip',
      buffer: zip,
    };
  }

  async deleteDocument(documentId, userId, meta = {}) {
    const doc = await accountingDocumentRepository.findById(documentId);
    if (!doc) throw new NotFoundError('AccountingDocument', documentId);
    if (new Date(doc.retentionUntil) > new Date()) {
      throw new ConflictError('Document is within the legal retention period and cannot be deleted');
    }

    const deleted = await accountingDocumentRepository.softDelete(documentId, userId);
    auditService.logEvent({
      eventType: 'accounting.document.deleted',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { documentId },
      module: 'accounting',
    });
    return deleted;
  }

  async _assertActiveUser(userId) {
    const User = (await import('../auth/user.model.js')).default;
    const user = await User.findById(userId).select('_id status isDeleted email firstName lastName').lean();
    if (!user) throw new NotFoundError('User', userId);
    if (user.status !== 'active' || user.isDeleted) {
      throw new ConflictError('Document can only be assigned to an active employee');
    }
    return user;
  }

  async _applyAutoAllocation(doc, uploadedBy) {
    const rule = await autoAllocationRuleRepository.findMatchingRule({
      documentType: doc.documentType,
      uploaderId: uploadedBy,
      projectReference: doc.projectReference,
    });
    if (!rule) return doc;

    try {
      await this._assertActiveUser(rule.assignTo);
      const updated = await accountingDocumentRepository.assignById(doc._id, {
        assignedTo: rule.assignTo,
        assignedBy: rule.createdBy,
        note: `Auto-assigned by rule: ${rule.name}`,
        reason: 'AUTO_RULE',
      });
      await this._notifyAssignee(rule.assignTo, updated, rule.createdBy, `Auto-assigned by rule: ${rule.name}`);
      return updated || doc;
    } catch (err) {
      logger.warn('Accounting document auto-allocation skipped', {
        module: 'accounting',
        action: 'document.auto_allocate',
        documentId: doc._id,
        ruleId: rule._id,
        error: { message: err.message },
      });
      return doc;
    }
  }

  async _notifyAssignee(userId, document, assignedBy, note = '') {
    try {
      const notificationService = (await import('../mobile/notification.service.js')).default;
      await notificationService.sendNotification(userId, {
        notificationType: 'ACCOUNTING_DOCUMENT_ASSIGNED',
        title: 'Accounting document assigned',
        body: `${document.fileName || 'Document'} is assigned for review${note ? `: ${note}` : ''}`,
        priority: document.documentType === 'SUPPLIER_INVOICE' ? 'HIGH' : 'NORMAL',
        deepLink: `/accounting/documents/${document._id}`,
        relatedEntityType: 'ACCOUNTING_DOCUMENT',
        relatedEntityId: document._id,
        metadata: { assignedBy, documentType: document.documentType },
      });
    } catch (err) {
      logger.warn('Accounting document assignment notification failed', {
        module: 'accounting',
        action: 'document.assignment_notify',
        documentId: document._id,
        userId,
        error: { message: err.message },
      });
    }
  }
}

const accountingDocumentService = new AccountingDocumentService();
export default accountingDocumentService;
