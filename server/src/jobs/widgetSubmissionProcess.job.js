import { BaseWorker } from '../shared/queue/BaseWorker.js';
import logger from '../shared/logger/index.js';

export class WidgetSubmissionProcessWorker extends BaseWorker {
  constructor() {
    super('widget-submission-process');
  }

  async process(job) {
    const { submissionId } = job.data;
    const widgetSubmissionService = (await import('../modules/integrations/widgetSubmission.service.js')).default;

    try {
      const submission = await widgetSubmissionService.getById(submissionId);
      if (!submission || submission.processingStatus !== 'pending') {
        return { skipped: true, reason: 'Not pending or not found' };
      }

      // CRM contact creation/matching would happen here
      // For now, log and mark as pending for manual processing
      logger.info('Widget submission queued for CRM processing', {
        module: 'jobs',
        action: 'widget-submission-process',
        submissionId,
        contactEmail: submission.contactEmail,
        requestType: submission.requestType,
      });

      return { submissionId, status: 'queued_for_crm' };
    } catch (err) {
      logger.error('Widget submission processing failed', {
        module: 'jobs',
        action: 'widget-submission-process',
        submissionId,
        error: { message: err.message },
      });
      throw err;
    }
  }
}

export default WidgetSubmissionProcessWorker;
