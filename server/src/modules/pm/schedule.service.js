import scheduleRepository from './schedule.repository.js';
import auditService from '../auth/audit.service.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import queueManager from '../../shared/queue/QueueManager.js';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

const ENTITY_TTL = { l1Ttl: 60, l2Ttl: 300 };

// ISO-8601 calendar week + week-year for a date (Grobplanung transfer).
function isoWeekOf(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;       // Mon=0 … Sun=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3);    // move to the Thursday of this week
  const calendarYear = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(calendarYear, 0, 1));
  const calendarWeek = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { calendarYear, calendarWeek };
}

// Grobplanung stores discrete allocation steps (25/50/75/100). Map a raw
// duration-derived percentage to the nearest allowed step; 0 → skip.
function snapAllocationPercent(raw) {
  if (raw <= 0) return 0;
  return [25, 50, 75, 100].reduce((best, o) => (Math.abs(o - raw) < Math.abs(best - raw) ? o : best), 25);
}

class ScheduleService {
  async getSchedule(projectId) {
    const cacheKey = `pm:schedule:project:${projectId}`;
    return cacheManager.getOrSet(
      cacheKey,
      async () => {
        const entries = await scheduleRepository.findByProjectId(projectId);
        // Single batched query, then group confirmations by entry in memory (avoids N+1).
        const confirmations = await scheduleRepository.findConfirmationsByEntryIds(
          entries.map((e) => e._id),
        );
        const byEntry = new Map();
        for (const c of confirmations) {
          const key = String(c.scheduleEntryId);
          if (!byEntry.has(key)) byEntry.set(key, []);
          byEntry.get(key).push(c);
        }
        return entries.map((entry) => ({
          ...entry,
          confirmations: byEntry.get(String(entry._id)) || [],
        }));
      },
      ENTITY_TTL,
    );
  }

  /**
   * Internal-team schedule entries within a date range, mapped into the item
   * shape the Field Deployment (deploy) calendar renders. These are READ-ONLY
   * in deploy: they are owned by PM, so they carry no assignment id and are
   * flagged source: 'pm_schedule' so the UI styles/badges them distinctly and
   * links to the owning project instead of opening the assignment editor.
   *
   * Returned item shape (per entry):
   *   {
   *     _id, source: 'pm_schedule', readOnly: true,
   *     employeeId,            // responsibleTeamId (User) — the calendar row key
   *     title,                 // "<entry name> · <projectNumber>"
   *     startDatetime, endDatetime,  // PHASE span, or milestone single day
   *     isFullDay: true,
   *     status,                // PM entry status
   *     entryType,             // PHASE | MILESTONE
   *     projectId, projectNumber, projectName,  // for the deep-link / context
   *     assignmentType: 'PROJECT_WORK',  // so existing type styling has a fallback
   *   }
   *
   * @param {Date|string} from
   * @param {Date|string} to
   * @param {string[]} [userIds] optional restriction to these responsible users
   */
  async findInternalTeamEntriesInRange(from, to, userIds) {
    const start = from instanceof Date ? from : new Date(from);
    const end = to instanceof Date ? to : new Date(to);

    const entries = await scheduleRepository.findInternalTeamEntriesInRange(start, end, userIds);

    return entries.map((entry) => {
      const isPhase = entry.entryType === 'PHASE';
      const startDatetime = isPhase ? entry.startDate : entry.milestoneDate;
      // Milestones are a single day; give them a same-day end so the calendar
      // can position them as a zero/short-width full-day block.
      const endDatetime = isPhase ? entry.endDate : entry.milestoneDate;

      const project = entry.projectId && typeof entry.projectId === 'object' ? entry.projectId : null;
      const projectId = project?._id || entry.projectId || null;
      const projectNumber = project?.projectNumber || null;
      const projectName = project?.name || null;
      const site = project?.siteId && typeof project.siteId === 'object' ? project.siteId : null;

      const employee = entry.responsibleTeamId && typeof entry.responsibleTeamId === 'object'
        ? entry.responsibleTeamId
        : null;
      const employeeId = employee?._id || entry.responsibleTeamId || null;
      const employeeName = employee?.firstName
        ? `${employee.firstName} ${employee.lastName || ''}`.trim()
        : null;

      return {
        _id: String(entry._id),
        source: 'pm_schedule',
        readOnly: true,
        employeeId: employeeId ? String(employeeId) : null,
        employeeName,
        title: projectNumber ? `${entry.name} · ${projectNumber}` : entry.name,
        startDatetime,
        endDatetime,
        isFullDay: true,
        status: entry.status,
        entryType: entry.entryType,
        assignmentType: 'PROJECT_WORK',
        projectId: projectId ? String(projectId) : null,
        projectNumber,
        projectName,
        projectSiteName: site?.name || null,
        projectSiteStreet: site?.street || null,
        projectSitePostalCode: site?.postalCode || null,
        projectSiteCity: site?.city || null,
      };
    });
  }

