import { BaseWorker } from '../shared/queue/BaseWorker.js';
import leadSlaService from '../modules/crm/leadSla.service.js';
import logger from '../shared/logger/index.js';

/**
 * Lead workflow sweep (every 2 min): first-response SLA breaches + escalation,
 * overdue follow-ups + escalation. Idempotent and retry-safe — every state
 * change is compare-and-set and every alert carries an idempotency key.
 */
export class LeadSlaSweepWorker extends BaseWorker {
  constructor() { super('lead-sla-sweep'); }
  async process() { return leadSlaService.sweep(); }
}

export function registerLeadSlaSweepJob(queueManager) {
  const worker = new LeadSlaSweepWorker();
  queueManager.registerQueue('lead-sla-sweep', worker.getHandler(), {
    concurrency: 1,
    jobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 10000 }, removeOnComplete: { age: 86400, count: 500 } },
  });
  queueManager.addScheduledJob('lead-sla-sweep', 'periodic-lead-sla-sweep', {}, '*/2 * * * *')
    .catch((err) => logger.warn('Failed to schedule lead SLA sweep', { module: 'jobs', error: { message: err.message } }));
}

export default LeadSlaSweepWorker;
