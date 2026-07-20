import assetMaintenanceRepository from './assetMaintenance.repository.js';
import maintenanceIntervalRepository from './maintenanceInterval.repository.js';
import maintenanceIntervalService from './maintenanceInterval.service.js';
import Installation from './installation.model.js';
import MaintenanceInterval from './maintenanceInterval.model.js';
import assignmentService from '../deploy/assignment.service.js';
import { buildEntityTimeline } from './activityTimeline.service.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/AppError.js';
import auditService from '../auth/audit.service.js';
import logger from '../../shared/logger/index.js';

const DEFAULT_ASSIGNMENT_DURATION_HOURS = 2;

class AssetMaintenanceService {
  async listWorkItems(queryParams = {}) {
    const { cursor, limit, sortBy, sortOrder, ...filters } = queryParams;
    return assetMaintenanceRepository.findWorkItems({
      cursor,
      limit,
      sortBy: sortBy || 'nextDueDate',
      sortOrder: sortOrder || 'asc',
      filters,
    });
  }

  async getContext(installationId) {
    const context = await assetMaintenanceRepository.findContextByInstallationId(installationId);
    if (!context) throw new NotFoundError('Installation', installationId);

    const history = await buildEntityTimeline({
      entityType: 'installation',
      entityId: installationId,
      limit: 12,
      order: 'desc',
    });

    return {
      ...context,
      history: history.data || [],
      historyPagination: history.pagination || null,
    };
  }

  async bulkCreateMaintenance(data, createdBy, meta = {}) {
    const {
      installationIds,
      skipExisting = true,
      ...maintenanceData
    } = data;

    const results = {
      created: [],
      skipped: [],
      failed: [],
    };

    for (const installationId of installationIds) {
      try {
        if (skipExisting) {
          const existing = await maintenanceIntervalRepository.findByInstallationId(installationId);
          const duplicate = existing.find((interval) => (
            interval.maintenanceType === maintenanceData.maintenanceType &&
            normalizeLabel(interval.customTypeLabel) === normalizeLabel(maintenanceData.customTypeLabel)
          ));

          if (duplicate) {
            results.skipped.push({
              installationId,
              reason: 'matching_interval_exists',
              maintenanceIntervalId: duplicate._id,
            });
            continue;
          }
        }

        const interval = await maintenanceIntervalService.create(installationId, maintenanceData, createdBy, meta);
        results.created.push({
          installationId,
          maintenanceIntervalId: interval._id,
          maintenanceType: interval.maintenanceType,
          nextDueDate: interval.nextDueDate,
          maintenanceStatus: interval.maintenanceStatus,
        });
      } catch (err) {
        results.failed.push({
          installationId,
          reason: err.message,
        });
      }
    }

    auditService.logEvent({
      eventType: 'asset_maintenance.bulk_interval_created',
      userId: createdBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: results.failed.length ? 'partial_success' : 'success',
      details: {
        requested: installationIds.length,
        created: results.created.length,
        skipped: results.skipped.length,
        failed: results.failed.length,
      },
      module: 'crm',
    });

    logger.info('Bulk maintenance interval operation finished', {
      module: 'crm',
      action: 'asset-maintenance:bulk-create',
      requested: installationIds.length,
      created: results.created.length,
      skipped: results.skipped.length,
      failed: results.failed.length,
    });

    return results;
  }

  async schedule(data, scheduledBy, meta = {}) {
    const targets = await this._resolveScheduleTargets(data);
    if (targets.length === 0) {
      throw new ValidationError('At least one maintenance interval or installation must be selected.');
    }

    const results = {
      created: [],
      skipped: [],
      failed: [],
    };

    for (const target of targets) {
      if (target.interval?.linkedServiceOrderId) {
        results.skipped.push({
          installationId: target.installation._id,
          maintenanceIntervalId: target.interval._id,
          reason: 'already_scheduled',
          assignmentId: target.interval.linkedServiceOrderId,
        });
        continue;
      }

      try {
        const payload = this._buildAssignmentPayload(data, target);
        const assignments = await assignmentService.create(payload, scheduledBy, meta);
        const primaryAssignmentId = assignments[0]?.id || null;

        if (target.interval && primaryAssignmentId) {
          await maintenanceIntervalService.update(
            target.interval._id,
            {
              maintenanceStatus: 'scheduled',
              linkedServiceOrderId: primaryAssignmentId,
            },
            scheduledBy,
            meta,
          );
        }

        results.created.push({
          installationId: target.installation._id,
          maintenanceIntervalId: target.interval?._id || null,
          assignmentIds: assignments.map((assignment) => assignment.id),
          employeeIds: assignments.map((assignment) => assignment.employeeId),
        });
      } catch (err) {
        if (targets.length === 1) throw err;
        results.failed.push({
          installationId: target.installation._id,
          maintenanceIntervalId: target.interval?._id || null,
          reason: err.message,
        });
      }
    }

    if (results.created.length === 0 && results.failed.length > 0) {
      throw new ConflictError('No maintenance assignments could be scheduled.', results);
    }

    auditService.logEvent({
      eventType: 'asset_maintenance.scheduled',
      userId: scheduledBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: results.failed.length ? 'partial_success' : 'success',
      details: {
        created: results.created.length,
        skipped: results.skipped.length,
        failed: results.failed.length,
      },
      module: 'crm',
    });

    return results;
  }

