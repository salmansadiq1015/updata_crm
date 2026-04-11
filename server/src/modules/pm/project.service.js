import projectRepository from './project.repository.js';
import counterService from './counter.service.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

const ENTITY_TTL = { l1Ttl: 60, l2Ttl: 300 };
const LIST_TTL = { l1Ttl: 30, l2Ttl: 120 };
const DASHBOARD_TTL = { l1Ttl: 30, l2Ttl: 60 };

class ProjectService {
  async create(data, createdBy, meta = {}) {
    const projectNumber = await counterService.getNextProjectNumber();

    const project = await projectRepository.create({
      ...data,
      projectNumber,
      createdBy,
    });

    await this._invalidateListCache();
    await this._invalidateDashboardCache();

    eventBus.publish(EVENT_TYPES.PROJECT_CREATED, {
      projectId: project._id,
      projectNumber,
      name: project.name,
      projectType: project.projectType,
      createdBy,
    }, { source: 'pm:projects' });

    auditService.logEvent({
      eventType: 'project.created',
      userId: createdBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { projectId: project._id, projectNumber },
      module: 'pm',
    });

    logger.info('Project created', { module: 'pm', action: 'create', projectId: project._id, projectNumber });

    return projectRepository.findById(project._id);
  }

  async getById(id) {
    const cacheKey = `pm:project:${id}`;
    const project = await cacheManager.getOrSet(
      cacheKey,
      () => projectRepository.findById(id),
      ENTITY_TTL,
    );
    if (!project) throw new NotFoundError('Project', id);
    return project;
  }

  async list(queryParams) {
    const { cursor, limit, sortBy, sortOrder, search, ...filters } = queryParams;
    const filterKey = Object.entries(filters)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    const cacheKey = `pm:projects:list:${cursor || ''}:${limit}:${sortBy}:${sortOrder}:${search || ''}:${filterKey}`;

    return cacheManager.getOrSet(
      cacheKey,
      () => projectRepository.findWithCursor({ cursor, limit, sortBy, sortOrder, filters, search }),
      LIST_TTL,
    );
  }

  async search(searchTerm, limit = 25) {
    return projectRepository.textSearch(searchTerm, limit);
  }

  async update(id, data, updatedBy, meta = {}) {
    const existing = await projectRepository.findById(id);
    if (!existing) throw new NotFoundError('Project', id);

    const updated = await projectRepository.updateById(id, { ...data, updatedBy });
    await this._invalidateProjectCache(id);
    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.PROJECT_UPDATED, {
      projectId: id,
      changedFields: Object.keys(data),
      updatedBy,
    }, { source: 'pm:projects' });

    auditService.logEvent({
      eventType: 'project.updated',
      userId: updatedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { projectId: id, changedFields: Object.keys(data) },
      module: 'pm',
    });

