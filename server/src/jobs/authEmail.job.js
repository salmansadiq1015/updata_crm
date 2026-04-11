import { BaseWorker } from '../shared/queue/BaseWorker.js';
import sendMail, {
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendActivationEmail,
  sendPasswordChangedEmail,
} from '../shared/mail/mail.js';
import logger from '../shared/logger/index.js';

/**
 * Auth email worker.
 *
 * Processes all authentication-related email jobs:
 * - send-activation-email: New user account activation
 * - send-reset-email: Password reset link
 * - send-welcome-email: Welcome with temp credentials
 * - send-password-changed-email: Password change notification
 */
export class AuthEmailWorker extends BaseWorker {
  constructor() {
    super('auth-email');
  }

  async process(job) {
    const { name: jobType, data } = job;

    switch (jobType) {
      case 'send-activation-email':
        await sendActivationEmail(data.email, data.name, data.activationUrl);
        break;

      case 'send-reset-email':
        await sendPasswordResetEmail(data.email, data.name, data.resetUrl);
        break;

      case 'send-welcome-email':
        await sendWelcomeEmail(data.email, data.name, data.tempPassword);
        break;

      case 'send-password-changed-email':
        await sendPasswordChangedEmail(data.email, data.name);
        break;

      default:
        logger.warn('Unknown auth email job type', {
          module: 'jobs',
          action: 'auth-email',
          jobType,
        });
        return { skipped: true, reason: 'unknown_job_type' };
    }

    logger.info('Auth email sent', {
      module: 'jobs',
      action: 'auth-email',
      jobType,
      email: data.email,
    });

    return { sent: true, jobType, email: data.email };
  }
}

export default AuthEmailWorker;