  async _resolveScheduleTargets({ maintenanceIntervalIds = [], installationIds = [] }) {
    const targets = [];

    if (maintenanceIntervalIds.length > 0) {
      const intervals = await MaintenanceInterval.find({ _id: { $in: maintenanceIntervalIds } })
        .populate({
          path: 'installationId',
          populate: {
            path: 'siteId',
            select: 'siteNumber name customerId street postalCode city accessInstructions status',
            populate: {
              path: 'customerId',
              select: 'customerNumber name ownerName phone mobile email street postalCode city',
            },
          },
        })
        .lean();

      if (intervals.length !== maintenanceIntervalIds.length) {
        throw new NotFoundError('MaintenanceInterval', 'one or more selected intervals');
      }

      for (const interval of intervals) {
        const installation = interval.installationId;
        if (!installation) throw new NotFoundError('Installation', interval.installationId);
        this._assertSchedulableInstallation(installation);
        targets.push({ interval, installation });
      }
    }

    if (installationIds.length > 0) {
      const installations = await Installation.find({ _id: { $in: installationIds } })
        .populate({
          path: 'siteId',
          select: 'siteNumber name customerId street postalCode city accessInstructions status',
          populate: {
            path: 'customerId',
            select: 'customerNumber name ownerName phone mobile email street postalCode city',
          },
        })
        .lean();

      if (installations.length !== installationIds.length) {
        throw new NotFoundError('Installation', 'one or more selected installations');
      }

      for (const installation of installations) {
        this._assertSchedulableInstallation(installation);
        targets.push({ interval: null, installation });
      }
    }

    return targets;
  }

  _assertSchedulableInstallation(installation) {
    if (installation.status === 'decommissioned') {
      throw new ConflictError('Cannot schedule maintenance for a decommissioned installation.');
    }
  }

  _buildAssignmentPayload(data, { interval, installation }) {
    const site = installation.siteId || null;
    const customer = site?.customerId || null;
    const startDatetime = new Date(data.startDatetime);
    const endDatetime = data.endDatetime
      ? new Date(data.endDatetime)
      : new Date(startDatetime.getTime() + DEFAULT_ASSIGNMENT_DURATION_HOURS * 60 * 60 * 1000);

    const maintenanceLabel = interval
      ? interval.customTypeLabel || interval.maintenanceType
      : 'maintenance';
    const systemLabel = [
      installation.installationNumber,
      installation.manufacturer,
      installation.model,
    ].filter(Boolean).join(' - ');

    return {
      employeeIds: data.employeeIds,
      assignmentType: 'MAINTENANCE',
      title: data.title || `${maintenanceLabel}: ${systemLabel || 'Installation'}`,
      startDatetime,
      endDatetime,
      isFullDay: Boolean(data.isFullDay),
      priority: data.priority || 'NORMAL',
      instructions: buildInstructions(data.instructions, installation, interval),
      customerId: customer?._id || customer || null,
      siteId: site?._id || site || null,
      installationId: installation._id,
      maintenanceIntervalId: interval?._id || null,
      isCustomerAppointment: Boolean(data.isCustomerAppointment),
      appointment: data.isCustomerAppointment ? data.appointment || null : null,
      overrideConflicts: Boolean(data.overrideConflicts),
      overrideReason: data.overrideReason || null,
    };
  }
}

function buildInstructions(instructions, installation, interval) {
  const details = [
    instructions,
    installation?.installationNumber ? `Anlage: ${installation.installationNumber}` : null,
    installation?.manufacturer || installation?.model
      ? `System: ${[installation.manufacturer, installation.model].filter(Boolean).join(' ')}`
      : null,
    interval?.maintenanceType ? `Wartungstyp: ${interval.customTypeLabel || interval.maintenanceType}` : null,
  ].filter(Boolean);

  return details.join('\n');
}

function normalizeLabel(value) {
  return String(value || '').trim().toLowerCase();
}

const assetMaintenanceService = new AssetMaintenanceService();
export default assetMaintenanceService;