  /** Start/end (ms) for an entry. Milestones are a single day (zero-width). */
  _entryRange(entry) {
    if (entry.entryType === 'PHASE') {
      return {
        start: entry.startDate ? new Date(entry.startDate).getTime() : NaN,
        end: entry.endDate ? new Date(entry.endDate).getTime() : NaN,
      };
    }
    const t = entry.milestoneDate ? new Date(entry.milestoneDate).getTime() : NaN;
    return { start: t, end: t };
  }

  /**
   * Server-side, advisory (non-blocking) conflict detection over a project's
   * schedule entries. Mirrors the client-side highlight logic so both surface
   * the same conflicts. Detects:
   *   - predecessor_violation: entry starts before its predecessor's end.
   *   - resource_overlap: two entries with the SAME responsible party
   *     (same responsibleTeamId OR same partnerCompanyId) whose date ranges
   *     intersect (strict, so back-to-back ranges are fine).
   * Returns: { conflicts: [{ entryId, reasons: [{ type, otherEntryId? }] }] }
   */
  async detectConflicts(projectId) {
    const entries = await scheduleRepository.findByProjectId(projectId);
    const byId = new Map(entries.map((e) => [String(e._id), e]));
    const reasonsByEntry = new Map();
    const addReason = (id, reason) => {
      const key = String(id);
      if (!reasonsByEntry.has(key)) reasonsByEntry.set(key, []);
      reasonsByEntry.get(key).push(reason);
    };

    for (const entry of entries) {
      const r = this._entryRange(entry);
      if (Number.isNaN(r.start) || Number.isNaN(r.end)) continue;

      // 1. Predecessor relationship: must start on/after the predecessor's end.
      if (entry.predecessorId) {
        const pred = byId.get(String(entry.predecessorId));
        if (pred) {
          const pr = this._entryRange(pred);
          if (!Number.isNaN(pr.end) && r.start < pr.end) {
            addReason(entry._id, { type: 'predecessor_violation', otherEntryId: String(pred._id) });
          }
        }
      }

      // 2. Resource overlap with the same responsible party.
      const party = entry.partnerCompanyId || entry.responsibleTeamId;
      if (!party) continue;
      for (const other of entries) {
        if (String(other._id) === String(entry._id)) continue;
        const otherParty = other.partnerCompanyId || other.responsibleTeamId;
        if (!otherParty || String(otherParty) !== String(party)) continue;
        const or = this._entryRange(other);
        if (Number.isNaN(or.start) || Number.isNaN(or.end)) continue;
        if (r.start < or.end && or.start < r.end) {
          addReason(entry._id, { type: 'resource_overlap', otherEntryId: String(other._id) });
        }
      }
    }

    const conflicts = Array.from(reasonsByEntry.entries()).map(([entryId, reasons]) => ({
      entryId,
      reasons,
    }));
    return { conflicts };
  }

