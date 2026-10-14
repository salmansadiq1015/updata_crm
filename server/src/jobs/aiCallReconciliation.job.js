import { BaseWorker } from '../shared/queue/BaseWorker.js';
import aiCallingService from '../modules/aiCalling/aiCalling.service.js';
import logger from '../shared/logger/index.js';

/**
 * Periodic sweep that recovers AI calls stuck in a non-terminal state — a
 * crashed worker, a lost telephony webhook, or an ambiguous dispatch. It only
 * advances stuck calls toward a reconciled terminal state and never re-dials;
 * processCallResults' idempotency guard makes a late webhook arriving afterward
 * harmless.
 */
export class AiCallReconciliationWorker extends BaseWorker {
  constructor() { super('ai-call-reconciliation'); }
  async process() { return aiCallingService.reconcileStuckCalls(); }
}

export function registerAiCallReconciliationJob(queueManager) {
  const worker = new AiCallReconciliationWorker();
  queueManager.registerQueue('ai-call-reconciliation', worker.getHandler(), {
    concurrency: 1,
    jobOptions: { attempts: 2, backoff: { type: 'exponential', delay: 10000 } },
  });
  queueManager.addScheduledJob('ai-call-reconciliation', 'periodic-ai-call-reconciliation', {}, '*/2 * * * *')
    .catch((err) => logger.warn('Failed to schedule AI call reconciliation sweep', { module: 'jobs', error: { message: err.message } }));
}

export default AiCallReconciliationWorker;
