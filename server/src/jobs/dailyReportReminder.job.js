import { BaseWorker } from '../shared/queue/BaseWorker.js';
import logger from '../shared/logger/index.js';

/**
 * Daily report reminder job.
 *
 * Scans all active mobile users and checks for incomplete work reports.
 * Sends a reminder notification to each user with outstanding reports.
 *
 * Runs on a schedule (e.g., daily at 08:00) to prompt technicians.
 */
export class DailyReportReminderWorker extends BaseWorker {
  constructor() {
    super('daily-report-reminder');
  }

  async process(job) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Lazy imports to avoid circular dependencies
    const User = (await import('../modules/auth/user.model.js')).default;
    const WorkReport = (await import('../modules/mobile/workReport.repository.js')).default;
    const { default: notificationService } = await import('../modules/mobile/notification.service.js');

    // Find all active users with mobile access
    const mobileUsers = await User.find({
      isActive: true,
      $or: [
        { 'role.permissions': { $in: ['mobile:read', 'mobile:write'] } },
        { 'roles': { $elemMatch: { permissions: { $in: ['mobile:read', 'mobile:write'] } } } },
      ],
    }).select('_id').lean();

    let remindersCount = 0;

    for (const user of mobileUsers) {
      try {
        // Count incomplete reports: DRAFT status or missing reports for scheduled orders
        const incompleteCount = await WorkReport.countDocuments({
          technicianId: user._id,
          isDeleted: false,
          $or: [
            { status: 'DRAFT' },
            { status: { $exists: false } },
          ],
        });

        if (incompleteCount > 0) {
          await notificationService.sendNotification(user._id, {
            notificationType: 'DAILY_REMINDER',
            title: 'Offene Berichte',
            body: `Sie haben ${incompleteCount} unvollstaendige Berichte. Bitte ausfuellen.`,
            deepLink: '/orders?filter=incomplete',
          });
          remindersCount += 1;
        }
      } catch (err) {
        logger.warn('Failed to send daily report reminder to user', {
          module: 'jobs',
          action: 'daily-report-reminder',
          userId: user._id,
          error: err.message,
        });
      }
    }

    logger.info('Daily report reminder completed', {
      module: 'jobs',
      action: 'daily-report-reminder',
      usersChecked: mobileUsers.length,
      remindersCount,
    });

    return { remindersCount };
  }
}

export default DailyReportReminderWorker;
