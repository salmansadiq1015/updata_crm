import mongoose from 'mongoose';
import documentIndexRepository from './documentIndex.repository.js';
import DocumentIndex from './documentIndex.model.js';
import GeneratedDocument from '../doctpl/generatedDocument.model.js';
import generatedDocumentRepository from '../doctpl/generatedDocument.repository.js';
import documentAccessPolicyService from '../doctpl/documentAccessPolicy.service.js';
import ProjectDocument from '../pm/projectDocument.model.js';
import Project from '../pm/project.model.js';
import AccountingDocument from '../accounting/accountingDocument.model.js';
import FileMetadata from '../files/file.model.js';
import fileService from '../files/file.service.js';
import storageService from '../../shared/storage/StorageService.js';
import auditService from '../auth/audit.service.js';
import { AuthorizationError, NotFoundError } from '../../shared/errors/AppError.js';
import { loadUserPermissions, satisfiesPermission } from '../../shared/middleware/authenticate.js';
import logger from '../../shared/logger/index.js';

const CENTRAL_SOURCES = ['repository', 'generated', 'project', 'customer', 'accounting', 'mobile'];
const SOURCE_LABELS = {
  repository: 'Repository',
  generated: 'Generated',
  project: 'Project',
  customer: 'Customer',
  accounting: 'Accounting',
  mobile: 'Mobile',
};

function cleanPathSegment(value = '') {
  return `${value}`.trim().replace(/[\\/]+/g, '-').replace(/\s+/g, '_').slice(0, 80);
}

function createRecordId(source, id) {
  return `${source}:${id}`;
}

export function parseRecordId(recordId) {
  const [source, id] = `${recordId || ''}`.split(':');
  if (!CENTRAL_SOURCES.includes(source) || !mongoose.Types.ObjectId.isValid(id)) return null;
  return { source, id };
}

