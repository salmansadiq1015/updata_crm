import scheduleRepository from './schedule.repository.js';
import auditService from '../auth/audit.service.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import queueManager from '../../shared/queue/QueueManager.js';
import { NotFoundError, ValidationError } from '../../shared/errors/AppError.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

const ENTITY_TTL = { l1Ttl: 60, l2Ttl: 300 };

class ScheduleService {
  async getSchedule(projectId) {
    const cacheKey = `pm:schedule:project:${projectId}`;
    return cacheManager.getOrSet(
      cacheKey,
      () => scheduleRepository.findByProjectId(projectId),
      ENTITY_TTL,
    );
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

    const targetDate = entry.entryType === 'PHASE' ? entry.startDate : entry.milestoneDate;
    if (targetDate) {
      const businessDays = this._getBusinessDaysUntil(targetDate);
      if (businessDays < 5) {
        throw new ValidationError(
          'Confirmation must be sent at least 5 business days before the scheduled date',
          [{ field: 'scheduledDate', message: `Only ${businessDays} business days until the scheduled date (minimum 5 required)` }],
        );
      }
    }

    const confirmation = await scheduleRepository.createConfirmation({
      scheduleEntryId: entryId,
      partnerCompanyId: data.partnerCompanyId,
      partnerContactEmail: data.partnerContactEmail,
      confirmationStatus: 'SENT',
      sentAt: new Date(),
      createdBy: userId,
    });

    // Enqueue email job
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

  async updateConfirmationResponse(confirmationId, data, userId, meta = {}) {
    const existing = await scheduleRepository.findConfirmationById(confirmationId);
    if (!existing) throw new NotFoundError('PartnerConfirmation', confirmationId);

    const updated = await scheduleRepository.updateConfirmationById(confirmationId, {
      confirmationStatus: data.confirmationStatus,
      responseAt: new Date(),
      responseNotes: data.responseNotes || null,
    });

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