  async addEntry(projectId, data, createdBy, meta = {}) {
    // Lazy import to avoid circular dependencies
    const Project = (await import('./project.model.js')).default;
    const project = await Project.findById(projectId);
    if (!project) throw new NotFoundError('Project', projectId);

    const entry = await scheduleRepository.create({
      ...data,
      projectId,
      createdBy,
    });

    await this._invalidateCache(projectId);
    await cacheManager.del('pm:dashboard:milestones');

    eventBus.publish(EVENT_TYPES.SCHEDULE_ENTRY_CREATED, {
      entryId: entry._id,
      projectId,
      entryType: data.entryType,
      name: data.name,
      createdBy,
    }, { source: 'pm:schedule' });

    auditService.logEvent({
      eventType: 'schedule_entry.created',
      userId: createdBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { entryId: entry._id, projectId, entryType: data.entryType },
      module: 'pm',
    });

    logger.info('Schedule entry created', {
      module: 'pm',
      action: 'create',
      entryId: entry._id,
      projectId,
    });

    return scheduleRepository.findById(entry._id);
  }

  async updateEntry(entryId, data, updatedBy, meta = {}) {
    const existing = await scheduleRepository.findById(entryId);
    if (!existing) throw new NotFoundError('ScheduleEntry', entryId);

    const updated = await scheduleRepository.updateById(entryId, {
      ...data,
      updatedBy,
    });

    await this._invalidateCache(existing.projectId);
    await cacheManager.del('pm:dashboard:milestones');

    const dateChanged = data.startDate || data.endDate || data.milestoneDate;
    if (dateChanged) {
      try {
        const cascaded = await this._cascadeDateChanges(entryId, existing, updated, new Set(), 0);
        if (cascaded.length > 0) {
          await this._invalidateCache(existing.projectId);
          eventBus.publish(EVENT_TYPES.SCHEDULE_ENTRIES_CASCADED, {
            triggerId: entryId,
            projectId: existing.projectId,
            affectedEntryIds: cascaded,
            updatedBy,
          }, { source: 'pm:schedule' });
        }
      } catch (err) {
        logger.warn('Predecessor cascade failed (non-blocking)', {
          module: 'pm', action: 'cascade', entryId, error: err.message,
        });
      }
    }

    eventBus.publish(EVENT_TYPES.SCHEDULE_ENTRY_UPDATED, {
      entryId,
      projectId: existing.projectId,
      changedFields: Object.keys(data),
      updatedBy,
    }, { source: 'pm:schedule' });

    auditService.logEvent({
      eventType: 'schedule_entry.updated',
      userId: updatedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { entryId, projectId: existing.projectId, changedFields: Object.keys(data) },
      module: 'pm',
    });

    return updated;
  }

  async deleteEntry(entryId, deletedBy, meta = {}) {
    const existing = await scheduleRepository.findById(entryId);
    if (!existing) throw new NotFoundError('ScheduleEntry', entryId);

    await scheduleRepository.softDelete(entryId);

    await this._invalidateCache(existing.projectId);
    await cacheManager.del('pm:dashboard:milestones');

    eventBus.publish(EVENT_TYPES.SCHEDULE_ENTRY_DELETED, {
      entryId,
      projectId: existing.projectId,
      deletedBy,
    }, { source: 'pm:schedule' });

    auditService.logEvent({
      eventType: 'schedule_entry.deleted',
      userId: deletedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { entryId, projectId: existing.projectId },
      module: 'pm',
    });

    logger.info('Schedule entry deleted', {
      module: 'pm',
      action: 'delete',
      entryId,
      projectId: existing.projectId,
    });
  }

  _getBusinessDaysUntil(targetDate) {
    const now = new Date();
    const target = new Date(targetDate);
    if (target <= now) return 0;
    let count = 0;
    const current = new Date(now);
    current.setHours(0, 0, 0, 0);
    const end = new Date(target);
    end.setHours(0, 0, 0, 0);
    while (current < end) {
      current.setDate(current.getDate() + 1);
      const day = current.getDay();
      if (day !== 0 && day !== 6) count++;
    }
    return count;
  }

