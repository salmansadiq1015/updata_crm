import PDFDocument from 'pdfkit';
import { encodeCursor, decodeCursor } from '../../shared/utils/pagination.js';
import logger from '../../shared/logger/index.js';

/**
 * Unified activity-history timeline for CRM entities (customer / site / installation).
 *
 * Aggregates heterogeneous source records (notes, images, maintenance, service
 * orders, QOP documents, audit events) into a single chronologically-sorted
 * timeline. Every entry shares one normalized shape so the client can render
 * them uniformly:
 *
 *   {
 *     _id, type, timestamp, title, summary, status, actor,
 *     link: { module, entityType, entityId } | null,
 *     meta: {}
 *   }
 *
 * The `_getQopTimelineEntries` helper used to live in customer.service.js. It is
 * now exported here as `getQopTimelineEntries` so customer.service AND
 * site/installation services can reuse it. customer.service keeps its existing
 * behaviour by importing this helper.
 */

const PDF_MIME_TYPE = 'application/pdf';

// --- helpers -----------------------------------------------------------------

function toDate(value) {
  return value instanceof Date ? value : new Date(value);
}

function userDisplayName(user) {
  if (!user) return null;
  if (user.firstName || user.lastName) {
    return `${user.firstName || ''} ${user.lastName || ''}`.trim();
  }
  return user.email || null;
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const s = String(value).replace(/"/g, '""');
  return /[",\n;]/.test(s) ? `"${s}"` : s;
}

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('de-CH').format(new Date(value));
}

// =============================================================================
//  QOP timeline entries (moved from customer.service.js)
// =============================================================================

/**
 * Fetch quotation / order / invoice documents for a customer and transform them
 * into normalized timeline entries.
 *
 * Backwards-compatible note: this previously produced entries shaped like
 * { _id, eventType, timestamp, module, details }. We now emit the unified shape
 * (type/title/summary/status/actor/link/meta) AND keep the legacy `eventType`,
 * `module` and `details` fields so existing customer.service consumers continue
 * to work unchanged. The `eventTypeFilter` argument keeps the legacy
 * `quotation.*` / `order.*` / `invoice.*` filtering semantics.
 *
 * Uses try-catch with lazy imports so CRM keeps working even if the QOP module
 * is not deployed.
 */
export async function getQopTimelineEntries(customerId, eventTypeFilter) {
  const entries = [];
  // documentId -> createdBy, used by resolveQopActors() below.
  const docCreatedBy = new Map();

  try {
    // --- Quotations ----------------------------------------------------------
    if (!eventTypeFilter || eventTypeFilter.startsWith('quotation.')) {
      const Quotation = (await import('../qop/quotation.model.js')).default;
      const quotations = await Quotation.find({ customerId })
        .sort({ createdAt: -1 })
        .limit(200)
        .select('quotationNumber title status grandTotalRounded currency createdAt sentAt acceptedAt declinedAt createdBy')
        .lean();

      for (const q of quotations) {
        docCreatedBy.set(String(q._id), q.createdBy || null);
        const link = { module: 'qop', entityType: 'quotation', entityId: String(q._id) };
        const titleText = q.title || q.quotationNumber;

        if (!eventTypeFilter || eventTypeFilter === 'quotation.created') {
          entries.push({
            _id: `qot-c-${q._id}`,
            type: 'quotation',
            timestamp: q.createdAt,
            title: `Quotation ${q.quotationNumber} created`,
            titleKey: 'crm.timeline.quotationCreated', titleVars: { number: q.quotationNumber },
            summary: titleText,
            status: q.status || null,
            actor: null,
            link,
            meta: { quotationNumber: q.quotationNumber, amount: q.grandTotalRounded, currency: q.currency, action: 'created' },
            // legacy fields (customer.service compatibility)
            eventType: 'quotation.created',
            module: 'qop',
            details: {
              entityId: q._id, entityType: 'quotation', quotationNumber: q.quotationNumber,
              title: titleText, amount: q.grandTotalRounded, currency: q.currency, status: q.status,
            },
          });
        }
        if (q.sentAt && (!eventTypeFilter || eventTypeFilter === 'quotation.sent')) {
          entries.push({
            _id: `qot-s-${q._id}`,
            type: 'quotation',
            timestamp: q.sentAt,
            title: `Quotation ${q.quotationNumber} sent`,
            titleKey: 'crm.timeline.quotationSent', titleVars: { number: q.quotationNumber },
            summary: titleText,
            status: q.status || null,
            actor: null,
            link,
            meta: { quotationNumber: q.quotationNumber, action: 'sent' },
            eventType: 'quotation.sent',
            module: 'qop',
            details: { entityId: q._id, entityType: 'quotation', quotationNumber: q.quotationNumber, title: titleText },
          });
        }
        if (q.acceptedAt && (!eventTypeFilter || eventTypeFilter === 'quotation.accepted')) {
          entries.push({
            _id: `qot-a-${q._id}`,
            type: 'quotation',
            timestamp: q.acceptedAt,
            title: `Quotation ${q.quotationNumber} accepted`,
            titleKey: 'crm.timeline.quotationAccepted', titleVars: { number: q.quotationNumber },
            summary: titleText,
            status: q.status || null,
            actor: null,
            link,
            meta: { quotationNumber: q.quotationNumber, action: 'accepted' },
            eventType: 'quotation.accepted',
            module: 'qop',
            details: { entityId: q._id, entityType: 'quotation', quotationNumber: q.quotationNumber, title: titleText },
          });
        }
        if (q.declinedAt && (!eventTypeFilter || eventTypeFilter === 'quotation.declined')) {
          entries.push({
            _id: `qot-d-${q._id}`,
            type: 'quotation',
            timestamp: q.declinedAt,
            title: `Quotation ${q.quotationNumber} declined`,
            titleKey: 'crm.timeline.quotationDeclined', titleVars: { number: q.quotationNumber },
            summary: titleText,
            status: q.status || null,
            actor: null,
            link,
            meta: { quotationNumber: q.quotationNumber, action: 'declined' },
            eventType: 'quotation.declined',
            module: 'qop',
            details: { entityId: q._id, entityType: 'quotation', quotationNumber: q.quotationNumber, title: titleText },
          });
        }
      }
    }

    // --- Orders --------------------------------------------------------------
    if (!eventTypeFilter || eventTypeFilter.startsWith('order.')) {
      const Order = (await import('../qop/order.model.js')).default;
      const orders = await Order.find({ customerId })
        .sort({ createdAt: -1 })
        .limit(200)
        .select('orderNumber title status grandTotalRounded currency createdAt createdBy')
        .lean();

      for (const o of orders) {
        docCreatedBy.set(String(o._id), o.createdBy || null);
        if (!eventTypeFilter || eventTypeFilter === 'order.created') {
          const titleText = o.title || o.orderNumber;
          entries.push({
            _id: `ord-c-${o._id}`,
            type: 'order',
            timestamp: o.createdAt,
            title: `Order ${o.orderNumber} created`,
            titleKey: 'crm.timeline.orderCreated', titleVars: { number: o.orderNumber },
            summary: titleText,
            status: o.status || null,
            actor: null,
            link: { module: 'qop', entityType: 'order', entityId: String(o._id) },
            meta: { orderNumber: o.orderNumber, amount: o.grandTotalRounded, currency: o.currency, action: 'created' },
            eventType: 'order.created',
            module: 'qop',
            details: {
              entityId: o._id, entityType: 'order', orderNumber: o.orderNumber,
              title: titleText, amount: o.grandTotalRounded, currency: o.currency, status: o.status,
            },
          });
        }
      }
    }

    // --- Invoices ------------------------------------------------------------
    if (!eventTypeFilter || eventTypeFilter.startsWith('invoice.')) {
      const Invoice = (await import('../qop/invoice.model.js')).default;
      const invoices = await Invoice.find({ customerId })
        .sort({ createdAt: -1 })
        .limit(200)
        .select('invoiceNumber title invoiceType status grandTotalRounded currency createdAt sentAt paidAt createdBy')
        .lean();

      for (const inv of invoices) {
        docCreatedBy.set(String(inv._id), inv.createdBy || null);
        const link = { module: 'qop', entityType: 'invoice', entityId: String(inv._id) };
        const titleText = inv.title || inv.invoiceNumber;

        if (!eventTypeFilter || eventTypeFilter === 'invoice.created') {
          entries.push({
            _id: `inv-c-${inv._id}`,
            type: 'invoice',
            timestamp: inv.createdAt,
            title: `Invoice ${inv.invoiceNumber} created`,
            titleKey: 'crm.timeline.invoiceCreated', titleVars: { number: inv.invoiceNumber },
            summary: titleText,
            status: inv.status || null,
            actor: null,
            link,
            meta: { invoiceNumber: inv.invoiceNumber, invoiceType: inv.invoiceType, amount: inv.grandTotalRounded, currency: inv.currency, action: 'created' },
            eventType: 'invoice.created',
            module: 'qop',
            details: {
              entityId: inv._id, entityType: 'invoice', invoiceNumber: inv.invoiceNumber,
              title: titleText, invoiceType: inv.invoiceType, amount: inv.grandTotalRounded,
              currency: inv.currency, status: inv.status,
            },
          });
        }
        if (inv.sentAt && (!eventTypeFilter || eventTypeFilter === 'invoice.sent')) {
          entries.push({
            _id: `inv-s-${inv._id}`,
            type: 'invoice',
            timestamp: inv.sentAt,
            title: `Invoice ${inv.invoiceNumber} sent`,
            titleKey: 'crm.timeline.invoiceSent', titleVars: { number: inv.invoiceNumber },
            summary: titleText,
            status: inv.status || null,
            actor: null,
            link,
            meta: { invoiceNumber: inv.invoiceNumber, action: 'sent' },
            eventType: 'invoice.sent',
            module: 'qop',
            details: { entityId: inv._id, entityType: 'invoice', invoiceNumber: inv.invoiceNumber, title: titleText },
          });
        }
        if (inv.paidAt && (!eventTypeFilter || eventTypeFilter === 'invoice.paid')) {
          entries.push({
            _id: `inv-p-${inv._id}`,
            type: 'invoice',
            timestamp: inv.paidAt,
            title: `Invoice ${inv.invoiceNumber} paid`,
            titleKey: 'crm.timeline.invoicePaid', titleVars: { number: inv.invoiceNumber },
            summary: titleText,
            status: inv.status || null,
            actor: null,
            link,
            meta: { invoiceNumber: inv.invoiceNumber, amount: inv.grandTotalRounded, currency: inv.currency, action: 'paid' },
            eventType: 'invoice.paid',
            module: 'qop',
            details: {
              entityId: inv._id, entityType: 'invoice', invoiceNumber: inv.invoiceNumber,
              title: titleText, amount: inv.grandTotalRounded, currency: inv.currency,
            },
          });
        }
      }
    }
  } catch (err) {
    // QOP module may not be available — gracefully degrade
    logger.warn('Could not load QOP timeline entries', { module: 'crm', error: err.message });
  }

  await resolveQopActors(entries, docCreatedBy);
  return entries;
}

/**
 * Fill in the acting user for quotation/order/invoice timeline entries.
 *
 * "created" entries are attributed to the document's creator; status entries
 * (sent / accepted / declined / paid) to the user recorded in the document
 * status log — the only exact source for who performed the transition.
 * Best-effort: on any failure the entries simply keep actor = null.
 */
async function resolveQopActors(entries, docCreatedBy) {
  const qopEntries = entries.filter((e) => ['quotation', 'order', 'invoice'].includes(e.type));
  if (!qopEntries.length) return;

  try {
    const docIds = [...new Set(qopEntries.map((e) => e.details?.entityId).filter(Boolean).map(String))];

    // Status transitions: (documentId + toStatus) -> user who changed it.
    const changedByKey = new Map();
    const DocumentStatusLog = (await import('../qop/documentStatusLog.model.js')).default;
    const logs = await DocumentStatusLog.find({ documentId: { $in: docIds } })
      .select('documentId toStatus changedBy changedAt')
      .sort({ changedAt: 1 })
      .lean();
    for (const log of logs) {
      changedByKey.set(`${String(log.documentId)}:${String(log.toStatus).toLowerCase()}`, log.changedBy);
    }

    // Resolve every referenced user id to a display name in one query.
    const userIds = [...new Set([
      ...[...docCreatedBy.values()],
      ...[...changedByKey.values()],
    ].filter(Boolean).map(String))];
    const nameById = new Map();
    if (userIds.length) {
      const User = (await import('../auth/user.model.js')).default;
      const users = await User.find({ _id: { $in: userIds } }).select('firstName lastName email').lean();
      for (const user of users) nameById.set(String(user._id), userDisplayName(user));
    }

    for (const entry of qopEntries) {
      const docId = entry.details?.entityId ? String(entry.details.entityId) : null;
      if (!docId) continue;
      const action = entry.meta?.action;
      const userId = action === 'created'
        ? docCreatedBy.get(docId)
        : changedByKey.get(`${docId}:${String(action || '').toLowerCase()}`);
      if (userId) entry.actor = nameById.get(String(userId)) || null;
    }
  } catch (err) {
    logger.warn('Could not resolve QOP timeline actors', { module: 'crm', error: err.message });
  }
}

// =============================================================================
//  Source collectors (notes / images / maintenance / service orders / audit)
// =============================================================================

async function collectNotes(entityType, entityId) {
  const entries = [];
  try {
    const entityNoteRepository = (await import('./entityNote.repository.js')).default;
    const notes = await entityNoteRepository.findByEntity(entityType, entityId);
    if (!notes.length) return entries;

    // Resolve author display names in a single batch (avoid N+1).
    const authorMap = new Map();
    try {
      const User = (await import('../auth/user.model.js')).default;
      const authorIds = [...new Set(notes.map((n) => n.authorId).filter(Boolean).map(String))];
      if (authorIds.length) {
        const users = await User.find({ _id: { $in: authorIds } }).select('firstName lastName email').lean();
        for (const u of users) authorMap.set(String(u._id), userDisplayName(u));
      }
    } catch (err) {
      logger.warn('Could not resolve note authors for timeline', { module: 'crm', error: err.message });
    }

    for (const note of notes) {
      entries.push({
        _id: `note-${note._id}`,
        type: 'note',
        timestamp: note.createdAt,
        title: note.isPinned ? 'Pinned note' : 'Note added',
        titleKey: note.isPinned ? 'crm.timeline.notePinned' : 'crm.timeline.noteAdded',
        summary: note.text || '',
        status: note.isWarning ? 'warning' : null,
        actor: authorMap.get(String(note.authorId)) || null,
        link: { module: 'crm', entityType, entityId: String(entityId) },
        meta: { category: note.category, isPinned: !!note.isPinned, isWarning: !!note.isWarning },
      });
    }
  } catch (err) {
    logger.warn('Could not load note timeline entries', { module: 'crm', error: err.message });
  }
  return entries;
}

async function collectImages(entityType, entityId) {
  const entries = [];
  try {
    const entityImageRepository = (await import('./entityImage.repository.js')).default;
    const images = await entityImageRepository.findByEntity(entityType, entityId);
    for (const img of images) {
      entries.push({
        _id: `image-${img._id}`,
        type: 'image',
        timestamp: img.createdAt,
        title: 'Image uploaded',
        titleKey: 'crm.timeline.imageUploaded',
        summary: img.caption || '',
        status: null,
        actor: null,
        link: { module: 'crm', entityType, entityId: String(entityId) },
        meta: { category: img.category, fileId: img.fileId ? String(img.fileId) : null, caption: img.caption || null },
      });
    }
  } catch (err) {
    logger.warn('Could not load image timeline entries', { module: 'crm', error: err.message });
  }
  return entries;
}

/**
 * Maintenance entries for a set of intervals.
 * Emits `maintenance_done` when lastServiceDate is set, and
 * `maintenance_scheduled` for a future nextDueDate.
 */
function maintenanceEntriesFor(interval, installationId) {
  const out = [];
  const label = interval.customTypeLabel || interval.maintenanceType;
  const link = installationId
    ? { module: 'crm', entityType: 'installation', entityId: String(installationId) }
    : null;

  if (interval.lastServiceDate) {
    out.push({
      _id: `maint-done-${interval._id}`,
      type: 'maintenance_done',
      timestamp: interval.lastServiceDate,
      title: 'Maintenance performed',
      titleKey: 'crm.timeline.maintenancePerformed',
      summary: label,
      status: 'completed',
      actor: null,
      link,
      meta: { maintenanceType: interval.maintenanceType, intervalId: String(interval._id) },
    });
  }

  if (interval.nextDueDate && toDate(interval.nextDueDate) > new Date()) {
    out.push({
      _id: `maint-sched-${interval._id}`,
      type: 'maintenance_scheduled',
      timestamp: interval.nextDueDate,
      title: 'Maintenance scheduled',
      titleKey: 'crm.timeline.maintenanceScheduled',
      summary: label,
      status: interval.maintenanceStatus || 'scheduled',
      actor: null,
      link,
      meta: { maintenanceType: interval.maintenanceType, intervalId: String(interval._id) },
    });
  }

  return out;
}

/**
 * Collect maintenance entries.
 * - installation: intervals for that installation
 * - site: all intervals across the site's installations
 */
async function collectMaintenance(entityType, entityId) {
  const entries = [];
  try {
    const maintenanceIntervalRepository = (await import('./maintenanceInterval.repository.js')).default;

    if (entityType === 'installation') {
      const intervals = await maintenanceIntervalRepository.findByInstallationId(entityId);
      for (const interval of intervals) {
        entries.push(...maintenanceEntriesFor(interval, entityId));
      }
    } else if (entityType === 'site') {
      const installationRepository = (await import('./installation.repository.js')).default;
      const installations = await installationRepository.findBySiteId(entityId);
      for (const inst of installations) {
        const intervals = await maintenanceIntervalRepository.findByInstallationId(inst._id);
        for (const interval of intervals) {
          entries.push(...maintenanceEntriesFor(interval, inst._id));
        }
      }
    }
  } catch (err) {
    logger.warn('Could not load maintenance timeline entries', { module: 'crm', error: err.message });
  }
  return entries;
}

/**
 * Collect service-order (deploy Assignment) entries by siteId.
 */
async function collectServiceOrders(siteId) {
  const entries = [];
  if (!siteId) return entries;
  try {
    const Assignment = (await import('../deploy/assignment.model.js')).default;
    const assignments = await Assignment.find({ siteId })
      .sort({ startDatetime: -1 })
      .limit(200)
      .populate({ path: 'employeeId', select: 'firstName lastName email' })
      .lean();

    for (const a of assignments) {
      entries.push({
        _id: `assign-${a._id}`,
        type: 'service_order',
        timestamp: a.startDatetime || a.createdAt,
        title: a.title || `Assignment ${a.assignmentNumber}`,
        titleKey: a.title ? null : 'crm.timeline.assignment', titleVars: { number: a.assignmentNumber },
        summary: a.instructions || '',
        status: a.status || null,
        actor: userDisplayName(a.employeeId),
        link: { module: 'deploy', entityType: 'assignment', entityId: String(a._id) },
        meta: {
          assignmentNumber: a.assignmentNumber,
          assignmentType: a.assignmentType,
          priority: a.priority,
          endDatetime: a.endDatetime || null,
        },
      });
    }
  } catch (err) {
    logger.warn('Could not load service-order timeline entries', { module: 'crm', error: err.message });
  }
  return entries;
}

/**
 * Collect audit events matching details.siteId / details.installationId.
 */
async function collectAudit(entityType, entityId) {
  const entries = [];
  try {
    const AuditLog = (await import('../auth/auditLog.model.js')).default;
    const detailKey = entityType === 'installation' ? 'details.installationId' : 'details.siteId';
    const rawDocs = await AuditLog.find({ module: 'crm', [detailKey]: entityId })
      .sort({ timestamp: -1 })
      .limit(500)
      .lean();

    // Resolve the acting user to a readable name — the timeline used to show
    // the raw ObjectId ("von 6a4652dc…").
    const { default: auditService } = await import('../auth/audit.service.js');
    const docs = await auditService.withUserNames(rawDocs);

    for (const d of docs) {
      entries.push({
        _id: `audit-${d._id}`,
        type: 'audit',
        timestamp: d.timestamp,
        title: d.eventType,
        summary: d.result ? `Result: ${d.result}` : '',
        status: d.result || null,
        actor: d.userName || null,
        link: { module: 'crm', entityType, entityId: String(entityId) },
        meta: { eventType: d.eventType, details: d.details || {} },
      });
    }
  } catch (err) {
    logger.warn('Could not load audit timeline entries', { module: 'crm', error: err.message });
  }
  return entries;
}

// =============================================================================
//  Public builder
// =============================================================================

/**
 * Resolve the parent customerId for a site or installation so QOP documents
 * (which only link to customerId) can be included.
 */
async function resolveCustomerAndSite(entityType, entityId) {
  if (entityType === 'site') {
    const siteRepository = (await import('./site.repository.js')).default;
    const site = await siteRepository.findById(entityId);
    return { customerId: site ? String(site.customerId) : null, siteId: String(entityId) };
  }
  if (entityType === 'installation') {
    const installationRepository = (await import('./installation.repository.js')).default;
    const installation = await installationRepository.findById(entityId);
    if (!installation) return { customerId: null, siteId: null };
    const siteRepository = (await import('./site.repository.js')).default;
    const site = await siteRepository.findById(installation.siteId);
    return {
      customerId: site ? String(site.customerId) : null,
      siteId: installation.siteId ? String(installation.siteId) : null,
    };
  }
  return { customerId: null, siteId: null };
}

/**
 * Build the unified, merged + sorted + paginated timeline for a site or
 * installation.
 *
 * @param {object} opts
 * @param {'site'|'installation'} opts.entityType
 * @param {string} opts.entityId
 * @param {string} [opts.type]      filter to one entry type
 * @param {string} [opts.dateFrom]  inclusive lower bound (ISO)
 * @param {string} [opts.dateTo]    inclusive upper bound (ISO)
 * @param {'asc'|'desc'} [opts.order='desc']
 * @param {string} [opts.cursor]
 * @param {number} [opts.limit=25]
 * @param {number} [opts.maxEntries] hard cap on collected entries (export)
 */
export async function buildEntityTimeline({
  entityType,
  entityId,
  type,
  dateFrom,
  dateTo,
  order = 'desc',
  cursor,
  limit = 25,
  maxEntries,
} = {}) {
  const { customerId, siteId } = await resolveCustomerAndSite(entityType, entityId);

  // Collect from every source in parallel. Each collector is independently
  // try/caught so a missing module degrades gracefully.
  const wantQop = !type || ['quotation', 'order', 'invoice'].includes(type);

  const [notes, images, maintenance, serviceOrders, audit, qop] = await Promise.all([
    !type || type === 'note' ? collectNotes(entityType, entityId) : [],
    !type || type === 'image' ? collectImages(entityType, entityId) : [],
    !type || type === 'maintenance_done' || type === 'maintenance_scheduled'
      ? collectMaintenance(entityType, entityId)
      : [],
    !type || type === 'service_order' ? collectServiceOrders(siteId) : [],
    !type || type === 'audit' ? collectAudit(entityType, entityId) : [],
    wantQop && customerId ? getQopTimelineEntries(customerId) : [],
  ]);

  let merged = [...notes, ...images, ...maintenance, ...serviceOrders, ...audit, ...qop];

  // --- type filter (covers the QOP/maintenance multi-type collectors) -------
  if (type) {
    merged = merged.filter((e) => e.type === type);
  }

  // --- date range filter (inclusive) ----------------------------------------
  if (dateFrom) {
    const from = toDate(dateFrom);
    merged = merged.filter((e) => toDate(e.timestamp) >= from);
  }
  if (dateTo) {
    const to = toDate(dateTo);
    merged = merged.filter((e) => toDate(e.timestamp) <= to);
  }

  // --- sort ------------------------------------------------------------------
  const isDesc = order !== 'asc';
  merged.sort((a, b) => {
    const diff = toDate(b.timestamp) - toDate(a.timestamp);
    if (diff !== 0) return isDesc ? diff : -diff;
    // tie-break on _id for deterministic ordering
    const cmp = String(b._id).localeCompare(String(a._id));
    return isDesc ? cmp : -cmp;
  });

  // Export path: return the full filtered set (capped), no pagination.
  if (maxEntries) {
    return merged.slice(0, maxEntries);
  }

  // --- cursor pagination over the merged array -------------------------------
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded) {
      const cursorDate = toDate(decoded.timestamp || decoded._id);
      merged = merged.filter((entry) => {
        const d = toDate(entry.timestamp);
        if (isDesc) {
          if (d < cursorDate) return true;
          if (d.getTime() === cursorDate.getTime()) return String(entry._id) < decoded._id;
          return false;
        }
        if (d > cursorDate) return true;
        if (d.getTime() === cursorDate.getTime()) return String(entry._id) > decoded._id;
        return false;
      });
    }
  }

  const hasNext = merged.length > limit;
  const data = hasNext ? merged.slice(0, limit) : merged;
  const nextCursor = hasNext && data.length > 0
    ? encodeCursor(
        { _id: String(data[data.length - 1]._id), timestamp: data[data.length - 1].timestamp },
        'timestamp',
      )
    : null;

  return {
    data,
    pagination: { hasNext, nextCursor, limit },
  };
}

