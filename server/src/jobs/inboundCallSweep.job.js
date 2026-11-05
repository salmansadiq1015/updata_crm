import { BaseWorker } from '../shared/queue/BaseWorker.js';
import inboundCallService from '../modules/inboundCalling/inboundCall.service.js';
import logger from '../shared/logger/index.js';

/**
 * Every minute: moves incoming calls whose end report never arrived (gateway crash, laptop
 * asleep, network loss) to an honest terminal state and runs their post-call processing.
 * It never answers, redials or fabricates an outcome; collected caller data is kept.
 */
export class InboundCallSweepWorker extends BaseWorker {
  constructor() { super('inbound-call-sweep'); }
  async process() { return inboundCallService.sweep(); }
}

export function registerInboundCallSweepJob(queueManager) {
  const worker = new InboundCallSweepWorker();
  queueManager.registerQueue('inbound-call-sweep', worker.getHandler(), {
    concurrency: 1,
    jobOptions: { attempts: 2, backoff: { type: 'exponential', delay: 5000 } },
  });
  queueManager.addScheduledJob('inbound-call-sweep', 'periodic-inbound-call-sweep', {}, '* * * * *')
    .catch((err) => logger.warn('Failed to schedule the incoming call sweep', { module: 'jobs', error: { message: err.message } }));
}

export default InboundCallSweepWorker;