  async sendConfirmation(entryId, data, userId, meta = {}) {
    const entry = await scheduleRepository.findById(entryId);
    if (!entry) throw new NotFoundError('ScheduleEntry', entryId);

    const Project = (await import('./project.model.js')).default;
    const project = entry.projectId ? await Project.findById(entry.projectId).select('name projectNumber').lean() : null;

    const leadDays = config.pm.scheduleConfirmationLeadDays;
    const targetDate = entry.entryType === 'PHASE' ? entry.startDate : entry.milestoneDate;
    if (targetDate) {
      const businessDays = this._getBusinessDaysUntil(targetDate);
      // Soft warning: under the lead-time, allow sending only when the caller
      // has acknowledged the short notice. Otherwise raise a distinguishable
      // ConflictError carrying a flag so the client can re-confirm "send anyway".
      if (businessDays < leadDays && data.acknowledgeShortNotice !== true) {
        throw new ConflictError(
          `Only ${businessDays} business days until the scheduled date (recommended minimum ${leadDays})`,
          { shortNotice: true, businessDays, leadDays },
        );
      }
    }

    // Generate the appointment-confirmation PDF document (PROJ-004 AC-3). Uses the
    // seeded `project_appointment_confirmation` letter template; the composed body
    // (project ref, scheduled dates, scope, contact person) is built the same way
    // PROJ-005 documents are. The generated document is linked to the confirmation
    // and attached to the partner email.
    const generatedDoc = await this._generateConfirmationDocument(entry, project, data, userId, meta);

    const confirmation = await scheduleRepository.createConfirmation({
      scheduleEntryId: entryId,
      partnerCompanyId: data.partnerCompanyId,
      partnerContactEmail: data.partnerContactEmail,
      confirmationStatus: 'SENT',
      sentAt: new Date(),
      documentId: generatedDoc?._id || null,
      createdBy: userId,
    });

    await this._invalidateCache(entry.projectId);

    // Enqueue email job. Pass the generated PDF's fileId so the worker loads the
    // buffer and attaches it (keeps the queue payload small).
    await queueManager.addJob('auth-email', 'send-partner-confirmation', {
      email: data.partnerContactEmail,
      partnerName: data.partnerName,
      projectName: project?.name || null,
      projectNumber: project?.projectNumber || null,
      entryName: entry.name,
      startDate: entry.startDate,
      endDate: entry.endDate,
      siteAddress: data.siteAddress || null,
      contactPerson: data.contactPerson || null,
      notes: entry.notes,
      documentFileId: generatedDoc?.fileId || null,
    });

    eventBus.publish(EVENT_TYPES.PARTNER_CONFIRMATION_SENT, {
      confirmationId: confirmation._id,
      entryId,
      projectId: entry.projectId,
      partnerCompanyId: data.partnerCompanyId,
      email: data.partnerContactEmail,
      userId,
    }, { source: 'pm:schedule' });

    auditService.logEvent({
      eventType: 'partner_confirmation.sent',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { confirmationId: confirmation._id, entryId, partnerCompanyId: data.partnerCompanyId },
      module: 'pm',
    });

    logger.info('Partner confirmation sent', {
      module: 'pm',
      action: 'sendConfirmation',
      confirmationId: confirmation._id,
      entryId,
    });

    return confirmation;
  }

  /**
   * Build + generate the appointment-confirmation PDF for a partner (PROJ-004 AC-3).
   * Mirrors the PROJ-005 document path: compose the renderer body from the entry +
   * project, then hand off to the shared documentGeneration service. Returns the
   * generated document ({ _id, fileId, fileName }).
   */
  async _generateConfirmationDocument(entry, project, data, userId, meta = {}) {
    const fmt = (d) => (d ? new Date(d).toISOString().split('T')[0] : null);
    const targetStart = entry.entryType === 'PHASE' ? entry.startDate : entry.milestoneDate;
    const targetEnd = entry.entryType === 'PHASE' ? entry.endDate : entry.milestoneDate;
    const scheduled = `${fmt(targetStart) || ''}${targetEnd && targetEnd !== targetStart ? ` – ${fmt(targetEnd)}` : ''}`.trim();

    const templateData = {
      documentNumber: project?.projectNumber || null,
      documentDate: new Date().toISOString().split('T')[0],
      projectName: project?.name || null,
      projectNumber: project?.projectNumber || null,
      recipientName: data.partnerName || null,
      site: data.siteAddress ? { address: data.siteAddress } : null,
      description: [
        scheduled ? `Termin: ${scheduled}` : null,
        `Arbeiten: ${entry.name}`,
        data.contactPerson ? `Kontaktperson: ${data.contactPerson}` : null,
      ].filter(Boolean).join('\n'),
      notes: entry.notes || null,
    };

    const { buildPmDocumentBody } = await import('./pmDocumentBody.js');
    Object.assign(templateData, buildPmDocumentBody('project_appointment_confirmation', templateData));
    templateData.templateType = 'project_appointment_confirmation';

    const documentGenerationService = (await import('../doctpl/documentGeneration.service.js')).default;
    return documentGenerationService.generate({
      templateType: 'project_appointment_confirmation',
      sourceModule: 'pm',
      sourceRecordId: entry.projectId,
      data: templateData,
      language: 'de',
      generatedBy: userId,
      meta,
    });
  }