// =============================================================================
//  Export builders (CRM-009 AC-7)
// =============================================================================

/**
 * Render timeline entries as a Swiss-friendly CSV string.
 * Semicolon-delimited, UTF-8 with BOM so Excel renders umlauts correctly.
 * Columns: Date, Type, Title, Summary, Status, Actor.
 */
export function exportCsv(entries) {
  const header = ['Date', 'Type', 'Title', 'Summary', 'Status', 'Actor'].join(';');
  const body = entries.map((e) => [
    e.timestamp ? new Date(e.timestamp).toISOString() : '',
    e.type,
    e.title,
    e.summary,
    e.status ?? '',
    e.actor ?? '',
  ].map(csvEscape).join(';')).join('\n');

  return `\uFEFF${header}\n${body}`;
}

/**
 * Render timeline entries as a simple titled PDF table.
 * Mirrors the pdfkit buffer pattern in qop/invoicePdf.service.js.
 */
export async function exportPdf(entries, { title = 'Activity Timeline' } = {}) {
  const pdf = new PDFDocument({ size: 'A4', margin: 48, autoFirstPage: true });
  const chunks = [];
  pdf.on('data', (chunk) => chunks.push(chunk));
  const finished = new Promise((resolve, reject) => {
    pdf.on('end', resolve);
    pdf.on('error', reject);
  });

  const margin = 48;
  const pageWidth = pdf.page.width;
  const usableWidth = pageWidth - margin * 2;

  pdf.fontSize(18).font('Helvetica-Bold').fillColor('#111827').text(title, margin, 48);
  pdf.fontSize(9).font('Helvetica').fillColor('#6b7280')
    .text(`Generated: ${formatDate(new Date())} — ${entries.length} entries`, margin, 76);

  let y = 104;
  const columns = {
    date: margin,
    type: margin + 90,
    title: margin + 190,
  };

  pdf.rect(margin, y, usableWidth, 22).fill('#f3f4f6');
  pdf.fillColor('#374151').fontSize(8).font('Helvetica-Bold')
    .text('Date', columns.date, y + 7)
    .text('Type', columns.type, y + 7)
    .text('Title', columns.title, y + 7);
  y += 28;

  for (const e of entries) {
    if (y > 780) {
      pdf.addPage();
      y = 48;
    }
    const titleSummary = e.summary ? `${e.title} — ${e.summary}` : e.title;
    pdf.fillColor('#111827').font('Helvetica').fontSize(8)
      .text(formatDate(e.timestamp), columns.date, y, { width: 86 })
      .text(String(e.type || ''), columns.type, y, { width: 96 })
      .text(String(titleSummary || ''), columns.title, y, { width: usableWidth - (columns.title - margin) });
    y += Math.max(16, pdf.heightOfString(String(titleSummary || ''), { width: usableWidth - (columns.title - margin) }) + 6);
  }

  pdf.end();
  await finished;

  return Buffer.concat(chunks);
}

export const ACTIVITY_PDF_MIME_TYPE = PDF_MIME_TYPE;

export default {
  getQopTimelineEntries,
  buildEntityTimeline,
  exportCsv,
  exportPdf,
  ACTIVITY_PDF_MIME_TYPE,
};
