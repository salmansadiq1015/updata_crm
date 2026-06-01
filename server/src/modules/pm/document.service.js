import documentRepository from './document.repository.js';
import auditService from '../auth/audit.service.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import { NotFoundError } from '../../shared/errors/AppError.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

const ENTITY_TTL = { l1Ttl: 60, l2Ttl: 300 };

class DocumentService {
  _enrichDocument(doc) {
    if (!doc) return doc;
    if (doc.fileId && typeof doc.fileId === 'object') {
      doc.originalName = doc.fileId.originalName || doc.fileName;
      doc.mimeType = doc.fileId.mimeType || null;
      doc.fileSize = doc.fileId.sizeBytes || null;
      doc.fileId = doc.fileId._id;
    }
    return doc;
  }

  _enrichDocuments(docs) {
    if (!Array.isArray(docs)) return docs;
    return docs.map((doc) => this._enrichDocument(doc));
  }

  async upload(projectId, fileData, uploadedBy, meta = {}) {
    // Lazy import to avoid circular dependencies
    const Project = (await import('./project.model.js')).default;
    const project = await Project.findById(projectId);
    if (!project) throw new NotFoundError('Project', projectId);

    // Lazy import file service
    const fileService = (await import('../files/file.service.js')).default;
    const fileMeta = await fileService.upload({
      buffer: fileData.buffer,
      originalName: fileData.originalName,
      mimeType: fileData.mimeType,
      sizeBytes: fileData.sizeBytes,
      module: 'pm',
      entityType: 'document',
      entityId: projectId,
      uploadedBy,
      bucket: 'documents',
    });

    // Versioning: if a document with the same fileName already exists for this
    // project, the new upload becomes the next version and links to the prior one.
    const prior = await documentRepository.findLatestByFileName(projectId, fileData.originalName);

    const doc = await documentRepository.create({
      projectId,
      fileId: fileMeta._id,
      fileName: fileData.originalName,
      category: fileData.category || 'OTHER',
      description: fileData.description || null,
      version: prior ? prior.version + 1 : 1,
      previousVersionId: prior ? prior._id : null,
      uploadedBy,
    });

    await this._invalidateCache(projectId);

    eventBus.publish(EVENT_TYPES.PROJECT_DOCUMENT_UPLOADED, {
      documentId: doc._id,
      projectId,
      fileName: fileData.originalName,
      category: doc.category,
      uploadedBy,
    }, { source: 'pm:documents' });

    auditService.logEvent({
      eventType: 'project_document.uploaded',
      userId: uploadedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { documentId: doc._id, projectId, fileName: fileData.originalName },
      module: 'pm',
    });

    logger.info('Project document uploaded', {
      module: 'pm',
      action: 'upload',
      documentId: doc._id,
      projectId,
    });

    return this._enrichDocument(await documentRepository.findById(doc._id));
  }

  /**
   * Create a ProjectDocument that references an already-stored file (no re-upload).
   * Used by mobile uploads (photos/documents targeting an order that belongs to a
   * project) so they appear in the PM Documents tab. Additive — never replaces the
   * mobile FileMetadata / MobilePhoto write.
   *
   * Returns the created document, or null when the project no longer exists.
   */
  async createFromStoredFile(projectId, {
    fileId, fileName, category = 'OTHER', uploadedBy, isGenerated = false,
  }, meta = {}) {
    const Project = (await import('./project.model.js')).default;
    const project = await Project.findById(projectId).select('_id').lean();
    if (!project) return null;

    const prior = await documentRepository.findLatestByFileName(projectId, fileName);

    const doc = await documentRepository.create({
      projectId,
      fileId,
      fileName,
      category,
      version: prior ? prior.version + 1 : 1,
      previousVersionId: prior ? prior._id : null,
      isGenerated,
      uploadedBy,
    });

    await this._invalidateCache(projectId);

    eventBus.publish(EVENT_TYPES.PROJECT_DOCUMENT_UPLOADED, {
      documentId: doc._id,
      projectId,
      fileName,
      category,
      uploadedBy,
    }, { source: 'pm:documents' });

    auditService.logEvent({
      eventType: 'project_document.uploaded',
      userId: uploadedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { documentId: doc._id, projectId, fileName, origin: 'mobile' },
      module: 'pm',
    });

    logger.info('Project document linked from mobile upload', {
      module: 'pm',
      action: 'createFromStoredFile',
      documentId: doc._id,
      projectId,
    });

    return doc;
  }

  async listByProject(projectId, filters = {}) {
    const categoryPart = filters.category || 'all';
    const cacheKey = `pm:documents:project:${projectId}:${categoryPart}`;
    return cacheManager.getOrSet(
      cacheKey,
      async () => this._enrichDocuments(await documentRepository.findByProjectId(projectId, filters)),
      ENTITY_TTL,
    );
  }

  async getById(id) {
    const doc = await documentRepository.findById(id);
    if (!doc) throw new NotFoundError('ProjectDocument', id);
    return this._enrichDocument(doc);
  }

