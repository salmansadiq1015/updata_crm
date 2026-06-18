import { BaseWorker } from '../shared/queue/BaseWorker.js';
import logger from '../shared/logger/index.js';

/**
 * Report escalation job.
 *
 * Identifies orders where the scheduled date has passed (before yesterday)
 * and no submitted work report exists. Sends an ESCALATION notification
 * to the assigned technician.
 *
 * Runs on a schedule (e.g., daily) to ensure overdue reports are flagged.
 */
export class ReportEscalationWorker extends BaseWorker {
  constructor() {
    super('report-escalation');
  }

  async process(job) {
    const now = new Date();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

    // Lazy imports to avoid circular dependencies
    const workReportRepository = (await import('../modules/mobile/workReport.repository.js')).default;
    const { default: notificationService } = await import('../modules/mobile/notification.service.js');

    // Find orders with scheduledDate before yesterday that have no submitted report
    // We look for work reports that are still in DRAFT or missing entirely
    let assignmentModel;
    try {
      assignmentModel = (await import('../modules/deploy/assignment.model.js')).default;
    } catch {
      logger.warn('Assignment model not available, skipping report escalation', {
        module: 'jobs',
        action: 'report-escalation',
      });
      return { escalationsCount: 0 };
    }

    // Find assignments scheduled before yesterday
    const overdueAssignments = await assignmentModel.find({
      startDatetime: { $lt: yesterday },
      status: { $ne: 'CANCELLED' },
      isDeleted: { $ne: true },
    }).select('_id employeeId title').lean();

    let escalationsCount = 0;

    for (const assignment of overdueAssignments) {
      try {
        // Check if a submitted report exists for this assignment/order
        const submittedReport = await workReportRepository.hasSubmittedForOrder(assignment._id);

        if (!submittedReport) {
          const employeeIds = assignment.employeeId ? [assignment.employeeId] : [];
          for (const employeeId of employeeIds) {
            await notificationService.sendNotification(employeeId, {
              notificationType: 'ESCALATION',
              title: 'Ueberfaelliger Bericht',
              body: `Der Bericht fuer "${assignment.title || 'Auftrag'}" ist ueberfaellig. Bitte umgehend einreichen.`,
              deepLink: `/orders/${assignment._id}`,
            });
          }
          escalationsCount += 1;
        }
      } catch (err) {
        logger.warn('Failed to process escalation for assignment', {
          module: 'jobs',
          action: 'report-escalation',
          assignmentId: assignment._id,
          error: err.message,
        });
      }
    }

    logger.info('Report escalation completed', {
      module: 'jobs',
      action: 'report-escalation',
      assignmentsChecked: overdueAssignments.length,
      escalationsCount,
    });

    return { escalationsCount };
  }
}

export default ReportEscalationWorker;