  /**
   * Bulk partner confirmations. Loops sendConfirmation per item, collecting a
   * per-item result so a short-notice item (or a hard error) is reported rather
   * than aborting the whole batch. Items flagged 'short_notice' carry the
   * businessDays/leadDays so the caller can re-submit with acknowledgeShortNotice.
   * Returns: { results: [{ entryId, status, businessDays?, leadDays?, message? }],
   *            summary: { sent, shortNotice, error } }
   */
  async sendBulkConfirmations(items, userId, meta = {}) {
    const results = [];
    for (const item of items) {
      const { entryId, ...data } = item;
      try {
        await this.sendConfirmation(entryId, data, userId, meta);
        results.push({ entryId, status: 'sent' });
      } catch (err) {
        // Distinguish the soft short-notice warning (a ConflictError carrying a
        // shortNotice flag) from a genuine error — never abort the batch.
        if (err?.data?.shortNotice) {
          results.push({
            entryId,
            status: 'short_notice',
            businessDays: err.data.businessDays,
            leadDays: err.data.leadDays,
            message: err.message,
          });
        } else {
          results.push({ entryId, status: 'error', message: err.message });
        }
      }
    }

    const summary = {
      sent: results.filter((r) => r.status === 'sent').length,
      shortNotice: results.filter((r) => r.status === 'short_notice').length,
      error: results.filter((r) => r.status === 'error').length,
    };

    auditService.logEvent({
      eventType: 'partner_confirmation.bulk_sent',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { total: items.length, ...summary },
      module: 'pm',
    });

    logger.info('Bulk partner confirmations processed', {
      module: 'pm',
      action: 'sendBulkConfirmations',
      total: items.length,
      ...summary,
    });

    return { results, summary };
  }

  async updateConfirmationResponse(confirmationId, data, userId, meta = {}) {
    const existing = await scheduleRepository.findConfirmationById(confirmationId);
    if (!existing) throw new NotFoundError('PartnerConfirmation', confirmationId);

    const updated = await scheduleRepository.updateConfirmationById(confirmationId, {
      confirmationStatus: data.confirmationStatus,
      responseAt: new Date(),
      responseNotes: data.responseNotes || null,
    });

    const entry = await scheduleRepository.findById(existing.scheduleEntryId);
    if (entry?.projectId) {
      await this._invalidateCache(entry.projectId);
    }

    eventBus.publish(EVENT_TYPES.PARTNER_CONFIRMATION_RESPONSE, {
      confirmationId,
      entryId: existing.scheduleEntryId,
      confirmationStatus: data.confirmationStatus,
      userId,
    }, { source: 'pm:schedule' });

    auditService.logEvent({
      eventType: 'partner_confirmation.response',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { confirmationId, confirmationStatus: data.confirmationStatus },
      module: 'pm',
    });

    return updated;
  }