function escapeRegex(value) {
  return `${value}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toStringId(value) {
  if (!value) return null;
  return String(value._id || value.id || value);
}

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeDate(value) {
  const date = toDate(value);
  return date ? date.toISOString() : null;
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null && entry !== ''));
}

// Section split (Dokumente / Dokumente mit Visum / Archiv). Only project
// documents carry the archived/visum flags; every other source is an ordinary
// current document (falls in "documents").
function matchesSection(doc, section) {
  if (!section || section === 'all') return true;
  const docSection = doc.archived ? 'archiv' : (doc.visum ? 'visum' : 'documents');
  return docSection === section;
}

function sortDocuments(items, sortOrder) {
  const direction = sortOrder === 'asc' ? 1 : -1;
  return items.sort((left, right) => {
    const leftDate = toDate(left.createdAt)?.getTime() || 0;
    const rightDate = toDate(right.createdAt)?.getTime() || 0;
    if (leftDate !== rightDate) return (leftDate - rightDate) * direction;
    return String(left.id).localeCompare(String(right.id)) * direction;
  });
}

function encodeCursor(item) {
  if (!item) return null;
  return Buffer.from(JSON.stringify({ createdAt: item.createdAt, id: item.id })).toString('base64url');
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8'));
    return decoded?.createdAt && decoded?.id ? decoded : null;
  } catch {
    return null;
  }
}

function isAfterCursor(item, cursor, sortOrder) {
  if (!cursor) return true;
  const direction = sortOrder === 'asc' ? 1 : -1;
  const itemDate = toDate(item.createdAt)?.getTime() || 0;
  const cursorDate = toDate(cursor.createdAt)?.getTime() || 0;
  if (itemDate !== cursorDate) return (itemDate - cursorDate) * direction > 0;
  return String(item.id).localeCompare(String(cursor.id)) * direction > 0;
}

function addDateFilter(filter, field, query) {
  if (!query.dateFrom && !query.dateTo) return;
  filter[field] = {};
  if (query.dateFrom) filter[field].$gte = new Date(query.dateFrom);
  if (query.dateTo) filter[field].$lte = new Date(query.dateTo);
}

function sourceAllowed(query, source) {
  return !query.source || query.source === 'all' || query.source === source;
}

function originAllowed(query, origin) {
  return !query.origin || query.origin === 'all' || query.origin === origin;
}

function hasPermission(permissions, permission) {
  return satisfiesPermission(permissions, permission);
}

function isAdmin(user) {
  return user?.role?.name === 'Admin' || user?.role === 'Admin';
}

class DocumentIndexService {
  async list(query = {}, user) {
    // An object (site) has no direct document link; documents reach it through its
    // projects. Resolve the site's projects and aggregate their documents. (Slice 1
    // of client feedback #18 — read-only, no model change.)
    if (query.siteId) return this._listBySite(query, user);

    const permissions = await this._permissions(user);
    const limit = Math.min(Number(query.limit || 25), 100);
    const cursor = decodeCursor(query.cursor);
    const fetchLimit = Math.max(limit + 1, Math.min(limit * 2, 200));

    const sources = await Promise.all([
      this._listRepositoryDocuments(query, fetchLimit, permissions, user),
      this._listGeneratedDocuments(query, fetchLimit, user),
      this._listProjectDocuments(query, fetchLimit, permissions, user),
      this._listCustomerDocuments(query, fetchLimit, permissions, user),
      this._listAccountingDocuments(query, fetchLimit, permissions, user),
      this._listMobileDocuments(query, fetchLimit, permissions, user),
    ]);

    const releasedOnly = await this._releasedOnly(user);
    const flat = sources.flat()
      .filter((item) => matchesSection(item, query.section))
      .filter((item) => !releasedOnly || item.releasedToField);
    const sorted = sortDocuments(flat.filter((item) => isAfterCursor(item, cursor, query.sortOrder)), query.sortOrder);
    const pageItems = sorted.slice(0, limit);
    const hasNext = sorted.length > limit;
    return {
      data: pageItems,
      pagination: {
        hasNext,
        nextCursor: hasNext ? encodeCursor(pageItems[pageItems.length - 1]) : null,
        limit,
      },
    };
  }

  async _listBySite(query, user) {
    const limit = Math.min(Number(query.limit || 25), 100);
    const projects = await Project.find({ siteId: query.siteId }).select('_id').lean();
    const projectIds = projects.map((project) => String(project._id));
    if (!projectIds.length) {
      return { data: [], pagination: { hasNext: false, nextCursor: null, limit } };
    }

    // Reuse the per-project federated list (each source already filters by projectId),
    // then merge + dedupe across the site's projects.
    const perProject = await Promise.all(
      projectIds.map((projectId) => this.list(
        { ...query, siteId: undefined, cursor: undefined, projectId, limit: 100 },
        user,
      )),
    );

    const seen = new Set();
    const merged = [];
    for (const result of perProject) {
      for (const doc of result.data) {
        if (doc?.id == null || seen.has(doc.id)) continue;
        seen.add(doc.id);
        merged.push(doc);
      }
    }

    const releasedOnlyForSite = await this._releasedOnly(user);
    const sorted = sortDocuments(
      releasedOnlyForSite ? merged.filter((doc) => doc.releasedToField) : merged,
      query.sortOrder,
    );
    const pageItems = sorted.slice(0, limit);
    return {
      data: pageItems,
      pagination: { hasNext: sorted.length > limit, nextCursor: null, limit },
    };
  }

  async upload(fileData, metadata, user, meta = {}) {
    if (!fileData?.buffer) throw new NotFoundError('File', 'multipart file');

    const folderPath = this._buildFolderPath(metadata);
    const fileMeta = await fileService.upload({
      buffer: fileData.buffer,
      originalName: fileData.originalname,
      mimeType: fileData.mimetype,
      sizeBytes: fileData.size,
      module: 'documents',
      entityType: metadata.sourceRecordType || 'repository_document',
      entityId: metadata.sourceRecordId || metadata.installationId || metadata.projectId || metadata.customerId || metadata.jobId || metadata.employeeId || null,
      uploadedBy: user._id,
      bucket: 'documents',
      folderPath,
      category: metadata.category || 'OTHER',
    });

    const record = await documentIndexRepository.create({
      source: 'repository',
      origin: 'uploaded',
      sourceDocumentId: fileMeta._id,
      fileId: fileMeta._id,
      title: metadata.title || fileData.originalname,
      fileName: fileData.originalname,
      mimeType: fileData.mimetype,
      fileSizeBytes: fileData.size,
      documentType: metadata.documentType || 'OTHER',
      category: metadata.category || 'OTHER',
      folderPath,
      description: metadata.description || '',
      sourceRecordType: metadata.sourceRecordType || '',
      sourceRecordId: metadata.sourceRecordId || null,
      customerId: metadata.customerId || null,
      projectId: metadata.projectId || null,
      jobId: metadata.jobId || null,
      employeeId: metadata.employeeId || null,
      installationId: metadata.installationId || null,
      ownerUserId: user._id,
      uploadedBy: user._id,
      metadata: { directUpload: true },
    });

    auditService.logEvent({
      eventType: 'document_repository.uploaded',
      userId: user._id,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { documentId: record._id, fileName: record.fileName, projectId: metadata.projectId, customerId: metadata.customerId },
      module: 'documents',
    });

    return this._normalizeRepositoryDocument(record);
  }

  async download(recordId, user, { attachment = false } = {}) {
    const parsed = parseRecordId(recordId);
    if (!parsed) throw new NotFoundError('Document', recordId);

    switch (parsed.source) {
      case 'repository':
        return this._downloadRepository(parsed.id, user, attachment);
      case 'generated':
        return this._downloadGenerated(parsed.id, user, attachment);
      case 'project':
        return this._downloadProject(parsed.id, user, attachment);
      case 'customer':
      case 'mobile':
        return this._downloadFileMetadata(parsed.id, user, attachment);
      case 'accounting':
        return this._downloadAccounting(parsed.id, user, attachment);
      default:
        throw new NotFoundError('Document', recordId);
    }
  }

  async setArchived(recordId, user, archived = true, meta = {}) {
    const parsed = parseRecordId(recordId);
    if (!parsed) throw new NotFoundError('Document', recordId);

    const update = archived
      ? { archived: true, archivedAt: new Date() }
      : { archived: false, archivedAt: null };

    switch (parsed.source) {
      case 'project': {
        const { default: projectDocumentService } = await import('../pm/document.service.js');
        await projectDocumentService.setArchived(parsed.id, user._id, archived, meta);
        break;
      }
      case 'repository': {
        const record = await documentIndexRepository.findById(parsed.id);
        if (!record) throw new NotFoundError('Document', recordId);
        await documentIndexRepository.updateById(parsed.id, update);
        break;
      }
      case 'generated': {
        const doc = await GeneratedDocument.findById(parsed.id);
        if (!doc) throw new NotFoundError('GeneratedDocument', recordId);
        await GeneratedDocument.findByIdAndUpdate(parsed.id, update);
        break;
      }
      case 'customer':
      case 'mobile': {
        const file = await FileMetadata.findById(parsed.id);
        if (!file) throw new NotFoundError('File', recordId);
        await FileMetadata.findByIdAndUpdate(parsed.id, update);
        break;
      }
      case 'accounting': {
        const accDoc = await AccountingDocument.findById(parsed.id);
        if (!accDoc) throw new NotFoundError('AccountingDocument', recordId);
        await AccountingDocument.findByIdAndUpdate(parsed.id, update);
        break;
      }
      default:
        throw new NotFoundError('Document', recordId);
    }

    auditService.logEvent({
      eventType: archived ? 'document_repository.archived' : 'document_repository.unarchived',
      userId: user._id,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { documentId: recordId, source: parsed.source },
      module: 'documents',
    });

    return { archived };
  }

  /**
   * Apply a flag update to whichever model backs a federated document record.
   * Visum and Freigabe travel the same five sources as archiving, so they route
   * the same way instead of each growing its own switch.
   */
  async _updateBackingRecord(recordId, update) {
    const parsed = parseRecordId(recordId);
    if (!parsed) throw new NotFoundError('Document', recordId);

    switch (parsed.source) {
      case 'project': {
        const { default: ProjectDocument } = await import('../pm/projectDocument.model.js');
        const doc = await ProjectDocument.findByIdAndUpdate(parsed.id, update);
        if (!doc) throw new NotFoundError('ProjectDocument', recordId);
        const { default: projectDocumentService } = await import('../pm/document.service.js');
        await projectDocumentService._invalidateCache(doc.projectId);
        break;
      }
      case 'repository': {
        const record = await documentIndexRepository.findById(parsed.id);
        if (!record) throw new NotFoundError('Document', recordId);
        await documentIndexRepository.updateById(parsed.id, update);
        break;
      }
      case 'generated': {
        const doc = await GeneratedDocument.findByIdAndUpdate(parsed.id, update);
        if (!doc) throw new NotFoundError('GeneratedDocument', recordId);
        break;
      }
      case 'customer':
      case 'mobile': {
        const file = await FileMetadata.findByIdAndUpdate(parsed.id, update);
        if (!file) throw new NotFoundError('File', recordId);
        break;
      }
      case 'accounting': {
        const doc = await AccountingDocument.findByIdAndUpdate(parsed.id, update);
        if (!doc) throw new NotFoundError('AccountingDocument', recordId);
        break;
      }
      default:
        throw new NotFoundError('Document', recordId);
    }
    return parsed;
  }

  /** Visum (sign-off) on any document of the federated list. */
  async setVisum(recordId, user, visiert = true, meta = {}) {
    const parsed = await this._updateBackingRecord(recordId, visiert
      ? { visumBy: user._id, visumAt: new Date() }
      : { visumBy: null, visumAt: null });

    auditService.logEvent({
      eventType: visiert ? 'document_repository.visum_set' : 'document_repository.visum_cleared',
      userId: user._id,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { documentId: recordId, source: parsed.source },
      module: 'documents',
    });

    return { visiert };
  }

  /** Digitales Dossier: release the document to the field, or take it back. */
  async setReleased(recordId, user, released = true, meta = {}) {
    const parsed = await this._updateBackingRecord(recordId, released
      ? { releasedToField: true, releasedAt: new Date(), releasedBy: user._id }
      : { releasedToField: false, releasedAt: null, releasedBy: null });

    auditService.logEvent({
      eventType: released ? 'document_repository.released' : 'document_repository.release_revoked',
      userId: user._id,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { documentId: recordId, source: parsed.source },
      module: 'documents',
    });

    return { released };
  }

  async delete(recordId, user, meta = {}) {
    const parsed = parseRecordId(recordId);
    if (!parsed) throw new NotFoundError('Document', recordId);
    const permissions = await this._permissions(user);
    if (!isAdmin(user) && !hasPermission(permissions, 'documents:delete')) {
      throw new AuthorizationError('You do not have permission to delete this document');
    }

    switch (parsed.source) {
      case 'repository':
        await this._deleteRepository(parsed.id, user);
        break;
      case 'generated':
        await this._deleteGenerated(parsed.id, user);
        break;
      case 'project': {
        const { default: projectDocumentService } = await import('../pm/document.service.js');
        await projectDocumentService.delete(parsed.id, user._id, meta);
        break;
      }
      case 'customer':
      case 'mobile':
        await fileService.delete(parsed.id);
        break;
      case 'accounting': {
        const { default: accountingDocumentService } = await import('../accounting/accountingDocument.service.js');
        await accountingDocumentService.deleteDocument(parsed.id, user._id, meta);
        break;
      }
      default:
        throw new NotFoundError('Document', recordId);
    }

    auditService.logEvent({
      eventType: 'document_repository.deleted',
      userId: user._id,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { documentId: recordId },
      module: 'documents',
    });

    return { deleted: true };
  }

  async _listRepositoryDocuments(query, limit, permissions, user) {
    if (!sourceAllowed(query, 'repository') || !originAllowed(query, 'uploaded')) return [];
    if (!isAdmin(user) && !hasPermission(permissions, 'documents:read')) return [];

    const result = await documentIndexRepository.findWithCursor({
      limit,
      sortBy: 'createdAt',
      sortOrder: query.sortOrder,
      filters: {
        ...query,
        source: 'repository',
        origin: query.origin === 'all' ? undefined : query.origin,
      },
    });
    return result.data.map((doc) => this._normalizeRepositoryDocument(doc));
  }

  async _listGeneratedDocuments(query, limit, user) {
    if (!sourceAllowed(query, 'generated') || !originAllowed(query, 'generated')) return [];
    const filter = {};
    addDateFilter(filter, 'generatedAt', query);
    if (query.documentType) filter.documentType = query.documentType;
    if (query.customerId) filter.sourceCustomerId = query.customerId;
    if (query.projectId) filter.sourceProjectId = query.projectId;
    if (query.jobId) filter.sourceRecordId = query.jobId;
    if (query.sourceRecordId) filter.sourceRecordId = query.sourceRecordId;
    if (query.search) {
      const regex = new RegExp(escapeRegex(query.search), 'i');
      filter.$or = [
        { fileName: regex },
        { documentType: regex },
        { sourceModule: regex },
        { 'metadata.customerName': regex },
        { 'metadata.projectName': regex },
      ];
    }

    const docs = await GeneratedDocument.find(filter)
      .sort({ generatedAt: query.sortOrder === 'asc' ? 1 : -1, _id: query.sortOrder === 'asc' ? 1 : -1 })
      .limit(limit)
      .select('-__v')
      .lean();
    const visible = [];
    for (const doc of docs) {
      if (await documentAccessPolicyService.canRead(doc, user)) visible.push(this._normalizeGeneratedDocument(doc));
    }
    return visible;
  }

  async _listProjectDocuments(query, limit, permissions, user) {
    if (!sourceAllowed(query, 'project')) return [];
    if (!originAllowed(query, 'uploaded') && !originAllowed(query, 'generated') && !originAllowed(query, 'draft')) return [];
    if (!isAdmin(user) && !hasPermission(permissions, 'project:documents:read') && !hasPermission(permissions, 'projects:read')) return [];

    const filter = {};
    addDateFilter(filter, 'createdAt', query);
    if (query.projectId) filter.projectId = query.projectId;
    if (query.category) filter.category = query.category;
    if (query.documentType) filter.templateType = query.documentType;
    if (query.status) filter.status = query.status;
    if (query.search) {
      const regex = new RegExp(escapeRegex(query.search), 'i');
      filter.$or = [{ fileName: regex }, { description: regex }, { templateType: regex }, { category: regex }];
    }

    const docs = await ProjectDocument.find(filter)
      .populate({ path: 'fileId', select: 'originalName mimeType sizeBytes folderPath category' })
      .populate({ path: 'visumBy', select: 'firstName lastName' })
      .sort({ createdAt: query.sortOrder === 'asc' ? 1 : -1, _id: query.sortOrder === 'asc' ? 1 : -1 })
      .limit(limit)
      .lean();
    return docs.map((doc) => this._normalizeProjectDocument(doc));
  }

  async _listCustomerDocuments(query, limit, permissions, user) {
    if (!sourceAllowed(query, 'customer') || !originAllowed(query, 'received') && !originAllowed(query, 'uploaded')) return [];
    if (!isAdmin(user) && !hasPermission(permissions, 'crm:read')) return [];

    const filter = { module: 'crm', entityType: 'customer' };
    addDateFilter(filter, 'createdAt', query);
    if (query.customerId) filter.entityId = query.customerId;
    if (query.category) filter.category = query.category;
    if (query.search) {
      const regex = new RegExp(escapeRegex(query.search), 'i');
      filter.$or = [{ originalName: regex }, { mimeType: regex }, { category: regex }, { folderPath: regex }];
    }

    const files = await FileMetadata.find(filter)
      .sort({ createdAt: query.sortOrder === 'asc' ? 1 : -1, _id: query.sortOrder === 'asc' ? 1 : -1 })
      .limit(limit)
      .lean();
    return files.map((file) => this._normalizeFileMetadata(file, {
      source: 'customer',
      origin: 'received',
      sourceRecordType: 'customer',
      customerId: file.entityId,
    }));
  }

  async _listAccountingDocuments(query, limit, permissions, user) {
    if (!sourceAllowed(query, 'accounting') || !originAllowed(query, 'received')) return [];
    if (!isAdmin(user) && !hasPermission(permissions, 'accounting:documents:read')) return [];

    const filter = {};
    addDateFilter(filter, 'createdAt', query);
    if (query.documentType) filter.documentType = query.documentType;
    if (query.category) filter.accountingCategory = query.category;
    if (query.status) filter.processingStatus = query.status;
    if (query.projectId) filter.projectId = query.projectId;
    if (query.customerId) filter.customerId = query.customerId;
    if (query.employeeId) filter.employeeId = query.employeeId;
    if (query.search) {
      const regex = new RegExp(escapeRegex(query.search), 'i');
      filter.$or = [
        { fileName: regex },
        { documentType: regex },
        { supplierName: regex },
        { projectReference: regex },
        { accountingCategory: regex },
        { notes: regex },
      ];
    }

    const docs = await AccountingDocument.find(filter)
      .sort({ createdAt: query.sortOrder === 'asc' ? 1 : -1, _id: query.sortOrder === 'asc' ? 1 : -1 })
      .limit(limit)
      .select('-__v')
      .lean();
    return docs.map((doc) => this._normalizeAccountingDocument(doc));
  }

  async _listMobileDocuments(query, limit, permissions, user) {
    if (!sourceAllowed(query, 'mobile') || !originAllowed(query, 'uploaded')) return [];
    if (!isAdmin(user) && !hasPermission(permissions, 'mobile:read') && !hasPermission(permissions, 'field-service:read')) return [];

    const filter = { module: 'mobile', entityType: 'document' };
    addDateFilter(filter, 'createdAt', query);
    if (query.jobId) filter.entityId = query.jobId;
    if (query.category) filter.category = query.category;
    if (query.search) {
      const regex = new RegExp(escapeRegex(query.search), 'i');
      filter.$or = [{ originalName: regex }, { mimeType: regex }, { category: regex }, { folderPath: regex }];
    }

    const files = await FileMetadata.find(filter)
      .sort({ createdAt: query.sortOrder === 'asc' ? 1 : -1, _id: query.sortOrder === 'asc' ? 1 : -1 })
      .limit(limit)
      .lean();
    return files.map((file) => this._normalizeFileMetadata(file, {
      source: 'mobile',
      origin: 'uploaded',
      sourceRecordType: 'job',
      jobId: file.entityId,
    }));
  }

  _normalizeRepositoryDocument(doc) {
    return compactObject({
      id: createRecordId('repository', doc._id),
      source: 'repository',
      sourceLabel: SOURCE_LABELS.repository,
      origin: 'uploaded',
      title: doc.title || doc.fileName,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      fileSizeBytes: doc.fileSizeBytes,
      documentType: doc.documentType,
      category: doc.category,
      status: doc.status,
      folderPath: doc.folderPath,
      description: doc.description,
      sourceRecordType: doc.sourceRecordType,
      sourceRecordId: toStringId(doc.sourceRecordId),
      customerId: toStringId(doc.customerId),
      projectId: toStringId(doc.projectId),
      jobId: toStringId(doc.jobId),
      employeeId: toStringId(doc.employeeId),
      installationId: toStringId(doc.installationId),
      ownerUserId: toStringId(doc.ownerUserId),
      uploadedBy: toStringId(doc.uploadedBy),
      createdAt: normalizeDate(doc.createdAt),
      updatedAt: normalizeDate(doc.updatedAt),
      archived: Boolean(doc.archived),
      visumBy: doc.visumBy || null,
      releasedToField: Boolean(doc.releasedToField),
      metadata: doc.metadata || {},
      canDelete: true,
    });
  }

  _normalizeGeneratedDocument(doc) {
    return compactObject({
      id: createRecordId('generated', doc._id),
      source: 'generated',
      sourceLabel: SOURCE_LABELS.generated,
      origin: 'generated',
      title: doc.metadata?.documentNumber || doc.fileName,
      fileName: doc.fileName,
      mimeType: 'application/pdf',
      fileSizeBytes: doc.fileSizeBytes,
      documentType: doc.documentType,
      category: doc.documentType,
      status: 'FINAL',
      folderPath: doc.metadata?.folderPath || '',
      sourceRecordType: doc.sourceModule,
      sourceRecordId: toStringId(doc.sourceRecordId),
      customerId: toStringId(doc.sourceCustomerId),
      projectId: toStringId(doc.sourceProjectId),
      employeeId: toStringId(doc.ownerUserId),
      ownerUserId: toStringId(doc.ownerUserId),
      uploadedBy: toStringId(doc.generatedBy),
      templateVersion: doc.templateVersion,
      pageCount: doc.pageCount,
      createdAt: normalizeDate(doc.generatedAt),
      archived: Boolean(doc.archived),
      visumBy: doc.visumBy || null,
      releasedToField: Boolean(doc.releasedToField),
      metadata: doc.metadata || {},
      canDelete: true,
    });
  }

  _normalizeProjectDocument(doc) {
    const file = typeof doc.fileId === 'object' ? doc.fileId : null;
    const origin = doc.status === 'DRAFT' ? 'draft' : doc.isGenerated ? 'generated' : 'uploaded';
    return compactObject({
      id: createRecordId('project', doc._id),
      source: 'project',
      sourceLabel: SOURCE_LABELS.project,
      origin,
      title: doc.fileName,
      fileName: file?.originalName || doc.fileName,
      // Underlying stored-file id — lets the client attach the document to an
      // email directly, without downloading it first.
      fileId: toStringId(file?._id),
      mimeType: file?.mimeType || '',
      fileSizeBytes: file?.sizeBytes || 0,
      documentType: doc.templateType || doc.category || 'OTHER',
      category: doc.category,
      status: doc.status || 'FINAL',
      folderPath: file?.folderPath || '',
      description: doc.description,
      sourceRecordType: 'project',
      sourceRecordId: toStringId(doc.projectId),
      projectId: toStringId(doc.projectId),
      uploadedBy: toStringId(doc.uploadedBy),
      createdAt: normalizeDate(doc.createdAt),
      updatedAt: normalizeDate(doc.updatedAt),
      // Section flags for the 3-way split (Dokumente / mit Visum / Archiv).
      archived: Boolean(doc.archived),
      visumBy: doc.visumBy || null,
      releasedToField: Boolean(doc.releasedToField),
      visum: doc.visumBy
        ? {
            by: toStringId(doc.visumBy),
            byName: (doc.visumBy && typeof doc.visumBy === 'object')
              ? [doc.visumBy.firstName, doc.visumBy.lastName].filter(Boolean).join(' ')
              : null,
            at: normalizeDate(doc.visumAt),
          }
        : null,
      metadata: { version: doc.version, previousVersionId: toStringId(doc.previousVersionId), isGenerated: Boolean(doc.isGenerated) },
      canDelete: true,
    });
  }

  _normalizeAccountingDocument(doc) {
    return compactObject({
      id: createRecordId('accounting', doc._id),
      source: 'accounting',
      sourceLabel: SOURCE_LABELS.accounting,
      origin: 'received',
      title: doc.fileName,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      fileSizeBytes: doc.fileSize,
      documentType: doc.documentType,
      category: doc.accountingCategory || doc.documentType,
      status: doc.processingStatus,
      folderPath: `Accounting/${doc.documentType}`,
      description: doc.notes,
      sourceRecordType: 'accounting',
      sourceRecordId: toStringId(doc._id),
      customerId: toStringId(doc.customerId),
      projectId: toStringId(doc.projectId),
      employeeId: toStringId(doc.employeeId),
      uploadedBy: toStringId(doc.createdBy),
      createdAt: normalizeDate(doc.createdAt),
      updatedAt: normalizeDate(doc.updatedAt),
      metadata: {
        ocrStatus: doc.ocrStatus,
        supplierName: doc.supplierName,
        projectReference: doc.projectReference,
        retentionUntil: normalizeDate(doc.retentionUntil),
        assignedTo: toStringId(doc.assignedTo),
      },
      archived: Boolean(doc.archived),
      visumBy: doc.visumBy || null,
      releasedToField: Boolean(doc.releasedToField),
      canDelete: Boolean(doc.retentionUntil && new Date(doc.retentionUntil) <= new Date()),
    });
  }

  _normalizeFileMetadata(file, context) {
    return compactObject({
      id: createRecordId(context.source, file._id),
      source: context.source,
      sourceLabel: SOURCE_LABELS[context.source],
      origin: context.origin,
      title: file.originalName,
      fileName: file.originalName,
      mimeType: file.mimeType,
      fileSizeBytes: file.sizeBytes,
      documentType: file.category || 'OTHER',
      category: file.category || 'OTHER',
      status: 'FINAL',
      folderPath: file.folderPath || `${SOURCE_LABELS[context.source]}/${file.category || 'general'}`,
      sourceRecordType: context.sourceRecordType,
      sourceRecordId: toStringId(file.entityId),
      customerId: toStringId(context.customerId),
      projectId: toStringId(context.projectId),
      jobId: toStringId(context.jobId),
      employeeId: toStringId(context.employeeId),
      uploadedBy: toStringId(file.uploadedBy),
      createdAt: normalizeDate(file.createdAt),
      updatedAt: normalizeDate(file.updatedAt),
      archived: Boolean(file.archived),
      visumBy: file.visumBy || null,
      releasedToField: Boolean(file.releasedToField),
      metadata: { bucket: file.bucket, storageBackend: file.storageBackend },
      canDelete: true,
    });
  }

  async _downloadRepository(id, user, attachment = false) {
    const record = await documentIndexRepository.findById(id);
    if (!record) throw new NotFoundError('Document', id);
    await this._assertRepositoryReadable(record, user);
    const opts = attachment ? { attachmentFilename: record.fileName } : {};
    return { downloadUrl: await fileService.getDownloadUrl(record.fileId, opts), fileName: record.fileName };
  }

  async _downloadGenerated(id, user, attachment = false) {
    const doc = await generatedDocumentRepository.findById(id);
    if (!doc) throw new NotFoundError('GeneratedDocument', id);
    await documentAccessPolicyService.assertCanRead(doc, user);
    const opts = attachment ? { attachmentFilename: doc.fileName } : {};
    return { downloadUrl: await fileService.getDownloadUrl(doc.fileId, opts), fileName: doc.fileName };
  }

  async _downloadProject(id, user, attachment = false) {
    const permissions = await this._permissions(user);
    if (!isAdmin(user) && !hasPermission(permissions, 'project:documents:read') && !hasPermission(permissions, 'projects:read')) {
      throw new AuthorizationError('You do not have access to this project document');
    }
    const { default: projectDocumentService } = await import('../pm/document.service.js');
    const doc = await projectDocumentService.getById(id);
    const fileName = doc.originalName || doc.fileName;
    const downloadUrl = attachment
      ? await projectDocumentService.getDownloadUrl(id, { attachmentFilename: fileName })
      : await projectDocumentService.getDownloadUrl(id);
    return { downloadUrl, fileName };
  }

  async _downloadFileMetadata(id, user, attachment = false) {
    const file = await fileService.getById(id);
    if (!file) throw new NotFoundError('File', id);
    const permissions = await this._permissions(user);
    const isCustomer = file.module === 'crm';
    const isMobile = file.module === 'mobile';
    const allowed = isAdmin(user)
      || (isCustomer && hasPermission(permissions, 'crm:read'))
      || (isMobile && (hasPermission(permissions, 'mobile:read') || hasPermission(permissions, 'field-service:read')));
    if (!allowed) throw new AuthorizationError('You do not have access to this file');
    const opts = attachment ? { attachmentFilename: file.originalName } : {};
    return { downloadUrl: await fileService.getDownloadUrl(id, opts), fileName: file.originalName };
  }

  async _downloadAccounting(id, user, attachment = false) {
    const permissions = await this._permissions(user);
    if (!isAdmin(user) && !hasPermission(permissions, 'accounting:documents:read')) {
      throw new AuthorizationError('You do not have access to this accounting document');
    }
    const doc = await AccountingDocument.findById(id).lean();
    if (!doc) throw new NotFoundError('AccountingDocument', id);
    const opts = attachment ? { attachmentFilename: doc.fileName } : {};
    return { downloadUrl: await storageService.getPresignedUrl(doc.filePath, undefined, opts), fileName: doc.fileName };
  }

  async _deleteRepository(id, user) {
    const record = await documentIndexRepository.findById(id);
    if (!record) throw new NotFoundError('Document', id);
    if (record.fileId) await fileService.delete(record.fileId);
    await documentIndexRepository.softDelete(id, user._id);
  }

  async _deleteGenerated(id, user) {
    const doc = await generatedDocumentRepository.findById(id);
    if (!doc) throw new NotFoundError('GeneratedDocument', id);
    await documentAccessPolicyService.assertCanDelete(doc, user);
    if (doc.fileId) await fileService.delete(doc.fileId);
    await generatedDocumentRepository.deleteById(id);
  }

  async _assertRepositoryReadable(record, user) {
    const permissions = await this._permissions(user);
    if (isAdmin(user) || hasPermission(permissions, 'documents:read')) return;
    if (record.ownerUserId && String(record.ownerUserId) === String(user?._id)) return;
    throw new AuthorizationError('You do not have access to this document');
  }

  /**
   * Digitales Dossier, repository side: without `documents:read:all` a user
   * only sees documents released to the field — the counterpart that makes the
   * Freigabe mean something instead of decorating a row.
   */
  async _releasedOnly(user) {
    if (user?.role?.name === 'Admin') return false;
    const permissions = await this._permissions(user);
    return !satisfiesPermission(permissions, 'documents:read:all');
  }

  async _permissions(user) {
    if (!user) return [];
    return loadUserPermissions(user);
  }

  _buildFolderPath(metadata) {
    const base = metadata.installationId
      ? `Installations/${metadata.installationId}`
      : metadata.projectId
        ? `Projects/${metadata.projectId}`
        : metadata.customerId
          ? `Customers/${metadata.customerId}`
          : metadata.jobId
            ? `Jobs/${metadata.jobId}`
            : metadata.employeeId
              ? `Employees/${metadata.employeeId}`
              : 'Documents';
    const folder = metadata.folderPath ? `${metadata.folderPath}` : base;
    return folder
      .split('/')
      .map((part) => cleanPathSegment(part))
      .filter(Boolean)
      .join('/');
  }

  /**
   * Everything that can travel as an email attachment, across the three places
   * a file actually lives: the repository index, generated documents, and
   * project documents. The index alone holds a fraction of the stored files,
   * which is why an attachment picker built on it looked almost empty.
   */
  async listAttachable({ siteId, customerId, projectId, search, limit = 100 } = {}) {
    const [DocumentIndex, GeneratedDocument, ProjectDocument] = await Promise.all([
      import('./documentIndex.model.js').then((m) => m.default),
      import('../doctpl/generatedDocument.model.js').then((m) => m.default),
      import('../pm/projectDocument.model.js').then((m) => m.default),
    ]);

    const rx = search
      ? new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      : null;
    const out = [];

    const repoFilter = { fileId: { $ne: null } };
    if (siteId) repoFilter.siteId = siteId;
    if (customerId) repoFilter.customerId = customerId;
    if (projectId) repoFilter.projectId = projectId;
    if (rx) repoFilter.$or = [{ title: rx }, { fileName: rx }];
    for (const doc of await DocumentIndex.find(repoFilter).sort({ createdAt: -1 }).limit(limit).lean()) {
      out.push({
        id: String(doc._id),
        fileId: String(doc.fileId),
        title: doc.title || doc.fileName,
        fileName: doc.fileName,
        createdAt: doc.createdAt,
        origin: 'repository',
      });
    }

    // Generated and project documents hang off projects, not off an object or a
    // customer — so scoping to one of those means scoping to its projects.
    let projectIds = projectId ? [projectId] : null;
    if (!projectIds && (siteId || customerId)) {
      const Project = (await import('../pm/project.model.js')).default;
      const scope = siteId ? { siteId } : { customerId };
      const projects = await Project.find({ ...scope, isDeleted: { $ne: true } }).select('_id').lean();
      projectIds = projects.map((project) => project._id);
    }

    const genFilter = { fileId: { $ne: null } };
    if (projectIds) genFilter.sourceRecordId = { $in: projectIds };
    if (rx) genFilter.fileName = rx;
    for (const doc of await GeneratedDocument.find(genFilter).sort({ generatedAt: -1 }).limit(limit).lean()) {
      out.push({
        id: String(doc._id),
        fileId: String(doc.fileId),
        title: doc.fileName,
        fileName: doc.fileName,
        createdAt: doc.generatedAt || doc.createdAt,
        origin: 'generated',
      });
    }

    const pdFilter = { fileId: { $ne: null } };
    if (projectIds) pdFilter.projectId = { $in: projectIds };
    if (rx) pdFilter.fileName = rx;
    for (const doc of await ProjectDocument.find(pdFilter).sort({ createdAt: -1 }).limit(limit).lean()) {
      out.push({
        id: String(doc._id),
        fileId: String(doc.fileId),
        title: doc.fileName,
        fileName: doc.fileName,
        createdAt: doc.createdAt,
        origin: 'project',
      });
    }

    // The same file can be indexed twice (a mobile upload mirrored into a
    // project) — an attachment is the file, so dedupe on it.
    const seen = new Set();
    return out
      .filter((doc) => {
        const key = String(doc.fileId);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, limit);
  }

}

const documentIndexService = new DocumentIndexService();
export default documentIndexService;
