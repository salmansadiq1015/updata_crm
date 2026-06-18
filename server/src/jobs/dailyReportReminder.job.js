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
    // Lazy imports to avoid circular dependencies
    const User = (await import('../modules/auth/user.model.js')).default;
    const Role = (await import('../modules/auth/role.model.js')).default;
    const Permission = (await import('../modules/auth/permission.model.js')).default;
    const workReportRepository = (await import('../modules/mobile/workReport.repository.js')).default;
    const { default: notificationService } = await import('../modules/mobile/notification.service.js');

    const mobilePermissionIds = await Permission.find({
      $or: [
        { module: 'mobile', action: 'read' },
        { module: 'mobile', action: 'write' },
      ],
    }).distinct('_id');
    const mobileRoleIds = await Role.find({ permissions: { $in: mobilePermissionIds } }).distinct('_id');

    // Find all active users with mobile access
    const mobileUsers = await User.find({
      status: 'active',
      role: { $in: mobileRoleIds },
    }).select('_id').lean();

    let remindersCount = 0;

    for (const user of mobileUsers) {
      try {
        const incompleteCount = await workReportRepository.countIncompleteByTechnician(user._id);

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