  async exportPdf(projectId, userId, meta = {}) {
    const Project = (await import('./project.model.js')).default;
    const project = await Project.findById(projectId)
      .populate('customerId', 'name')
      .populate('projectManagerId', 'firstName lastName');
    if (!project) throw new NotFoundError('Project', projectId);

    const entries = await scheduleRepository.findByProjectId(projectId);

    const templateData = {
      documentNumber: project.projectNumber,
      documentDate: new Date().toISOString().split('T')[0],
      projectName: project.name,
      projectNumber: project.projectNumber,
      customer: project.customerId ? { name: project.customerId.name } : null,
      projectManager: project.projectManagerId
        ? `${project.projectManagerId.firstName} ${project.projectManagerId.lastName}`
        : null,
      phases: entries.filter(e => e.entryType === 'PHASE').map(e => ({
        name: e.name,
        startDate: e.startDate?.toISOString().split('T')[0],
        endDate: e.endDate?.toISOString().split('T')[0],
        status: e.status,
      })),
      milestones: entries.filter(e => e.entryType === 'MILESTONE').map(e => ({
        name: e.name,
        date: e.milestoneDate?.toISOString().split('T')[0],
        status: e.status,
      })),
    };

    const documentGenerationService = (await import('../doctpl/documentGeneration.service.js')).default;
    const generatedDoc = await documentGenerationService.generate({
      templateType: 'project_schedule',
      sourceModule: 'pm',
      sourceRecordId: projectId,
      data: templateData,
      language: 'de',
      generatedBy: userId,
      meta,
    });

    auditService.logEvent({
      eventType: 'schedule.exported_pdf',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { projectId, fileId: generatedDoc.fileId },
      module: 'pm',
    });

    return generatedDoc;
  }

  /**
   * Transfer the project's Bauplan into the Einsatzplanung (deploy assignments).
   * Only PHASE entries owned by an internal team member with a valid date range
   * are transferred — milestones stay markers (PROJ – Bauplan). Idempotent: a
   * phase already transferred (matched via sourceScheduleEntryId) is skipped, so
   * the same call doubles as the "update from plan" re-sync. Conflicts are
   * detected by the existing deploy conflict engine (Konflikte).
   */
  async transferToEinsatzplanung(projectId, userId, meta = {}) {
    const entries = await scheduleRepository.findByProjectId(projectId);
    const phases = entries.filter((e) => (
      e.entryType === 'PHASE'
      && e.responsibleType === 'INTERNAL_TEAM'
      && e.responsibleTeamId
      && e.startDate && e.endDate
    ));

    const Assignment = (await import('../deploy/assignment.model.js')).default;
    const existing = await Assignment.find({
      sourceScheduleEntryId: { $in: phases.map((p) => p._id) },
    }).select('sourceScheduleEntryId').lean();
    const alreadyTransferred = new Set(existing.map((a) => String(a.sourceScheduleEntryId)));

    const assignmentService = (await import('../deploy/assignment.service.js')).default;
    const createdIds = [];
    const conflicts = [];
    let skippedCount = 0;

    for (const phase of phases) {
      if (alreadyTransferred.has(String(phase._id))) { skippedCount += 1; continue; }

      const start = new Date(phase.startDate); start.setHours(0, 0, 0, 0);
      const end = new Date(phase.endDate); end.setHours(23, 59, 59, 999);
      const employeeId = (phase.responsibleTeamId && typeof phase.responsibleTeamId === 'object')
        ? phase.responsibleTeamId._id
        : phase.responsibleTeamId;

      const results = await assignmentService.create({
        employeeIds: [employeeId],
        assignmentType: 'PROJECT_WORK',
        projectId,
        title: phase.name,
        startDatetime: start,
        endDatetime: end,
        isFullDay: true,
        sourceScheduleEntryId: phase._id,
      }, userId, meta);

      for (const r of results) {
        createdIds.push(r.id);
        if (r.conflicts?.length) conflicts.push({ assignmentId: r.id, phase: phase.name, count: r.conflicts.length });
      }
    }

    return {
      target: 'einsatzplanung',
      phaseCount: phases.length,
      createdCount: createdIds.length,
      skippedCount,
      conflictCount: conflicts.length,
      createdIds,
      conflicts,
    };
  }

