import { BaseWorker } from '../shared/queue/BaseWorker.js';
import callIntelligenceService, { CALL_INTELLIGENCE_QUEUE } from '../modules/aiCalling/callIntelligence.service.js';
import logger from '../shared/logger/index.js';

/**
 * Post-call evidence extraction for AI calls ('extract', queued ~20 s after a call
 * is processed so late transcript turns are in), plus a periodic sweep for calls
 * the queue never reached. extractForCall is idempotent and lease-guarded.
 */
export class CallIntelligenceWorker extends BaseWorker {
  constructor() { super(CALL_INTELLIGENCE_QUEUE); }
  async process(job) {
    if (job.name === 'sweep') return callIntelligenceService.sweep();
    return callIntelligenceService.extractForCall(job.data.callId);
  }
}

export function registerCallIntelligenceJob(queueManager) {
  const worker = new CallIntelligenceWorker();
  queueManager.registerQueue(CALL_INTELLIGENCE_QUEUE, worker.getHandler(), {
    concurrency: 2,
    jobOptions: { attempts: 2, backoff: { type: 'exponential', delay: 30_000 }, removeOnComplete: true },
  });
  queueManager.addScheduledJob(CALL_INTELLIGENCE_QUEUE, 'sweep', {}, '*/10 * * * *')
    .catch((err) => logger.warn('Failed to schedule the call intelligence sweep', { module: 'jobs', error: { message: err.message } }));
}

export default CallIntelligenceWorker;
