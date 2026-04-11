import scheduleRepository from './schedule.repository.js';
import auditService from '../auth/audit.service.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import queueManager from '../../shared/queue/QueueManager.js';
import { NotFoundError } from '../../shared/errors/AppError.js';
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

  async sendConfirmation(entryId, data, userId, meta = {}) {
    const entry = await scheduleRepository.findById(entryId);
    if (!entry) throw new NotFoundError('ScheduleEntry', entryId);

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
      projectName: entry.projectId?.name || null,
      projectNumber: entry.projectId?.projectNumber || null,
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

  async _invalidateCache(projectId) {
    await cacheManager.del(`pm:schedule:project:${projectId}`);
  }
}

const scheduleService = new ScheduleService();
export default scheduleService;