  /**
   * Transfer the project's Bauplan into the Grobplanung (weekly coarse
   * allocations). Each internal-team PHASE is spread over the ISO weeks it
   * spans; the weekly allocationPercent is derived from the phase's working-day
   * coverage of that week (Q5) unless an explicit percent is supplied (manual
   * override from the dialog). Reuses coarseService.create, which enforces the
   * ≤100 %/week cap (Ueberzuteilung) and rejects duplicates — so a re-run
   * skips weeks already transferred, and over-allocated weeks are reported.
   */
  async transferToGrobplanung(projectId, { allocationPercent = null } = {}, userId, meta = {}) {
    const entries = await scheduleRepository.findByProjectId(projectId);
    const phases = entries.filter((e) => (
      e.entryType === 'PHASE'
      && e.responsibleType === 'INTERNAL_TEAM'
      && e.responsibleTeamId
      && e.startDate && e.endDate
    ));

    const coarseService = (await import('../deploy/coarse.service.js')).default;
    let createdCount = 0;
    let skippedCount = 0;
    const overAllocated = [];

    for (const phase of phases) {
      const employeeId = (phase.responsibleTeamId && typeof phase.responsibleTeamId === 'object')
        ? phase.responsibleTeamId._id
        : phase.responsibleTeamId;

      // Count the phase's working days (Mon–Fri) per ISO week it covers.
      const workingDaysByWeek = new Map();
      const cursor = new Date(phase.startDate); cursor.setHours(12, 0, 0, 0);
      const end = new Date(phase.endDate); end.setHours(12, 0, 0, 0);
      while (cursor <= end) {
        const dow = cursor.getDay();
        if (dow !== 0 && dow !== 6) {
          const { calendarYear, calendarWeek } = isoWeekOf(cursor);
          const key = `${calendarYear}:${calendarWeek}`;
          workingDaysByWeek.set(key, (workingDaysByWeek.get(key) || 0) + 1);
        }
        cursor.setDate(cursor.getDate() + 1);
      }

      for (const [key, workingDays] of workingDaysByWeek) {
        const [calendarYear, calendarWeek] = key.split(':').map(Number);
        const percent = allocationPercent || snapAllocationPercent(Math.round((workingDays / 5) * 100));
        if (!percent) continue;
        try {
          await coarseService.create({ employeeId, projectId, calendarYear, calendarWeek, allocationPercent: percent }, userId, meta);
          createdCount += 1;
        } catch (err) {
          if (err instanceof ConflictError) {
            if (/already exists/i.test(err.message)) skippedCount += 1;
            else overAllocated.push({ phase: phase.name, week: `${calendarYear}-KW${calendarWeek}` });
          } else {
            throw err;
          }
        }
      }
    }

    return {
      target: 'grobplanung',
      phaseCount: phases.length,
      createdCount,
      skippedCount,
      overAllocatedCount: overAllocated.length,
      overAllocated,
    };
  }

  /**
   * Export the Bauplan / milestone plan as a spreadsheet (CSV, UTF-8 + BOM,
   * ';' separator) that opens natively in Excel. Mirrors the PDF content:
   * header block + Phasen table + Meilensteine table (PROJ – Bauplan export).
   */
  async exportExcel(projectId) {
    const Project = (await import('./project.model.js')).default;
    const project = await Project.findById(projectId)
      .populate('customerId', 'name')
      .populate('projectManagerId', 'firstName lastName');
    if (!project) throw new NotFoundError('Project', projectId);

    const entries = await scheduleRepository.findByProjectId(projectId);
    const phases = entries.filter((e) => e.entryType === 'PHASE');
    const milestones = entries.filter((e) => e.entryType === 'MILESTONE');

    const STATUS_DE = {
      PLANNED: 'Geplant', IN_PROGRESS: 'In Arbeit', COMPLETED: 'Abgeschlossen',
      CANCELLED: 'Abgebrochen', WAIVED: 'Verzichtet',
    };
    const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('de-CH') : '');
    const esc = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const row = (...cells) => cells.map(esc).join(';');

