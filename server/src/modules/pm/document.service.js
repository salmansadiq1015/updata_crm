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

    const doc = await documentRepository.create({
      projectId,
      fileId: fileMeta._id,
      fileName: fileData.originalName,
      category: fileData.category || 'OTHER',
      description: fileData.description || null,
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

    return documentRepository.findById(doc._id);
  }

  async listByProject(projectId, filters = {}) {
    const categoryPart = filters.category || 'all';
    const cacheKey = `pm:documents:project:${projectId}:${categoryPart}`;
    return cacheManager.getOrSet(
      cacheKey,
      () => documentRepository.findByProjectId(projectId, filters),
      ENTITY_TTL,
    );
  }

  async getById(id) {
    const doc = await documentRepository.findById(id);
    if (!doc) throw new NotFoundError('ProjectDocument', id);
    return doc;
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

    const updated = await documentRepository.updateById(id, data);

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

  async generate(projectId, templateType, userId, meta = {}) {
    // Lazy import to avoid circular dependencies
    const Project = (await import('./project.model.js')).default;
    const project = await Project.findById(projectId);
    if (!project) throw new NotFoundError('Project', projectId);

    // Placeholder: create a document record with isGenerated=true
    // Actual PDF generation is future work
    const doc = await documentRepository.create({
      projectId,
      fileName: `${templateType}-${Date.now()}.pdf`,
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

    return documentRepository.findById(doc._id);
  }

  async _invalidateCache(projectId) {
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}pm:documents:project:${projectId}:*`);
  }
}

const documentService = new DocumentService();
export default documentService;
