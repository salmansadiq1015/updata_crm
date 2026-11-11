import mongoose from 'mongoose';
import crypto from 'crypto';
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
import cacheManager from '../../shared/cache/CacheManager.js';
import auditService from '../auth/audit.service.js';
import { AuthorizationError, NotFoundError, ValidationError } from '../../shared/errors/AppError.js';
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

/** Date each source sorts and pages on (generated documents carry their own). */
const DATE_FIELD = {
  repository: 'createdAt', generated: 'generatedAt', project: 'createdAt',
  customer: 'createdAt', accounting: 'createdAt', mobile: 'createdAt',
};

const SCOPE_KEYS = ['customerId', 'projectId', 'jobId', 'employeeId', 'installationId', 'sourceRecordType', 'sourceRecordId'];
const STATS_TTL = { l1Ttl: 20, l2Ttl: 60 };
const FACETS_TTL = { l1Ttl: 120, l2Ttl: 600 };
const STATS_GEN_KEY = 'documents:stats:gen';

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

/** Plain code-point comparison: the same order the per-source keyset clauses use. */
function compareIds(left, right) {
  const a = String(left);
  const b = String(right);
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function sortDocuments(items, sortOrder) {
  const direction = sortOrder === 'asc' ? 1 : -1;
  return items.sort((left, right) => {
    const leftDate = toDate(left.createdAt)?.getTime() || 0;
    const rightDate = toDate(right.createdAt)?.getTime() || 0;
    if (leftDate !== rightDate) return (leftDate - rightDate) * direction;
    return compareIds(left.id, right.id) * direction;
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
    if (!decoded?.createdAt || !decoded?.id || !toDate(decoded.createdAt) || !parseRecordId(decoded.id)) return null;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Keyset clause for one source: everything strictly after the cursor in the
 * merged order (date, then the full "source:oid" id). Pushing this into each
 * query is what lets page 2, 3, … reach older documents — filtering a fixed
 * "newest N" window in memory silently dropped them.
 */
export function keysetClause(source, dateField, cursor, sortOrder) {
  if (!cursor) return null;
  const date = new Date(cursor.createdAt);
  const parsed = parseRecordId(cursor.id);
  const after = sortOrder === 'asc' ? '$gt' : '$lt';
  const or = [{ [dateField]: { [after]: date } }];
  if (parsed.source === source) {
    or.push({ [dateField]: date, _id: { [after]: new mongoose.Types.ObjectId(parsed.id) } });
  } else if (sortOrder === 'asc' ? source > parsed.source : source < parsed.source) {
    or.push({ [dateField]: date });
  }
  return { $or: or };
}

/** Inclusive date range; a date-only "to" covers that whole day. */
function dateRange(query) {
  if (!query.dateFrom && !query.dateTo) return null;
  const range = {};
  if (query.dateFrom) range.$gte = new Date(query.dateFrom);
  if (query.dateTo) {
    const to = new Date(query.dateTo);
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(query.dateTo)) || (to.getUTCHours() === 0 && to.getUTCMinutes() === 0 && to.getUTCSeconds() === 0)) {
      to.setUTCHours(23, 59, 59, 999);
    }
    range.$lte = to;
  }
  return range;
}

/** Section (Dokumente / mit Visum / Archiv) and field release, applied in the query. */
function sectionClause(section, releasedOnly) {
  const filter = {};
  if (section === 'archiv') filter.archived = true;
  else if (section === 'visum') { filter.archived = { $ne: true }; filter.visumBy = { $ne: null }; }
  else if (section === 'documents') { filter.archived = { $ne: true }; filter.visumBy = null; }
  if (releasedOnly) filter.releasedToField = true;
  return filter;
}

function andAll(...clauses) {
  const parts = clauses.filter((c) => c && Object.keys(c).length);
  if (!parts.length) return {};
  if (parts.length === 1) return parts[0];
  return { $and: parts };
}

function searchClause(search, fields) {
  const text = `${search || ''}`.trim();
  if (!text) return null;
  const regex = new RegExp(escapeRegex(text.slice(0, 200)), 'i');
  return { $or: fields.map((field) => ({ [field]: regex })) };
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

function oid(value) {
  return value instanceof mongoose.Types.ObjectId ? value : new mongoose.Types.ObjectId(String(value));
}

function inIds(ids) {
  return { $in: ids.map(oid) };
}

const fullName = (u) => (u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || null : null);

class DocumentIndexService {
  /**
   * One page of the federated document list.
   *
   * Every source query carries the same keyset, section, release and scope
   * filters, so each returns only rows that can belong to this page; the merge
   * then takes the first `limit`. Link targets (customer, project, job,
   * employee, installation) are resolved to names in one batch per type.
   */
  async list(query = {}, user) {
    const ctx = await this._listContext(query, user);
    if (ctx.empty) return { data: [], pagination: { hasNext: false, nextCursor: null, limit: ctx.limit } };

    const fetchLimit = ctx.limit + 1;
    const sources = await Promise.all([
      this._listRepositoryDocuments(query, fetchLimit, ctx),
      this._listGeneratedDocuments(query, fetchLimit, ctx),
      this._listProjectDocuments(query, fetchLimit, ctx),
      this._listCustomerDocuments(query, fetchLimit, ctx),
      this._listAccountingDocuments(query, fetchLimit, ctx),
      this._listMobileDocuments(query, fetchLimit, ctx),
    ]);

    const sorted = sortDocuments(sources.flat(), query.sortOrder);
    const pageItems = sorted.slice(0, ctx.limit);
    const hasNext = sorted.length > ctx.limit;
    await this._attachNames(pageItems);
    const canDelete = isAdmin(user) || hasPermission(ctx.permissions, 'documents:delete');
    for (const item of pageItems) item.canDelete = Boolean(item.canDelete && canDelete);

    return {
      data: pageItems,
      pagination: {
        hasNext,
        nextCursor: hasNext ? encodeCursor(pageItems[pageItems.length - 1]) : null,
        limit: ctx.limit,
      },
    };
  }

  /** Permissions, cursor and the project scope a site or customer filter implies. */
  async _listContext(query, user) {
    const permissions = await this._permissions(user);
    const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 100);
    const ctx = {
      user,
      permissions,
      limit,
      cursor: decodeCursor(query.cursor),
      releasedOnly: await this._releasedOnly(user, permissions),
      section: query.section || 'all',
      siteProjectIds: null,
      customerProjectIds: null,
      empty: false,
    };
    // An object (site) has no direct document link; documents reach it through
    // its projects — one $in instead of a federated list per project.
    if (query.siteId) {
      const projects = await Project.find({ siteId: query.siteId }).select('_id').lean();
      ctx.siteProjectIds = projects.map((p) => p._id);
      if (!ctx.siteProjectIds.length) ctx.empty = true;
    }
    // Project documents belong to a customer through their project.
    if (query.customerId && sourceAllowed(query, 'project')) {
      const projects = await Project.find({ customerId: query.customerId }).select('_id').lean();
      ctx.customerProjectIds = projects.map((p) => p._id);
    }
    return ctx;
  }

  /** True when the request scopes to a link this source can never carry. */
  _unsupportedScope(query, supported) {
    return SCOPE_KEYS.some((key) => query[key] && !supported.includes(key));
  }

  async _listRepositoryDocuments(query, limit, ctx) {
    if (!sourceAllowed(query, 'repository') || !originAllowed(query, 'uploaded')) return [];
    if (!isAdmin(ctx.user) && !hasPermission(ctx.permissions, 'documents:read')) return [];
    const scope = { source: 'repository' };
    for (const key of ['customerId', 'projectId', 'jobId', 'employeeId', 'installationId', 'sourceRecordId']) {
      if (query[key]) scope[key] = oid(query[key]);
    }
    if (query.sourceRecordType) scope.sourceRecordType = query.sourceRecordType;
    if (ctx.siteProjectIds) scope.projectId = inIds(ctx.siteProjectIds);
    if (query.documentType) scope.documentType = query.documentType;
    if (query.category) scope.category = query.category;
    if (query.status) scope.status = query.status;
    const range = dateRange(query);
    if (range) scope.createdAt = range;

    const filter = andAll(
      scope,
      sectionClause(ctx.section, ctx.releasedOnly),
      searchClause(query.search, ['title', 'fileName', 'description', 'documentType', 'category', 'folderPath']),
      keysetClause('repository', 'createdAt', ctx.cursor, query.sortOrder),
    );
    const direction = query.sortOrder === 'asc' ? 1 : -1;
    const docs = await DocumentIndex.find(filter).sort({ createdAt: direction, _id: direction }).limit(limit).select('-__v').lean();
    return docs.map((doc) => this._normalizeRepositoryDocument(doc));
  }

  async _listGeneratedDocuments(query, limit, ctx) {
    if (!sourceAllowed(query, 'generated') || !originAllowed(query, 'generated')) return [];
    if (this._unsupportedScope(query, ['customerId', 'projectId', 'jobId', 'sourceRecordId', 'sourceRecordType'])) return [];
    if (query.status && query.status !== 'FINAL') return [];
    const scope = {};
    if (query.customerId) scope.sourceCustomerId = oid(query.customerId);
    if (query.projectId) scope.sourceProjectId = oid(query.projectId);
    if (ctx.siteProjectIds) scope.sourceProjectId = inIds(ctx.siteProjectIds);
    if (query.jobId) scope.sourceRecordId = oid(query.jobId);
    if (query.sourceRecordId) scope.sourceRecordId = oid(query.sourceRecordId);
    if (query.sourceRecordType) scope.sourceModule = query.sourceRecordType;
    // A generated document's category is its document type.
    if (query.documentType || query.category) {
      if (query.documentType && query.category && query.documentType !== query.category) return [];
      scope.documentType = query.documentType || query.category;
    }
    const range = dateRange(query);
    if (range) scope.generatedAt = range;

    const filter = andAll(
      scope,
      sectionClause(ctx.section, ctx.releasedOnly),
      searchClause(query.search, ['fileName', 'documentType', 'sourceModule', 'metadata.documentNumber', 'metadata.customerName', 'metadata.projectName']),
      keysetClause('generated', 'generatedAt', ctx.cursor, query.sortOrder),
    );
    const direction = query.sortOrder === 'asc' ? 1 : -1;
    const docs = await GeneratedDocument.find(filter).sort({ generatedAt: direction, _id: direction }).limit(limit).select('-__v').lean();
    // Permissions are cached per user, so the per-document policy runs in parallel.
    const readable = await Promise.all(docs.map((doc) => documentAccessPolicyService.canRead(doc, ctx.user)));
    return docs.filter((_, i) => readable[i]).map((doc) => this._normalizeGeneratedDocument(doc));
  }

  async _listProjectDocuments(query, limit, ctx) {
    if (!sourceAllowed(query, 'project')) return [];
    if (!originAllowed(query, 'uploaded') && !originAllowed(query, 'generated') && !originAllowed(query, 'draft')) return [];
    if (!isAdmin(ctx.user) && !hasPermission(ctx.permissions, 'project:documents:read') && !hasPermission(ctx.permissions, 'projects:read')) return [];
    if (this._unsupportedScope(query, ['customerId', 'projectId', 'sourceRecordId', 'sourceRecordType'])) return [];
    if (query.sourceRecordType && query.sourceRecordType !== 'project') return [];

    const scope = {};
    const projectScopes = [];
    if (query.projectId) projectScopes.push([oid(query.projectId)]);
    if (query.sourceRecordId) projectScopes.push([oid(query.sourceRecordId)]);
    if (ctx.siteProjectIds) projectScopes.push(ctx.siteProjectIds);
    if (query.customerId) projectScopes.push(ctx.customerProjectIds || []);
    if (projectScopes.length) {
      const allowed = projectScopes.reduce((acc, ids) => acc.filter((id) => ids.some((x) => String(x) === String(id))));
      if (!allowed.length) return [];
      scope.projectId = inIds(allowed);
    }
    // Origin is derived: draft status, generated flag, else uploaded.
    if (query.origin === 'draft') scope.status = 'DRAFT';
    else if (query.origin === 'generated') { scope.isGenerated = true; scope.status = { $ne: 'DRAFT' }; }
    else if (query.origin === 'uploaded') { scope.isGenerated = { $ne: true }; scope.status = { $ne: 'DRAFT' }; }
    if (query.category) scope.category = query.category;
    if (query.documentType) scope.$or = [{ templateType: query.documentType }, { templateType: null, category: query.documentType }];
    if (query.status) scope.status = query.status;
    const range = dateRange(query);
    if (range) scope.createdAt = range;

    const filter = andAll(
      scope,
      sectionClause(ctx.section, ctx.releasedOnly),
      searchClause(query.search, ['fileName', 'description', 'templateType', 'category']),
      keysetClause('project', 'createdAt', ctx.cursor, query.sortOrder),
    );
    const direction = query.sortOrder === 'asc' ? 1 : -1;
    const docs = await ProjectDocument.find(filter)
      .populate({ path: 'fileId', select: 'originalName mimeType sizeBytes folderPath category' })
      .sort({ createdAt: direction, _id: direction })
      .limit(limit)
      .lean();
    return docs.map((doc) => this._normalizeProjectDocument(doc));
  }

  async _listCustomerDocuments(query, limit, ctx) {
    if (!sourceAllowed(query, 'customer') || (!originAllowed(query, 'received') && !originAllowed(query, 'uploaded'))) return [];
    if (!isAdmin(ctx.user) && !hasPermission(ctx.permissions, 'crm:read')) return [];
    if (ctx.siteProjectIds) return [];
    if (this._unsupportedScope(query, ['customerId', 'sourceRecordId', 'sourceRecordType'])) return [];
    if (query.sourceRecordType && query.sourceRecordType !== 'customer') return [];
    if (query.status && query.status !== 'FINAL') return [];
    return this._listFiles('customer', { module: 'crm', entityType: 'customer' }, query.customerId || query.sourceRecordId, query, limit, ctx);
  }

  async _listMobileDocuments(query, limit, ctx) {
    if (!sourceAllowed(query, 'mobile') || !originAllowed(query, 'uploaded')) return [];
    if (!isAdmin(ctx.user) && !hasPermission(ctx.permissions, 'mobile:read') && !hasPermission(ctx.permissions, 'field-service:read')) return [];
    if (ctx.siteProjectIds) return [];
    if (this._unsupportedScope(query, ['jobId', 'sourceRecordId', 'sourceRecordType'])) return [];
    if (query.sourceRecordType && query.sourceRecordType !== 'job') return [];
    if (query.status && query.status !== 'FINAL') return [];
    return this._listFiles('mobile', { module: 'mobile', entityType: 'document' }, query.jobId || query.sourceRecordId, query, limit, ctx);
  }

  /** Customer and mobile documents are plain stored files; their type is their category. */
  async _listFiles(source, base, entityId, query, limit, ctx) {
    const scope = { ...base };
    if (entityId) scope.entityId = oid(entityId);
    if (query.documentType || query.category) {
      if (query.documentType && query.category && query.documentType !== query.category) return [];
      scope.category = query.documentType || query.category;
    }
    const range = dateRange(query);
    if (range) scope.createdAt = range;
    const filter = andAll(
      scope,
      sectionClause(ctx.section, ctx.releasedOnly),
      searchClause(query.search, ['originalName', 'category', 'folderPath']),
      keysetClause(source, 'createdAt', ctx.cursor, query.sortOrder),
    );
    const direction = query.sortOrder === 'asc' ? 1 : -1;
    const files = await FileMetadata.find(filter).sort({ createdAt: direction, _id: direction }).limit(limit).lean();
    return files.map((file) => this._normalizeFileMetadata(file, source === 'customer'
      ? { source, origin: 'received', sourceRecordType: 'customer', customerId: file.entityId }
      : { source, origin: 'uploaded', sourceRecordType: 'job', jobId: file.entityId }));
  }

  async _listAccountingDocuments(query, limit, ctx) {
    if (!sourceAllowed(query, 'accounting') || !originAllowed(query, 'received')) return [];
    if (!isAdmin(ctx.user) && !hasPermission(ctx.permissions, 'accounting:documents:read')) return [];
    if (this._unsupportedScope(query, ['customerId', 'projectId', 'employeeId', 'sourceRecordType', 'sourceRecordId'])) return [];
    if (query.sourceRecordType && query.sourceRecordType !== 'accounting') return [];

    const scope = {};
    if (query.documentType) scope.documentType = query.documentType;
    if (query.category) scope.accountingCategory = query.category;
    if (query.status) scope.processingStatus = query.status;
    if (query.projectId) scope.projectId = oid(query.projectId);
    if (ctx.siteProjectIds) scope.projectId = inIds(ctx.siteProjectIds);
    if (query.customerId) scope.customerId = oid(query.customerId);
    if (query.employeeId) scope.employeeId = oid(query.employeeId);
    if (query.sourceRecordId) scope._id = oid(query.sourceRecordId);
    const range = dateRange(query);
    if (range) scope.createdAt = range;

    const filter = andAll(
      scope,
      sectionClause(ctx.section, ctx.releasedOnly),
      searchClause(query.search, ['fileName', 'documentType', 'supplierName', 'projectReference', 'accountingCategory', 'notes']),
      keysetClause('accounting', 'createdAt', ctx.cursor, query.sortOrder),
    );
    const direction = query.sortOrder === 'asc' ? 1 : -1;
    const docs = await AccountingDocument.find(filter).sort({ createdAt: direction, _id: direction }).limit(limit).select('-__v -fullText').lean();
    return docs.map((doc) => this._normalizeAccountingDocument(doc));
  }

  /**
   * Replaces raw ids with readable links and names: one query per entity type
   * for the whole page, never one per row.
   */
  async _attachNames(items) {
    if (!items.length) return items;
    const want = { customer: new Set(), project: new Set(), job: new Set(), user: new Set(), installation: new Set() };
    const add = (set, id) => { if (id && mongoose.Types.ObjectId.isValid(id)) set.add(String(id)); };
    for (const item of items) {
      add(want.customer, item.customerId);
      add(want.project, item.projectId);
      add(want.job, item.jobId);
      add(want.user, item.employeeId);
      add(want.user, item.uploadedBy);
      add(want.user, item.visumBy);
      add(want.installation, item.installationId);
    }
    const ids = (set) => [...set].map(oid);
    const model = (name) => mongoose.models[name];
    const load = (name, set, select) => (set.size && model(name)
      ? model(name).find({ _id: { $in: ids(set) } }, select, { includeDeleted: true }).lean()
      : Promise.resolve([]));
    const [customers, projects, jobs, users, installations] = await Promise.all([
      load('Customer', want.customer, 'name customerNumber'),
      load('Project', want.project, 'name projectNumber'),
      load('Assignment', want.job, 'assignmentNumber title'),
      load('User', want.user, 'firstName lastName email'),
      load('Installation', want.installation, 'installationNumber make model'),
    ]).catch((err) => {
      logger.warn('Document link names could not be resolved', { module: 'documents', error: err.message });
      return [[], [], [], [], []];
    });
    const byId = (rows, label) => new Map(rows.map((r) => [String(r._id), label(r)]));
    const names = {
      customer: byId(customers, (c) => ({ label: c.name, code: c.customerNumber })),
      project: byId(projects, (p) => ({ label: p.name, code: p.projectNumber })),
      job: byId(jobs, (j) => ({ label: j.title || j.assignmentNumber, code: j.assignmentNumber })),
      employee: byId(users, (u) => ({ label: fullName(u) })),
      installation: byId(installations, (i) => ({ label: [i.make, i.model].filter(Boolean).join(' ') || i.installationNumber, code: i.installationNumber })),
    };

    for (const item of items) {
      const links = [];
      for (const [type, key] of [['customer', 'customerId'], ['project', 'projectId'], ['job', 'jobId'], ['employee', 'employeeId'], ['installation', 'installationId']]) {
        if (!item[key]) continue;
        const hit = names[type].get(String(item[key]));
        links.push(compactObject({ type, id: String(item[key]), label: hit?.label || null, code: hit?.code || null, missing: !hit || undefined }));
      }
      if (!links.length && item.sourceRecordType && item.sourceRecordId && !['accounting', 'project', 'customer'].includes(item.sourceRecordType)) {
        links.push({ type: item.sourceRecordType, id: String(item.sourceRecordId) });
      }
      item.links = links;
      if (item.uploadedBy) item.uploadedByName = names.employee.get(String(item.uploadedBy))?.label || null;
      if (item.visumBy) {
        item.visum = {
          by: String(item.visumBy),
          byName: names.employee.get(String(item.visumBy))?.label || null,
          at: item.visumAt || null,
        };
      }
    }
    return items;
  }

  // ── Stats, facets, pickers ────────────────────────────────────────────────

  /**
   * Header figures: documents per section, uploaded this month and storage,
   * across every source this user may read. Cached briefly per permission set
   * (all counts are index-backed); any write through this module bumps a
   * generation so the next read is fresh.
   */
  async stats(user) {
    const permissions = await this._permissions(user);
    const releasedOnly = await this._releasedOnly(user, permissions);
    const gen = (await cacheManager.get(STATS_GEN_KEY, { skipL1: true })) || 0;
    const scopeKey = crypto.createHash('sha1').update(JSON.stringify([isAdmin(user), [...permissions].sort(), releasedOnly])).digest('hex').slice(0, 16);
    return cacheManager.getOrSet(`documents:stats:${gen}:${scopeKey}`, () => this._computeStats(user, permissions, releasedOnly), STATS_TTL);
  }

  async _computeStats(user, permissions, releasedOnly) {
    const admin = isAdmin(user);
    const can = (...perms) => admin || perms.some((p) => hasPermission(permissions, p));
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const sources = [
      can('documents:read') && { key: 'repository', model: DocumentIndex, base: { source: 'repository' }, date: 'createdAt', size: '$fileSizeBytes' },
      can('documents:read', 'templates:read', 'templates:admin') && { key: 'generated', model: GeneratedDocument, base: {}, date: 'generatedAt', size: '$fileSizeBytes' },
      can('project:documents:read', 'projects:read') && { key: 'project', model: ProjectDocument, base: {}, date: 'createdAt', size: null, sizeFromFiles: true },
      can('crm:read') && { key: 'customer', model: FileMetadata, base: { module: 'crm', entityType: 'customer' }, date: 'createdAt', size: '$sizeBytes' },
      can('accounting:documents:read') && { key: 'accounting', model: AccountingDocument, base: {}, date: 'createdAt', size: '$fileSize' },
      can('mobile:read', 'field-service:read') && { key: 'mobile', model: FileMetadata, base: { module: 'mobile', entityType: 'document' }, date: 'createdAt', size: '$sizeBytes' },
    ].filter(Boolean);

    const perSource = await Promise.all(sources.map(async (s) => {
      // Soft-deleted rows are excluded the same way the models' find hooks do.
      const notDeleted = s.key === 'generated' ? {} : { isDeleted: { $ne: true } };
      const released = releasedOnly ? { releasedToField: true } : {};
      const [row] = await s.model.aggregate([
        { $match: { ...s.base, ...notDeleted, ...released } },

        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            archived: { $sum: { $cond: [{ $eq: ['$archived', true] }, 1, 0] } },
            visum: { $sum: { $cond: [{ $and: [{ $ne: ['$archived', true] }, { $gt: ['$visumBy', null] }] }, 1, 0] } },
            released: { $sum: { $cond: [{ $eq: ['$releasedToField', true] }, 1, 0] } },
            thisMonth: { $sum: { $cond: [{ $gte: [`$${s.date}`, monthStart] }, 1, 0] } },
            bytes: { $sum: s.size ? { $ifNull: [s.size, 0] } : 0 },
          },
        },
      ]);
      const result = { key: s.key, ...(row || { total: 0, archived: 0, visum: 0, released: 0, thisMonth: 0, bytes: 0 }) };
      // Project documents keep their size on the stored file: two indexed
      // queries (ids, then one sum) instead of a $lookup per document.
      if (s.sizeFromFiles && result.total) {
        const fileIds = await s.model.distinct('fileId', { ...s.base, ...notDeleted, ...released, fileId: { $ne: null } });
        const [files] = await FileMetadata.aggregate([
          { $match: { _id: { $in: fileIds } } },
          { $group: { _id: null, bytes: { $sum: { $ifNull: ['$sizeBytes', 0] } } } },
        ]);
        result.bytes = files?.bytes || 0;
      }
      return result;
    }));

    const sum = (field) => perSource.reduce((n, s) => n + (s[field] || 0), 0);
    return {
      total: sum('total'),
      sections: { documents: sum('total') - sum('archived') - sum('visum'), visum: sum('visum'), archiv: sum('archived') },
      released: sum('released'),
      thisMonth: sum('thisMonth'),
      storageBytes: sum('bytes'),
      bySource: Object.fromEntries(perSource.map((s) => [s.key, s.total])),
      generatedAt: new Date().toISOString(),
    };
  }

  async _bumpStats() {
    try {
      const gen = (await cacheManager.get(STATS_GEN_KEY, { skipL1: true })) || 0;
      await cacheManager.set(STATS_GEN_KEY, gen + 1, { skipL1: true, l2Ttl: 86_400 });
    } catch (err) {
      logger.warn('Document stats cache bump failed', { module: 'documents', error: err.message });
    }
  }

  /** Document types and categories that actually occur, for the filter pickers. */
  async facets() {
    // Keyed on the same write generation as the stats, so a newly uploaded
    // type shows up in the filter right away instead of after the TTL.
    const gen = (await cacheManager.get(STATS_GEN_KEY, { skipL1: true })) || 0;
    return cacheManager.getOrSet(`documents:facets:${gen}`, async () => {
      const [repoTypes, repoCats, genTypes, projCats, projTypes, accTypes, accCats, fileCats] = await Promise.all([
        DocumentIndex.distinct('documentType', { isDeleted: { $ne: true } }),
        DocumentIndex.distinct('category', { isDeleted: { $ne: true } }),
        GeneratedDocument.distinct('documentType'),
        ProjectDocument.distinct('category', { isDeleted: { $ne: true } }),
        ProjectDocument.distinct('templateType', { isDeleted: { $ne: true } }),
        AccountingDocument.distinct('documentType', { isDeleted: { $ne: true } }),
        AccountingDocument.distinct('accountingCategory', { isDeleted: { $ne: true } }),
        FileMetadata.distinct('category', { module: { $in: ['crm', 'mobile'] }, isDeleted: { $ne: true } }),
      ]);
      const clean = (...lists) => [...new Set(lists.flat().filter((v) => typeof v === 'string' && v.trim()))].sort((a, b) => a.localeCompare(b));
      return {
        documentTypes: clean(repoTypes, genTypes, projTypes, projCats, accTypes, fileCats),
        categories: clean(repoCats, genTypes, projCats, accCats, fileCats),
      };
    }, FACETS_TTL);
  }

  /**
   * Records a document can be linked to, searched by name or number — so the
   * upload dialog offers pickers instead of asking for database ids.
   */
  async linkTargets({ type, search = '', limit = 12 }, user) {
    const permissions = await this._permissions(user);
    const can = (...perms) => isAdmin(user) || perms.some((p) => hasPermission(permissions, p));
    const rx = search.trim() ? new RegExp(escapeRegex(search.trim().slice(0, 100)), 'i') : null;
    const take = Math.min(Math.max(Number(limit) || 12, 1), 25);
    const model = (name) => mongoose.models[name];
    switch (type) {
      case 'customer': {
        if (!can('crm:read') || !model('Customer')) return [];
        const rows = await model('Customer').find(rx ? { $or: [{ name: rx }, { customerNumber: rx }, { city: rx }] } : {})
          .select('name customerNumber city').sort({ updatedAt: -1 }).limit(take).lean();
        return rows.map((r) => ({ id: String(r._id), label: r.name, sub: [r.customerNumber, r.city].filter(Boolean).join(' · ') }));
      }
      case 'project': {
        if (!can('projects:read', 'project:documents:read') || !model('Project')) return [];
        const rows = await model('Project').find(rx ? { $or: [{ name: rx }, { projectNumber: rx }] } : {})
          .select('name projectNumber customerName').sort({ updatedAt: -1 }).limit(take).lean();
        return rows.map((r) => ({ id: String(r._id), label: r.name, sub: [r.projectNumber, r.customerName].filter(Boolean).join(' · ') }));
      }
      case 'job': {
        if (!can('mobile:read', 'field-service:read', 'scheduling:read', 'deploy:read') || !model('Assignment')) return [];
        const rows = await model('Assignment').find(rx ? { $or: [{ title: rx }, { assignmentNumber: rx }] } : {})
          .select('title assignmentNumber scheduledStart').sort({ updatedAt: -1 }).limit(take).lean();
        return rows.map((r) => ({ id: String(r._id), label: r.title || r.assignmentNumber, sub: r.assignmentNumber || '' }));
      }
      case 'employee': {
        if (!model('User')) return [];
        const rows = await model('User').find({ status: 'active', ...(rx ? { $or: [{ firstName: rx }, { lastName: rx }, { email: rx }] } : {}) })
          .select('firstName lastName email').sort({ firstName: 1 }).limit(take).lean();
        return rows.map((r) => ({ id: String(r._id), label: fullName(r), sub: r.email || '' }));
      }
      case 'installation': {
        if (!can('crm:read') || !model('Installation')) return [];
        const rows = await model('Installation').find(rx ? { $or: [{ installationNumber: rx }, { make: rx }, { model: rx }, { serialNumber: rx }] } : {})
          .select('installationNumber make model').sort({ updatedAt: -1 }).limit(take).lean();
        return rows.map((r) => ({ id: String(r._id), label: [r.make, r.model].filter(Boolean).join(' ') || r.installationNumber, sub: r.installationNumber || '' }));
      }
      default:
        throw new ValidationError('Unknown link type');
    }
  }

  /** Title, type, category, description and links of an uploaded document. */
  async updateMetadata(recordId, changes, user, meta = {}) {
    const parsed = parseRecordId(recordId);
    if (!parsed) throw new NotFoundError('Document', recordId);
    if (parsed.source !== 'repository') {
      throw new ValidationError('Only uploaded repository documents can be edited here; other documents are managed in their own module');
    }
    const record = await documentIndexRepository.findById(parsed.id);
    if (!record) throw new NotFoundError('Document', recordId);
    const update = {};
    for (const key of ['title', 'documentType', 'category', 'description']) {
      if (changes[key] !== undefined) update[key] = changes[key] === null ? '' : changes[key];
    }
    for (const key of ['customerId', 'projectId', 'jobId', 'employeeId', 'installationId']) {
      if (changes[key] !== undefined) update[key] = changes[key] || null;
    }
    if (!Object.keys(update).length) return this._normalizeRepositoryDocument(record);
    const updated = await documentIndexRepository.updateById(parsed.id, update);
    auditService.logEvent({
      eventType: 'document_repository.updated',
      userId: user._id,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { documentId: recordId, changedFields: Object.keys(update) },
      module: 'documents',
    });
    await this._bumpStats();
    const [normalized] = await this._attachNames([this._normalizeRepositoryDocument(updated)]);
    return normalized;
  }

  /**
   * One action on up to 100 documents. Each runs through the same per-record
   * method (and its checks) as the single action; failures are reported per id
   * instead of aborting the batch.
   */
  async bulk(action, ids, user, meta = {}) {
    const unique = [...new Set(ids)].slice(0, 100);
    const run = {
      archive: (id) => this.setArchived(id, user, true, meta),
      unarchive: (id) => this.setArchived(id, user, false, meta),
      visum: (id) => this.setVisum(id, user, true, meta),
      unvisum: (id) => this.setVisum(id, user, false, meta),
      release: (id) => this.setReleased(id, user, true, meta),
      unrelease: (id) => this.setReleased(id, user, false, meta),
      delete: (id) => this.delete(id, user, meta),
    }[action];
    if (!run) throw new ValidationError('Unknown bulk action');
    const results = [];
    // Small fixed concurrency: fast for 100 ids without flooding the pool.
    for (let i = 0; i < unique.length; i += 8) {
      const chunk = unique.slice(i, i + 8);
      const settled = await Promise.allSettled(chunk.map((id) => run(id)));
      settled.forEach((r, j) => results.push(r.status === 'fulfilled'
        ? { id: chunk[j], ok: true }
        : { id: chunk[j], ok: false, error: r.reason?.message || 'Failed', statusCode: r.reason?.statusCode || 500 }));
    }
    return { action, total: results.length, succeeded: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok) };
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

    await this._bumpStats();
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

    await this._bumpStats();
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

    await this._bumpStats();
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

    await this._bumpStats();
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

    await this._bumpStats();
    return { deleted: true };
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
  async _releasedOnly(user, permissions = null) {
    if (isAdmin(user)) return false;
    const perms = permissions || await this._permissions(user);
    return !satisfiesPermission(perms, 'documents:read:all');
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

  // ── Normalizers: one shape for every source ───────────────────────────────
  // Sign-off is read from visumBy/visumAt on every source (it used to count
  // only for project documents, so a signed-off upload never left "Dokumente").

  _flags(doc) {
    return {
      archived: Boolean(doc.archived),
      archivedAt: normalizeDate(doc.archivedAt),
      visumBy: toStringId(doc.visumBy),
      visumAt: normalizeDate(doc.visumAt),
      releasedToField: Boolean(doc.releasedToField),
    };
  }

  _normalizeRepositoryDocument(doc) {
    return compactObject({
      id: createRecordId('repository', doc._id),
      source: 'repository',
      sourceLabel: SOURCE_LABELS.repository,
      origin: 'uploaded',
      title: doc.title || doc.fileName,
      fileName: doc.fileName,
      fileId: toStringId(doc.fileId),
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
      ...this._flags(doc),
      metadata: doc.metadata || {},
      canDelete: true,
      editable: true,
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
      fileId: toStringId(doc.fileId),
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
      // The owner is the person the document was generated for, not an
      // employee link — showing it as "Employee: …" misled the reader.
      ownerUserId: toStringId(doc.ownerUserId),
      uploadedBy: toStringId(doc.generatedBy),
      templateVersion: doc.templateVersion,
      pageCount: doc.pageCount,
      createdAt: normalizeDate(doc.generatedAt),
      ...this._flags(doc),
      metadata: doc.metadata || {},
      canDelete: true,
    });
  }

  _normalizeProjectDocument(doc) {
    const file = typeof doc.fileId === 'object' && doc.fileId?._id ? doc.fileId : null;
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
      fileId: toStringId(file?._id || doc.fileId),
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
      ...this._flags(doc),
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
      title: doc.supplierName ? `${doc.supplierName} · ${doc.fileName}` : doc.fileName,
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
      ...this._flags(doc),
      // Bookkeeping retention: deletable only once the retention period ended.
      canDelete: Boolean(doc.retentionUntil && new Date(doc.retentionUntil) <= new Date()),
      retentionLocked: !(doc.retentionUntil && new Date(doc.retentionUntil) <= new Date()),
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
      fileId: toStringId(file._id),
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
      ...this._flags(file),
      metadata: { bucket: file.bucket, storageBackend: file.storageBackend },
      canDelete: true,
    });
  }

  /**
   * Everything that can travel as an email attachment, across the three places
   * a file actually lives: the repository index, generated documents, and
   * project documents. Each source is gated by the same read rules as the list
   * (it used to return generated and project files to anyone with
   * documents:read), and a site scopes the repository through its projects —
   * the index has no siteId, so that filter used to match nothing.
   */
  async listAttachable({ siteId, customerId, projectId, search, limit = 100 } = {}, user = null) {
    const permissions = await this._permissions(user);
    const admin = isAdmin(user);
    const take = Math.min(Math.max(Number(limit) || 100, 1), 200);
    const rx = search ? new RegExp(escapeRegex(String(search).slice(0, 200)), 'i') : null;
    const out = [];

    let projectIds = projectId ? [oid(projectId)] : null;
    if (!projectIds && (siteId || customerId)) {
      const scope = siteId ? { siteId } : { customerId };
      const projects = await Project.find({ ...scope, isDeleted: { $ne: true } }).select('_id').lean();
      projectIds = projects.map((project) => project._id);
    }

    const readRepo = admin || hasPermission(permissions, 'documents:read');
    const readProject = admin || hasPermission(permissions, 'project:documents:read') || hasPermission(permissions, 'projects:read');

    const repoFilter = { fileId: { $ne: null } };
    if (customerId) repoFilter.customerId = oid(customerId);
    else if (projectIds) repoFilter.projectId = { $in: projectIds };
    if (rx) repoFilter.$or = [{ title: rx }, { fileName: rx }];

    const genFilter = { fileId: { $ne: null } };
    if (projectIds) genFilter.$or = [{ sourceProjectId: { $in: projectIds } }, { sourceRecordId: { $in: projectIds } }];
    if (customerId && !projectIds?.length) genFilter.sourceCustomerId = oid(customerId);
    if (rx) genFilter.fileName = rx;

    const pdFilter = { fileId: { $ne: null } };
    if (projectIds) pdFilter.projectId = { $in: projectIds };
    if (rx) pdFilter.fileName = rx;

    const [repoDocs, genDocs, projectDocs] = await Promise.all([
      readRepo ? DocumentIndex.find(repoFilter).sort({ createdAt: -1 }).limit(take).select('fileId title fileName createdAt').lean() : [],
      GeneratedDocument.find(genFilter).sort({ generatedAt: -1 }).limit(take).lean(),
      readProject && !(projectIds && !projectIds.length) ? ProjectDocument.find(pdFilter).sort({ createdAt: -1 }).limit(take).select('fileId fileName createdAt').lean() : [],
    ]);
    const genReadable = await Promise.all(genDocs.map((doc) => documentAccessPolicyService.canRead(doc, user)));

    for (const doc of repoDocs) out.push({ id: String(doc._id), fileId: String(doc.fileId), title: doc.title || doc.fileName, fileName: doc.fileName, createdAt: doc.createdAt, origin: 'repository' });
    genDocs.forEach((doc, i) => {
      if (genReadable[i]) out.push({ id: String(doc._id), fileId: String(doc.fileId), title: doc.metadata?.documentNumber || doc.fileName, fileName: doc.fileName, createdAt: doc.generatedAt || doc.createdAt, origin: 'generated' });
    });
    for (const doc of projectDocs) out.push({ id: String(doc._id), fileId: String(doc.fileId), title: doc.fileName, fileName: doc.fileName, createdAt: doc.createdAt, origin: 'project' });

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
      .slice(0, take);
  }
}

const documentIndexService = new DocumentIndexService();
export default documentIndexService;
