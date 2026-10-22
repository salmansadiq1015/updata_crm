import { BaseWorker } from '../shared/queue/BaseWorker.js';
import linkAssistantService from '../modules/linkAssistant/linkAssistant.service.js';
import logger from '../shared/logger/index.js';

/**
 * SMS link assistant sweep: expires links, processes abandoned conversations
 * (partial answers → human review), purges transcripts past their retention and
 * queues the optional human-call fallback. Every step is idempotent.
 */
export class LinkAssistantSweepWorker extends BaseWorker {
  constructor() { super('link-assistant-sweep'); }
  async process() { return linkAssistantService.sweep(); }
}

export function registerLinkAssistantSweepJob(queueManager) {
  const worker = new LinkAssistantSweepWorker();
  queueManager.registerQueue('link-assistant-sweep', worker.getHandler(), {
    concurrency: 1,
    jobOptions: { attempts: 2, backoff: { type: 'exponential', delay: 10000 } },
  });
  queueManager.addScheduledJob('link-assistant-sweep', 'periodic-link-assistant-sweep', {}, '*/10 * * * *')
    .catch((err) => logger.warn('Failed to schedule link assistant sweep', { module: 'jobs', error: { message: err.message } }));
}

export default LinkAssistantSweepWorker;
