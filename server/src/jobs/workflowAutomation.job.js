import { BaseWorker } from '../shared/queue/BaseWorker.js';
import runner from '../modules/workflowAutomation/workflow.runner.js';
import service from '../modules/workflowAutomation/workflow.service.js';
import { WORKFLOW_QUEUE } from '../modules/workflowAutomation/workflow.constants.js';
import logger from '../shared/logger/index.js';

/**
 * Workflow Automation queue.
 *   advance  — execute a run until it waits/ends (lease-guarded, so duplicate jobs are no-ops)
 *   enroll   — enroll a campaign's leads (idempotent per campaign + lead)
 *   sweep    — every minute: due timers/polls, expired leases, schedule triggers, campaign completion
 *   retention — daily 03:17: delete workflow events older than WORKFLOW_EVENT_RETENTION_DAYS (default 365)
 * All state lives in MongoDB; Redis only carries wake-ups, so a lost job is recovered by the sweep.
 */
export class WorkflowAutomationWorker extends BaseWorker {
  constructor() { super(WORKFLOW_QUEUE); }
  async process(job) {
    if (job.name === 'advance') return runner.advance(job.data.runId);
    if (job.name === 'enroll') return service.enrollCampaign(job.data.campaignId);
    if (job.name === 'sweep' || job.name === 'periodic-workflow-sweep') return runner.sweep();
    if (job.name === 'periodic-workflow-retention') return runner.purgeOldEvents();
    return { ignored: job.name };
  }
}

export function registerWorkflowAutomationJob(queueManager) {
  const worker = new WorkflowAutomationWorker();
  queueManager.registerQueue(WORKFLOW_QUEUE, worker.getHandler(), {
    concurrency: Number(process.env.WORKFLOW_QUEUE_CONCURRENCY || 5),
    jobOptions: { attempts: 1, removeOnComplete: { age: 3600, count: 2000 }, removeOnFail: { age: 86400 } },
  });
  queueManager.addScheduledJob(WORKFLOW_QUEUE, 'periodic-workflow-sweep', {}, '* * * * *')
    .catch((err) => logger.warn('Failed to schedule workflow sweep', { module: 'jobs', error: { message: err.message } }));
  queueManager.addScheduledJob(WORKFLOW_QUEUE, 'periodic-workflow-retention', {}, '17 3 * * *')
    .catch((err) => logger.warn('Failed to schedule workflow event retention', { module: 'jobs', error: { message: err.message } }));
}

export default WorkflowAutomationWorker;
