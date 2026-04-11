import accountingDocumentRepository from './accountingDocument.repository.js';
import ocrResultRepository from './ocrResult.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';
import logger from '../../shared/logger/index.js';

class AccountingDocumentService {
  async upload(fileData, metadata, userId, meta = {}) {
    // Lazy import crypto for SHA-256 hash
    const { createHash } = await import('crypto');
    const hash = createHash('sha256').update(fileData.buffer).digest('hex');

    // Check duplicate by hash
    const duplicate = await accountingDocumentRepository.findByHash(hash);
    if (duplicate) {
      throw new ConflictError('A document with the same content already exists');
    }

    // Lazy import fileService for S3 upload
    const fileService = (await import('../../shared/services/fileService.js')).default;
    const uploadResult = await fileService.upload(fileData);

    // Compute retention: 10 years from now
    const retentionUntil = new Date();
    retentionUntil.setFullYear(retentionUntil.getFullYear() + 10);

    const ocrStatus = metadata.documentType === 'SUPPLIER_INVOICE' ? 'PENDING' : 'NOT_APPLICABLE';

    const doc = await accountingDocumentRepository.create({
      filePath: uploadResult.filePath || uploadResult.key,
      fileName: fileData.originalname,
      fileSize: fileData.size,
      mimeType: fileData.mimetype,
      fileHash: hash,
      documentType: metadata.documentType,
      ocrStatus,
      notes: metadata.notes || '',
      projectReference: metadata.projectReference || '',
      retentionUntil,
      createdBy: userId,
    });

    eventBus.publish(EVENT_TYPES.ACCOUNTING_DOCUMENT_UPLOADED, {
      documentId: doc._id,
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
      details: { documentId: doc._id, fileName: fileData.originalname, documentType: metadata.documentType },
      module: 'accounting',
    });

    logger.info('Accounting document uploaded', {
      module: 'accounting',
      action: 'document.upload',
      documentId: doc._id,
    });

    return doc;
  }

  async getById(id) {
    const doc = await accountingDocumentRepository.findById(id);
    if (!doc) throw new NotFoundError('AccountingDocument', id);
    return doc;
  }

  async getDownloadUrl(id) {
    const doc = await accountingDocumentRepository.findById(id);
    if (!doc) throw new NotFoundError('AccountingDocument', id);

    const fileService = (await import('../../shared/services/fileService.js')).default;
    return fileService.getDownloadUrl(doc.filePath);
  }

  async list(queryParams) {
    const { cursor, limit, sortBy, sortOrder, ...filters } = queryParams;
    return accountingDocumentRepository.findWithCursor({
      cursor,
      limit,
      sortBy,
      sortOrder,
      filters,
    });
  }

  async triggerOcr(documentId, userId, meta = {}) {
    const doc = await accountingDocumentRepository.findById(documentId);
    if (!doc) throw new NotFoundError('AccountingDocument', documentId);

    // Update OCR status to PROCESSING
    const AccountingDocument = (await import('./accountingDocument.model.js')).default;
    await AccountingDocument.findByIdAndUpdate(documentId, { ocrStatus: 'PROCESSING' });

    // Enqueue OCR processing job
    try {
      const queueManager = (await import('../../shared/queue/QueueManager.js')).default;
      await queueManager.enqueue('ocr-processing', {
        documentId,
        filePath: doc.filePath,
        userId,
      });
    } catch (err) {
      logger.warn('Queue manager not available, OCR job not enqueued', {
        module: 'accounting',
        documentId,
        error: err.message,
      });
    }

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
    const result = await ocrResultRepository.findByDocumentId(documentId);
    if (!result) throw new NotFoundError('OcrResult', documentId);

    const updated = await ocrResultRepository.updateStatus(documentId, 'CONFIRMED', {
      ...corrections,
      confirmedBy: userId,
      confirmedAt: new Date(),
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

    return updated;
  }

  async assignDocument(documentId, userId, assignedBy, meta = {}) {
    const doc = await accountingDocumentRepository.findById(documentId);
    if (!doc) throw new NotFoundError('AccountingDocument', documentId);

    const AccountingDocument = (await import('./accountingDocument.model.js')).default;
    const updated = await AccountingDocument.findByIdAndUpdate(
      documentId,
      {
        assignedTo: userId,
        assignedAt: new Date(),
        assignedBy,
      },
      { new: true, runValidators: true },
    ).lean();

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

  async bulkAssign(documentIds, userId, assignedBy, meta = {}) {
    const AccountingDocument = (await import('./accountingDocument.model.js')).default;
    const result = await AccountingDocument.updateMany(
      { _id: { $in: documentIds } },
      {
        $set: {
          assignedTo: userId,
          assignedAt: new Date(),
          assignedBy,
        },
      },
      { runValidators: true },
    );

    auditService.logEvent({
      eventType: 'accounting.document.bulk_assigned',
      userId: assignedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { documentIds, assignedTo: userId, modifiedCount: result.modifiedCount },
      module: 'accounting',
    });

    return { modifiedCount: result.modifiedCount };
  }
}

const accountingDocumentService = new AccountingDocumentService();
export default accountingDocumentService;
