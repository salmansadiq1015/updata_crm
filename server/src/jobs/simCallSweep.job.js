import { BaseWorker } from '../shared/queue/BaseWorker.js';
import simCallService from '../modules/simCall/simCall.service.js';
import logger from '../shared/logger/index.js';

/**
 * SIM call campaign sweep (every 5 min): expired task locks (a dialled attempt becomes
 * needs_review and is never redialled automatically), due-callback reminders, CRM sync
 * retries, campaign completion. Idempotent.
 */
export class SimCallSweepWorker extends BaseWorker {
  constructor() { super('sim-call-sweep'); }
  async process() { return simCallService.sweep(); }
}

export function registerSimCallSweepJob(queueManager) {
  const worker = new SimCallSweepWorker();
  queueManager.registerQueue('sim-call-sweep', worker.getHandler(), {
    concurrency: 1,
    jobOptions: { attempts: 2, backoff: { type: 'exponential', delay: 10000 } },
  });
  queueManager.addScheduledJob('sim-call-sweep', 'periodic-sim-call-sweep', {}, '*/5 * * * *')
    .catch((err) => logger.warn('Failed to schedule SIM call sweep', { module: 'jobs', error: { message: err.message } }));
}

export default SimCallSweepWorker;
