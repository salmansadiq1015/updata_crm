import { BaseWorker } from '../shared/queue/BaseWorker.js';
import followUpCalling from '../modules/aiCalling/followUpCalling.service.js';
import logger from '../shared/logger/index.js';

export const FOLLOW_UP_CALLING_QUEUE = 'ai-follow-up-calling';

/**
 * AI follow-up dispatcher (every minute): launches due AI follow-up calls and repairs
 * follow-ups whose call finished without a hook. All state is persisted on
 * LeadFollowUp.automation and every launch is claimed with a compare-and-set lease
 * plus an idempotent campaign launch key, so a restart or a duplicate run never
 * loses or doubles a call. attempts:1 — a missed run is simply picked up next minute.
 */
export class FollowUpCallingWorker extends BaseWorker {
  constructor() { super(FOLLOW_UP_CALLING_QUEUE); }
  async process() { return followUpCalling.sweep(); }
}

export function registerFollowUpCallingJob(queueManager) {
  const worker = new FollowUpCallingWorker();
  queueManager.registerQueue(FOLLOW_UP_CALLING_QUEUE, worker.getHandler(), {
    concurrency: 1,
    jobOptions: { attempts: 1, removeOnComplete: { age: 3600, count: 200 }, removeOnFail: { age: 86400, count: 500 } },
  });
  queueManager.addScheduledJob(FOLLOW_UP_CALLING_QUEUE, 'periodic-ai-follow-up-dispatch', {}, '* * * * *')
    .catch((err) => logger.warn('Failed to schedule AI follow-up dispatcher', { module: 'jobs', error: { message: err.message } }));
}

export default FollowUpCallingWorker;