    const lines = [
      row('Bauplan / Terminplan'),
      row('Projekt', project.name),
      row('Projekt-Nr.', project.projectNumber),
      row('Kunde', project.customerId?.name || ''),
      row('Projektleiter', project.projectManagerId
        ? `${project.projectManagerId.firstName} ${project.projectManagerId.lastName}` : ''),
      row('Exportiert am', new Date().toLocaleDateString('de-CH')),
      '',
      row('Phasen'),
      row('Name', 'Start', 'Ende', 'Status'),
      ...phases.map((p) => row(p.name, fmtDate(p.startDate), fmtDate(p.endDate), STATUS_DE[p.status] || p.status)),
      '',
      row('Meilensteine'),
      row('Name', 'Datum', 'Status'),
      ...milestones.map((m) => row(m.name, fmtDate(m.milestoneDate), STATUS_DE[m.status] || m.status)),
    ];

    return {
      csv: `\uFEFF${lines.join('\r\n')}`,
      filename: `Bauplan_${project.projectNumber || projectId}.csv`,
    };
  }

  async exportIcal(projectId) {
    const Project = (await import('./project.model.js')).default;
    const project = await Project.findById(projectId);
    if (!project) throw new NotFoundError('Project', projectId);

    const entries = await scheduleRepository.findByProjectId(projectId);
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//SwissHVAC-ERP//PM//EN',
      `X-WR-CALNAME:${project.name} – Schedule`,
    ];

    for (const entry of entries) {
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${entry._id}@pm.schedule`);
      lines.push(`SUMMARY:${entry.name}`);

      if (entry.entryType === 'PHASE' && entry.startDate && entry.endDate) {
        lines.push(`DTSTART;VALUE=DATE:${this._formatIcalDate(entry.startDate)}`);
        lines.push(`DTEND;VALUE=DATE:${this._formatIcalDate(entry.endDate)}`);
      } else if (entry.milestoneDate) {
        lines.push(`DTSTART;VALUE=DATE:${this._formatIcalDate(entry.milestoneDate)}`);
        lines.push(`DTEND;VALUE=DATE:${this._formatIcalDate(entry.milestoneDate)}`);
      }

      lines.push(`STATUS:${entry.status}`);
      if (entry.notes) lines.push(`DESCRIPTION:${entry.notes.replace(/\n/g, '\\n')}`);
      lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  _formatIcalDate(date) {
    const d = new Date(date);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  }

  async _cascadeDateChanges(entryId, oldEntry, newEntry, visited, depth) {
    if (depth >= 10 || visited.has(entryId.toString())) return [];
    visited.add(entryId.toString());

    const oldEnd = oldEntry.entryType === 'PHASE' ? oldEntry.endDate : oldEntry.milestoneDate;
    const newEnd = newEntry.entryType === 'PHASE' ? newEntry.endDate : newEntry.milestoneDate;
    if (!oldEnd || !newEnd) return [];

    const deltaMs = new Date(newEnd).getTime() - new Date(oldEnd).getTime();
    if (deltaMs === 0) return [];

    const dependents = await scheduleRepository.findDependents(entryId);
    const affected = [];

    for (const dep of dependents) {
      const updates = {};
      if (dep.entryType === 'PHASE') {
        if (dep.startDate) updates.startDate = new Date(new Date(dep.startDate).getTime() + deltaMs);
        if (dep.endDate) updates.endDate = new Date(new Date(dep.endDate).getTime() + deltaMs);
      } else if (dep.milestoneDate) {
        updates.milestoneDate = new Date(new Date(dep.milestoneDate).getTime() + deltaMs);
      }

      if (Object.keys(updates).length > 0) {
        const updatedDep = await scheduleRepository.updateById(dep._id, updates);
        affected.push(dep._id.toString());
        const childAffected = await this._cascadeDateChanges(dep._id, dep, updatedDep, visited, depth + 1);
        affected.push(...childAffected);
      }
    }
    return affected;
  }

  async _invalidateCache(projectId) {
    await cacheManager.del(`pm:schedule:project:${projectId}`);
  }
}

const scheduleService = new ScheduleService();
export default scheduleService;