  async getDownloadUrl(id) {
    const doc = await documentRepository.findById(id);
    if (!doc) throw new NotFoundError('ProjectDocument', id);

    // Lazy import file service
    const fileService = (await import('../files/file.service.js')).default;
    const url = await fileService.getDownloadUrl(doc.fileId);
    return url;
  }

  async updateMetadata(id, data, updatedBy, meta = {}) {
    const existing = await documentRepository.findById(id);
    if (!existing) throw new NotFoundError('ProjectDocument', id);

    const updated = this._enrichDocument(await documentRepository.updateById(id, data));

    await this._invalidateCache(existing.projectId);

    auditService.logEvent({
      eventType: 'project_document.updated',
      userId: updatedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { documentId: id, projectId: existing.projectId, changedFields: Object.keys(data) },
      module: 'pm',
    });

    return updated;
  }

  async delete(id, deletedBy, meta = {}) {
    const existing = await documentRepository.findById(id);
    if (!existing) throw new NotFoundError('ProjectDocument', id);

    await documentRepository.softDelete(id);

    await this._invalidateCache(existing.projectId);

    eventBus.publish(EVENT_TYPES.PROJECT_DOCUMENT_DELETED, {
      documentId: id,
      projectId: existing.projectId,
      deletedBy,
    }, { source: 'pm:documents' });

    auditService.logEvent({
      eventType: 'project_document.deleted',
      userId: deletedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { documentId: id, projectId: existing.projectId },
      module: 'pm',
    });

    logger.info('Project document deleted', {
      module: 'pm',
      action: 'delete',
      documentId: id,
      projectId: existing.projectId,
    });
  }

  async restore(docId, projectId, userId, meta = {}) {
    const doc = await documentRepository.findById(docId);
    if (!doc) throw new NotFoundError('ProjectDocument', docId);

    if (!doc.isDeleted) {
      const { ConflictError } = await import('../../shared/errors/AppError.js');
      throw new ConflictError('Document is not deleted');
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    if (doc.deletedAt && doc.deletedAt < thirtyDaysAgo) {
      const { ConflictError } = await import('../../shared/errors/AppError.js');
      throw new ConflictError('Document can only be restored within 30 days of deletion');
    }

    await documentRepository.restore(docId);
    await this._invalidateCache(projectId);

    auditService.logEvent({
      eventType: 'project_document.restored',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { documentId: docId, projectId },
      module: 'pm',
    });

    return this._enrichDocument(await documentRepository.findById(docId));
  }

  async generate(projectId, templateType, userId, meta = {}) {
    const Project = (await import('./project.model.js')).default;
    const project = await Project.findById(projectId)
      .populate('customerId', 'name customerNumber street postalCode city canton')
      .populate('projectManagerId', 'firstName lastName email phone')
      .populate('siteId', 'name street postalCode city canton');
    if (!project) throw new NotFoundError('Project', projectId);

    const templateData = {
      documentNumber: project.projectNumber,
      documentDate: new Date().toISOString().split('T')[0],
      customer: project.customerId ? {
        name: project.customerId.name,
        addressLine1: project.customerId.street,
        plz: project.customerId.postalCode,
        city: project.customerId.city,
      } : null,
      projectName: project.name,
      projectNumber: project.projectNumber,
      projectType: project.projectType,
      projectManager: project.projectManagerId
        ? `${project.projectManagerId.firstName} ${project.projectManagerId.lastName}`
        : null,
      site: project.siteId ? {
        name: project.siteId.name,
        address: `${project.siteId.street || ''}, ${project.siteId.postalCode || ''} ${project.siteId.city || ''}`.trim(),
      } : null,
      plannedStartDate: project.plannedStartDate?.toISOString().split('T')[0],
      plannedEndDate: project.plannedEndDate?.toISOString().split('T')[0],
    };

    const documentGenerationService = (await import('../doctpl/documentGeneration.service.js')).default;
    const generatedDoc = await documentGenerationService.generate({
      templateType,
      sourceModule: 'pm',
      sourceRecordId: projectId,
      data: templateData,
      language: 'de',
      generatedBy: userId,
      meta,
    });

    const doc = await documentRepository.create({
      projectId,
      fileId: generatedDoc.fileId,
      fileName: generatedDoc.fileName,
      category: 'REPORTS',
      isGenerated: true,
      uploadedBy: userId,
    });

    await this._invalidateCache(projectId);

    eventBus.publish(EVENT_TYPES.PROJECT_DOCUMENT_GENERATED, {
      documentId: doc._id,
      projectId,
      templateType,
      userId,
    }, { source: 'pm:documents' });

    auditService.logEvent({
      eventType: 'project_document.generated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { documentId: doc._id, projectId, templateType },
      module: 'pm',
    });

    logger.info('Project document generated', {
      module: 'pm',
      action: 'generate',
      documentId: doc._id,
      projectId,
      templateType,
    });

    return this._enrichDocument(await documentRepository.findById(doc._id));
  }

  async _invalidateCache(projectId) {
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}pm:documents:project:${projectId}:*`);
  }
}

const documentService = new DocumentService();
export default documentService;
