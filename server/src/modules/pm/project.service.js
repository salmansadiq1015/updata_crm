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
const PROJECT_STATUSES = [
  'DRAFT',
  'PLANNING',
  'SCHEDULED',
  'WAITING_FOR_MATERIAL',
  'IN_PROGRESS',
  'AWAITING_CUSTOMER_APPROVAL',
  'AWAITING_QUOTATION_APPROVAL',
  'ON_HOLD',
  'COMPLETED',
  'INVOICED',
  'ARCHIVED',
];

class ProjectService {
  // Resolve a customer's display name for the denormalized `customerName` field
  // (PROJ-007 AC-3 — enables alphabetical sort within cursor pagination).
  async _resolveCustomerName(customerId) {
    if (!customerId) return null;
    const Customer = (await import('../crm/customer.model.js')).default;
    const customer = await Customer.findById(customerId).select('name').lean();
    return customer?.name || null;
  }

  async create(data, createdBy, meta = {}) {
    await this._checkNameUniqueness(data.name, data.customerId);

    const projectNumber = await counterService.getNextProjectNumber();

    const customerName = await this._resolveCustomerName(data.customerId);
    const project = await projectRepository.create({
      ...data,
      customerName,
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
    const { cursor, limit, sortBy, sortOrder, search, plannedStartFrom, plannedStartTo, includeDeleted, ...filters } = queryParams;
    const filterKey = Object.entries({ ...filters, plannedStartFrom, plannedStartTo, includeDeleted })
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    const cacheKey = `pm:projects:list:${cursor || ''}:${limit}:${sortBy}:${sortOrder}:${search || ''}:${filterKey}`;

    return cacheManager.getOrSet(
      cacheKey,
      () => projectRepository.findWithCursor({ cursor, limit, sortBy, sortOrder, filters, search, plannedStartFrom, plannedStartTo, includeDeleted }),
      LIST_TTL,
    );
  }

  async search(searchTerm, limit = 25) {
    return projectRepository.textSearch(searchTerm, limit);
  }

  async update(id, data, updatedBy, meta = {}) {
    const existing = await projectRepository.findById(id);
    if (!existing) throw new NotFoundError('Project', id);

    const nameChanged = data.name && data.name !== existing.name;
    const customerChanged = data.customerId && data.customerId.toString() !== existing.customerId?.toString();
    if (nameChanged || customerChanged) {
      await this._checkNameUniqueness(
        data.name || existing.name,
        data.customerId || existing.customerId,
        id,
      );
    }

    const patch = { ...data, updatedBy };
    if (customerChanged) patch.customerName = await this._resolveCustomerName(data.customerId);
    const updated = await projectRepository.updateById(id, patch);
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

  /**
   * Archive a project (PROJ-001 AC-7). A status-only change to ARCHIVED — the
   * dedicated path for non-Draft projects, which cannot be soft-deleted. Idempotent
   * guard: already-archived projects are rejected.
   */
  async archive(id, archivedBy, meta = {}) {
    const project = await projectRepository.findById(id);
    if (!project) throw new NotFoundError('Project', id);
    if (project.status === 'ARCHIVED') {
      throw new ConflictError('Project is already archived');
    }

    await projectRepository.archive(id);
    await this._invalidateProjectCache(id);
    await this._invalidateListCache();
    await this._invalidateDashboardCache();

    eventBus.publish(EVENT_TYPES.PROJECT_ARCHIVED, {
      projectId: id,
      previousStatus: project.status,
      archivedBy,
    }, { source: 'pm:projects' });

    auditService.logEvent({
      eventType: 'project.archived',
      userId: archivedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { projectId: id, projectNumber: project.projectNumber, previousStatus: project.status },
      module: 'pm',
    });

    return projectRepository.findById(id);
  }

  /**
   * Restore a soft-deleted project (PROJ-001 AC-6). Clears the isDeleted flag,
   * returning the project to its prior status (delete no longer forces ARCHIVED).
   */
  async restore(id, restoredBy, meta = {}) {
    const project = await projectRepository.findByIdWithDeleted(id);
    if (!project) throw new NotFoundError('Project', id);
    if (!project.isDeleted) {
      throw new ConflictError('Project is not deleted');
    }

    await projectRepository.restore(id);
    await this._invalidateProjectCache(id);
    await this._invalidateListCache();
    await this._invalidateDashboardCache();

    eventBus.publish(EVENT_TYPES.PROJECT_RESTORED, {
      projectId: id,
      restoredBy,
    }, { source: 'pm:projects' });

    auditService.logEvent({
      eventType: 'project.restored',
      userId: restoredBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { projectId: id, projectNumber: project.projectNumber },
      module: 'pm',
    });

    return projectRepository.findById(id);
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
      customerName: original.customerName || original.customerId?.name || null,
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
        const Project = (await import('./project.model.js')).default;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const next30Days = new Date(today);
        next30Days.setDate(next30Days.getDate() + 30);

        const ScheduleEntry = (await import('./scheduleEntry.model.js')).default;

        const [
          statusCounts,
          typeCounts,
          overdue,
          startingSoon,
          endingSoon,
          budget,
          upcomingMilestones,
        ] = await Promise.all([
          projectRepository.countByStatus(),
          projectRepository.countByType(),
          Project.countDocuments({
            isDeleted: false,
            status: { $in: ['PLANNING', 'IN_PROGRESS', 'ON_HOLD'] },
            plannedEndDate: { $lt: today },
          }),
          Project.countDocuments({
            isDeleted: false,
            status: { $in: ['DRAFT', 'PLANNING'] },
            plannedStartDate: { $gte: today, $lte: next30Days },
          }),
          Project.countDocuments({
            isDeleted: false,
            status: { $in: ['PLANNING', 'IN_PROGRESS'] },
            plannedEndDate: { $gte: today, $lte: next30Days },
          }),
          projectRepository.getBudgetSummary(),
          ScheduleEntry.countDocuments({
            isDeleted: false,
            entryType: 'MILESTONE',
            milestoneDate: { $gte: today, $lte: next30Days },
            status: { $nin: ['COMPLETED', 'CANCELLED', 'WAIVED'] },
          }),
        ]);

        const byStatus = PROJECT_STATUSES.reduce((acc, status) => {
          acc[status] = 0;
          return acc;
        }, {});
        for (const item of statusCounts) {
          byStatus[item.status] = item.count;
        }

        const total = statusCounts.reduce((sum, status) => sum + status.count, 0);

        return {
          total,
          byStatus,
          statusCounts,
          byType: typeCounts.reduce((acc, item) => {
            acc[item.projectType] = item.count;
            return acc;
          }, {}),
          risk: {
            overdue,
            startingSoon,
            endingSoon,
          },
          budget,
          upcomingMilestones,
          refreshedAt: new Date(),
        };
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

  async bulkUpdate(ids, data, updatedBy, _meta = {}) {
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

  async bulkDeactivate(ids, deactivatedBy, _meta = {}) {
    if (!ids?.length) return { deactivatedCount: 0 };
    const deactivatedCount = await projectRepository.bulkUpdate(ids, { status: 'ARCHIVED' });
    for (const id of ids) await this._invalidateProjectCache(id);
    await this._invalidateListCache();
    await this._invalidateDashboardCache();

    eventBus.publish(EVENT_TYPES.PROJECT_ARCHIVED, { projectIds: ids, deactivatedBy, bulk: true }, { source: 'pm:projects' });
    return { deactivatedCount };
  }

  /**
   * Per-project activity log (PROJ-005 AC-6 / PROJ-001). Surfaces the existing
   * audit trail scoped to one project — every PM event (project lifecycle, prep
   * actions, schedule, documents, status) records details.projectId, so a single
   * queryByEntity returns a chronological, author-stamped timeline.
   */
  async getActivity(id, { limit = 100 } = {}) {
    const project = await projectRepository.findById(id);
    if (!project) throw new NotFoundError('Project', id);

    const mongoose = (await import('mongoose')).default;
    const candidates = [String(id)];
    if (mongoose.Types.ObjectId.isValid(id)) {
      candidates.push(new mongoose.Types.ObjectId(id));
    }

    const entries = await auditService.queryByEntity({
      module: 'pm',
      detailsKey: 'projectId',
      entityId: candidates,
      limit,
    });

    // Resolve actor names so the timeline reads "Anna Meier" rather than a raw id.
    const userIds = [...new Set(entries.map((e) => e.userId).filter(Boolean).map(String))];
    if (userIds.length === 0) return entries;

    const User = (await import('../auth/user.model.js')).default;
    const users = await User.find({ _id: { $in: userIds } }).select('firstName lastName').lean();
    const nameById = new Map(
      users.map((u) => [String(u._id), `${u.firstName || ''} ${u.lastName || ''}`.trim() || null]),
    );

    return entries.map((e) => ({
      ...e,
      userName: e.userId ? (nameById.get(String(e.userId)) || null) : null,
    }));
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

  async createFromTemplate(templateId, overrides, createdBy, meta = {}) {
    const template = await projectRepository.findById(templateId);
    if (!template) throw new NotFoundError('Template project', templateId);

    const projectNumber = await counterService.getNextProjectNumber();

    const resolvedCustomerId = overrides.customerId || template.customerId?._id || template.customerId;
    const newProject = await projectRepository.create({
      projectNumber,
      name: overrides.name || `${template.name} (Copy)`,
      description: template.description,
      projectType: overrides.projectType || template.projectType,
      status: 'DRAFT',
      customerId: resolvedCustomerId,
      customerName: await this._resolveCustomerName(resolvedCustomerId),
      siteId: overrides.siteId || template.siteId?._id || template.siteId || null,
      projectManagerId: overrides.projectManagerId || template.projectManagerId?._id || template.projectManagerId,
      teamId: overrides.teamId || template.teamId || null,
      plannedStartDate: overrides.plannedStartDate || null,
      plannedEndDate: overrides.plannedEndDate || null,
      estimatedBudget: template.estimatedBudget,
      currency: template.currency,
      notes: template.notes,
      templateId,
      createdBy,
    });

    const scheduleRepository = (await import('./schedule.repository.js')).default;
    const prepActionRepository = (await import('./prepAction.repository.js')).default;

    const templateEntries = await scheduleRepository.findByProjectId(templateId);
    if (templateEntries.length > 0 && overrides.plannedStartDate) {
      const templateStart = template.plannedStartDate ? new Date(template.plannedStartDate).getTime() : null;
      const newStart = new Date(overrides.plannedStartDate).getTime();

      for (const entry of templateEntries) {
        const offsetMs = templateStart ? newStart - templateStart : 0;
        const entryData = {
          projectId: newProject._id,
          name: entry.name,
          entryType: entry.entryType,
          status: 'PLANNED',
          responsibleType: entry.responsibleType,
          notes: entry.notes,
          sortOrder: entry.sortOrder,
          createdBy,
        };
        if (entry.startDate) entryData.startDate = new Date(new Date(entry.startDate).getTime() + offsetMs);
        if (entry.endDate) entryData.endDate = new Date(new Date(entry.endDate).getTime() + offsetMs);
        if (entry.milestoneDate) entryData.milestoneDate = new Date(new Date(entry.milestoneDate).getTime() + offsetMs);
        await scheduleRepository.create(entryData);
      }
    } else if (templateEntries.length > 0) {
      for (const entry of templateEntries) {
        await scheduleRepository.create({
          projectId: newProject._id,
          name: entry.name,
          entryType: entry.entryType,
          status: 'PLANNED',
          responsibleType: entry.responsibleType,
          notes: entry.notes,
          sortOrder: entry.sortOrder,
          createdBy,
        });
      }
    }

    const templateActions = await prepActionRepository.findByProjectId(templateId);
    for (const action of templateActions) {
      const cloned = {
        projectId: newProject._id,
        actionType: action.actionType,
        title: action.title,
        description: action.description,
        isMandatory: action.isMandatory,
        assignedToId: action.assignedToId || null,
        externalReference: action.externalReference || null,
        // Fresh instance: status and due date reset; attachments are not copied.
        status: 'CREATED',
        dueDate: null,
        createdBy,
      };

      // Carry the structured funding template values, but reset the
      // instance-specific decision fields (status/approved amount/submission).
      if (action.fundingDetails) {
        cloned.fundingDetails = {
          fundingBody: action.fundingDetails.fundingBody ?? null,
          applicationAmount: action.fundingDetails.applicationAmount ?? null,
          expectedDecisionDate: action.fundingDetails.expectedDecisionDate ?? null,
          approvedAmount: null,
          submissionDate: null,
          fundingStatus: 'DRAFT',
        };
      }

      // Carry the material order template values (supplier + item list), but reset
      // the order/delivery state.
      if (action.materialOrderDetails) {
        cloned.materialOrderDetails = {
          supplier: action.materialOrderDetails.supplier ?? null,
          expectedDeliveryDate: action.materialOrderDetails.expectedDeliveryDate ?? null,
          items: Array.isArray(action.materialOrderDetails.items)
            ? action.materialOrderDetails.items.map((it) => ({
              description: it.description,
              quantity: it.quantity,
              unit: it.unit,
              catalogItemId: it.catalogItemId ?? null,
              catalogSnapshot: it.catalogSnapshot ?? null,
            }))
            : [],
          orderReference: null,
          orderDate: null,
          deliveryStatus: 'PENDING',
        };
      }

      await prepActionRepository.create(cloned);
    }

    await this._cloneTemplateTasks(templateId, newProject._id, createdBy, meta);

    await this._invalidateListCache();
    await this._invalidateDashboardCache();

    eventBus.publish(EVENT_TYPES.PROJECT_CREATED, {
      projectId: newProject._id,
      projectNumber,
      name: newProject.name,
      templateId,
      createdBy,
    }, { source: 'pm:projects' });

    auditService.logEvent({
      eventType: 'project.created_from_template',
      userId: createdBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { projectId: newProject._id, projectNumber, templateId },
      module: 'pm',
    });

    return projectRepository.findById(newProject._id);
  }

  async _cloneTemplateTasks(templateId, newProjectId, createdBy, meta = {}) {
    const Task = (await import('../tasks/task.model.js')).default;
    const taskService = (await import('../tasks/task.service.js')).default;
    const templateTasks = await Task.find({ projectId: templateId, isDeleted: false })
      .sort({ depth: 1, sortOrder: 1, createdAt: 1 })
      .lean();

    if (templateTasks.length === 0) return;

    const idMap = new Map();
    for (const task of templateTasks) {
      const parentId = task.parentTaskId ? idMap.get(String(task.parentTaskId)) : null;
      const payload = {
        title: task.title,
        description: task.description || null,
        status: 'OPEN',
        priority: task.priority || 'NONE',
        projectId: newProjectId,
        assigneeId: task.assigneeId || null,
        sortOrder: task.sortOrder || 0,
      };

      const cloned = parentId
        ? await taskService.createSubtask(parentId, payload, createdBy, meta)
        : await taskService.create(payload, createdBy, meta);

      idMap.set(String(task._id), cloned._id || cloned.id);
    }
  }

  async exportCsv(queryParams) {
    const { search, ...filters } = queryParams;
    const result = await projectRepository.findWithCursor({
      cursor: null,
      limit: 50000,
      sortBy: 'projectNumber',
      sortOrder: 'asc',
      filters,
      search,
    });

    const rows = result.data || [];
    const escape = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v).replace(/"/g, '""');
      return /[",\n;]/.test(s) ? `"${s}"` : s;
    };
    const header = [
      'ProjectNumber', 'Name', 'Type', 'Status',
      'Customer', 'ProjectManager',
      'PlannedStartDate', 'PlannedEndDate',
      'EstimatedBudget', 'Currency', 'CreatedAt',
    ].join(';');
    const body = rows.map((p) => [
      p.projectNumber, p.name, p.projectType, p.status,
      p.customerId?.name || '', p.projectManagerId ? `${p.projectManagerId.firstName || ''} ${p.projectManagerId.lastName || ''}`.trim() : '',
      p.plannedStartDate ? new Date(p.plannedStartDate).toISOString().split('T')[0] : '',
      p.plannedEndDate ? new Date(p.plannedEndDate).toISOString().split('T')[0] : '',
      p.estimatedBudget ?? '', p.currency || 'CHF',
      p.createdAt ? new Date(p.createdAt).toISOString() : '',
    ].map(escape).join(';')).join('\n');

    const bom = '\uFEFF';
    return `${bom}${header}\n${body}`;
  }

  async _checkNameUniqueness(name, customerId, excludeId = null) {
    const Project = (await import('./project.model.js')).default;
    const filter = { name, customerId, isDeleted: false };
    if (excludeId) filter._id = { $ne: excludeId };
    const duplicate = await Project.findOne(filter).lean();
    if (duplicate) {
      throw new ConflictError('A project with this name already exists for this customer');
    }
  }
}

const projectService = new ProjectService();
export default projectService;
