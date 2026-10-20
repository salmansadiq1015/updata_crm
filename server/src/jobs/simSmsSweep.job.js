import { BaseWorker } from '../shared/queue/BaseWorker.js';
import simSmsService from '../modules/simSms/simSms.service.js';
import logger from '../shared/logger/index.js';

/**
 * SIM SMS agent sweep (every 5 min): reply timeouts → reminder or expiry,
 * lease recovery (never re-sends an attempted message), crashed CRM syncs,
 * campaign completion. Idempotent.
 */
export class SimSmsSweepWorker extends BaseWorker {
  constructor() { super('sim-sms-sweep'); }
  async process() { return simSmsService.sweep(); }
}

export function registerSimSmsSweepJob(queueManager) {
  const worker = new SimSmsSweepWorker();
  queueManager.registerQueue('sim-sms-sweep', worker.getHandler(), {
    concurrency: 1,
    jobOptions: { attempts: 2, backoff: { type: 'exponential', delay: 10000 } },
  });
  queueManager.addScheduledJob('sim-sms-sweep', 'periodic-sim-sms-sweep', {}, '*/5 * * * *')
    .catch((err) => logger.warn('Failed to schedule SIM SMS sweep', { module: 'jobs', error: { message: err.message } }));
}

export default SimSmsSweepWorker;
