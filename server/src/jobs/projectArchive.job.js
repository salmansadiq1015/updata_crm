import mongoose from 'mongoose';
import { BaseWorker } from '../shared/queue/BaseWorker.js';
import config from '../config/index.js';
import logger from '../shared/logger/index.js';

/**
 * Sentinel ObjectId used for system-initiated write operations that have no
 * associated human user.  Matches the convention used in widgetSubmission.service.js.
 */
const SYSTEM_USER_ID = new mongoose.Types.ObjectId('000000000000000000000000');

/**
 * Project auto-archive job.
 *
 * Finds COMPLETED projects whose completion date is older than the configured
 * retention window (PROJECT_ARCHIVE_RETENTION_DAYS, default 90) and transitions
 * them to ARCHIVED.
 *
 * Completion date is taken from the latest ProjectStatusHistory record with
 * toStatus === 'COMPLETED' for each project (changedAt field).  This is more
 * precise than project.updatedAt because a project could be updated for other
 * reasons after completion.
 *
 * Idempotent: only COMPLETED projects are selected, so already-ARCHIVED
 * projects are never re-processed.
 *
 * Scheduled daily — see jobs/index.js.
 */
export class ProjectArchiveWorker extends BaseWorker {
  constructor() {
    super('project-archive');
  }

  async process(_job) {
    const retentionDays = config.pm?.archiveRetentionDays ?? 90;
    const now = new Date();
    const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);

    // Lazy imports to avoid circular dependencies at module load time
    const [
      { default: Project },
      { default: ProjectStatusHistory },
      { default: statusService },
    ] = await Promise.all([
      import('../modules/pm/project.model.js'),
      import('../modules/pm/projectStatusHistory.model.js'),
      import('../modules/pm/status.service.js'),
    ]);

    // Find all COMPLETED, non-deleted projects
    const completedProjects = await Project.find({
      status: 'COMPLETED',
      isDeleted: false,
    })
      .select('_id')
      .lean();

    if (completedProjects.length === 0) {
      logger.info('Project archive job: no COMPLETED projects found', {
        module: 'jobs',
        action: 'project-archive',
        retentionDays,
        cutoff,
      });
      return { archived: 0, skipped: 0, errors: 0 };
    }

    const projectIds = completedProjects.map((p) => p._id);

    // For each project, find the latest COMPLETED status-history entry.
    // We aggregate to get one record per project (the most recent toStatus=COMPLETED).
    const completionRecords = await ProjectStatusHistory.aggregate([
      {
        $match: {
          projectId: { $in: projectIds },
          toStatus: 'COMPLETED',
        },
      },
      { $sort: { changedAt: -1 } },
      {
        $group: {
          _id: '$projectId',
          completedAt: { $first: '$changedAt' },
        },
      },
    ]);

    // Build a lookup map: projectId (string) -> completedAt
    const completionMap = new Map(
      completionRecords.map((r) => [String(r._id), r.completedAt]),
    );

    let archived = 0;
    let skipped = 0;
    let errors = 0;

    for (const project of completedProjects) {
      const projectId = String(project._id);
      const completedAt = completionMap.get(projectId);

      // If no history record exists, fall back to treating the project as
      // eligible (conservative: archive it).  This handles edge cases where
      // history was not recorded.
      const effectiveCompletionDate = completedAt ?? new Date(0);

      if (effectiveCompletionDate > cutoff) {
        // Completed recently — within retention window, skip
        skipped++;
        continue;
      }

      try {
        await statusService.transitionStatus(
          project._id,
          'ARCHIVED',
          {
            override: true,
            overrideReason: 'Auto-archived after retention period',
          },
          SYSTEM_USER_ID,
        );
        archived++;
      } catch (err) {
        errors++;
        logger.warn('Project archive job: failed to archive project', {
          module: 'jobs',
          action: 'project-archive',
          projectId,
          error: { message: err.message },
        });
      }
    }

    logger.info('Project archive job completed', {
      module: 'jobs',
      action: 'project-archive',
      retentionDays,
      cutoff,
      archived,
      skipped,
      errors,
    });

    return { archived, skipped, errors };
  }
}

export default ProjectArchiveWorker;