    return updated;
  }

  async delete(id, deletedBy, meta = {}) {
    const project = await projectRepository.findById(id);
    if (!project) throw new NotFoundError('Project', id);

    if (project.status !== 'DRAFT') {
      throw new ConflictError('Only DRAFT projects can be deleted. Use archive for other statuses.');
    }

    await projectRepository.softDelete(id);
    await this._invalidateProjectCache(id);
    await this._invalidateListCache();
    await this._invalidateDashboardCache();

    eventBus.publish(EVENT_TYPES.PROJECT_DELETED, {
      projectId: id,
      deletedBy,
    }, { source: 'pm:projects' });

    auditService.logEvent({
      eventType: 'project.deleted',
      userId: deletedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { projectId: id, projectNumber: project.projectNumber },
      module: 'pm',
    });
  }

  async duplicate(id, createdBy, meta = {}) {
    const original = await projectRepository.findById(id);
    if (!original) throw new NotFoundError('Project', id);

    const projectNumber = await counterService.getNextProjectNumber();

    const newProject = await projectRepository.create({
      projectNumber,
      name: original.name,
      description: original.description,
      projectType: original.projectType,
      status: 'DRAFT',
      customerId: original.customerId._id || original.customerId,
      siteId: original.siteId?._id || original.siteId || null,
      projectManagerId: original.projectManagerId._id || original.projectManagerId,
      teamId: original.teamId || null,
      plannedStartDate: null,
      plannedEndDate: null,
      actualStartDate: null,
      actualEndDate: null,
      estimatedBudget: original.estimatedBudget,
      currency: original.currency,
      notes: original.notes,
      templateId: original.templateId || null,
      createdBy,
    });

    await this._invalidateListCache();
    await this._invalidateDashboardCache();

    eventBus.publish(EVENT_TYPES.PROJECT_DUPLICATED, {
      originalProjectId: id,
      newProjectId: newProject._id,
      projectNumber,
      createdBy,
    }, { source: 'pm:projects' });

    auditService.logEvent({
      eventType: 'project.duplicated',
      userId: createdBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { originalProjectId: id, newProjectId: newProject._id, projectNumber },
      module: 'pm',
    });

    logger.info('Project duplicated', { module: 'pm', action: 'duplicate', originalProjectId: id, newProjectId: newProject._id });

    return projectRepository.findById(newProject._id);
  }

  async getDashboardSummary() {
    const cacheKey = 'pm:dashboard:summary';
    return cacheManager.getOrSet(
      cacheKey,
      async () => {
        const statusCounts = await projectRepository.countByStatus();
        const total = statusCounts.reduce((sum, s) => sum + s.count, 0);

        const Project = (await import('./project.model.js')).default;
        const overdue = await Project.countDocuments({
          isDeleted: false,
          status: 'IN_PROGRESS',
          plannedEndDate: { $lt: new Date() },
        });

        return { statusCounts, total, overdue };
      },
      DASHBOARD_TTL,
    );
  }

  async getDashboardMilestones(days = 7) {
    const cacheKey = 'pm:dashboard:milestones';
    return cacheManager.getOrSet(
      cacheKey,
      () => projectRepository.findUpcomingMilestones(days),
      DASHBOARD_TTL,
    );
  }

  async bulkUpdate(ids, data, updatedBy, meta = {}) {
    if (!ids?.length) return { modifiedCount: 0 };
    const projects = await projectRepository.findByIds(ids);
    if (projects.length !== ids.length) {
      const found = new Set(projects.map((p) => p._id.toString()));
      const missing = ids.filter((id) => !found.has(id));
      throw new NotFoundError('Projects', missing.join(', '));
    }

    const modifiedCount = await projectRepository.bulkUpdate(ids, data);
    for (const id of ids) await this._invalidateProjectCache(id);
    await this._invalidateListCache();
    await this._invalidateDashboardCache();

    eventBus.publish(EVENT_TYPES.PROJECT_UPDATED, { projectIds: ids, changedFields: Object.keys(data), updatedBy, bulk: true }, { source: 'pm:projects' });
    return { modifiedCount };
  }

  async bulkDeactivate(ids, deactivatedBy, meta = {}) {
    if (!ids?.length) return { deactivatedCount: 0 };
    const deactivatedCount = await projectRepository.bulkUpdate(ids, { status: 'ARCHIVED' });
    for (const id of ids) await this._invalidateProjectCache(id);
    await this._invalidateListCache();
    await this._invalidateDashboardCache();

    eventBus.publish(EVENT_TYPES.PROJECT_ARCHIVED, { projectIds: ids, deactivatedBy, bulk: true }, { source: 'pm:projects' });
    return { deactivatedCount };
  }

  async _invalidateProjectCache(id) {
    await cacheManager.del(`pm:project:${id}`);
  }

  async _invalidateListCache() {
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}pm:projects:list:*`);
  }

  async _invalidateDashboardCache() {
    await cacheManager.del('pm:dashboard:summary');
    await cacheManager.del('pm:dashboard:milestones');
  }
}

const projectService = new ProjectService();
export default projectService;
