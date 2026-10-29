import { BaseWorker } from '../shared/queue/BaseWorker.js';
import leadScoringService, { LEAD_SCORING_QUEUE } from '../modules/crm/leadScoring.service.js';
import leadDuplicateService, { LEAD_DUPLICATES_QUEUE } from '../modules/crm/leadDuplicate.service.js';
import leadMergeService from '../modules/crm/leadMerge.service.js';
import logger from '../shared/logger/index.js';

/**
 * Lead quality background work.
 *
 * lead-scoring
 *   score-lead     debounced per-lead rescore after a communication / call /
 *                  qualification change (jobId lead-score-<id>)
 *   recompute-all  re-stamp every lead after a scoring-config change
 *   sweep          every 15 min: unscored / stale / outdated-version leads
 *
 * lead-duplicates
 *   detect-leads   candidate detection for new / imported / merged leads
 *   scan-all       full scan (nightly + "scan now")
 *   merge-recovery every 5 min: finish merges whose process died mid-way
 */
export class LeadScoringWorker extends BaseWorker {
  constructor() { super(LEAD_SCORING_QUEUE); }

  async process(job) {
    if (job.name === 'score-lead') {
      try {
        const result = await leadScoringService.recalculate(job.data.leadId, { reason: job.data.reason || 'signal' });
        return { score: result.score, band: result.band };
      } catch (err) {
        if (err?.statusCode === 404) return { skipped: 'lead_not_found' };
        throw err;
      }
    }
    if (job.name === 'recompute-all') return leadScoringService.recomputeAll({ version: job.data?.version ?? null });
    if (job.name === 'sweep') return leadScoringService.sweep();
    logger.warn('Unknown lead-scoring job', { module: 'jobs', jobName: job.name });
    return { skipped: true };
  }
}

export class LeadDuplicatesWorker extends BaseWorker {
  constructor() { super(LEAD_DUPLICATES_QUEUE); }

  async process(job) {
    if (job.name === 'detect-leads') return leadDuplicateService.detectForLeads(job.data?.leadIds || []);
    if (job.name === 'scan-all') return leadDuplicateService.scanAll();
    if (job.name === 'merge-recovery') return leadMergeService.recoverStale();
    logger.warn('Unknown lead-duplicates job', { module: 'jobs', jobName: job.name });
    return { skipped: true };
  }
}

export function registerLeadQualityJobs(queueManager) {
  const scoring = new LeadScoringWorker();
  queueManager.registerQueue(LEAD_SCORING_QUEUE, scoring.getHandler(), {
    concurrency: 2,
    jobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 10000 }, removeOnComplete: { age: 3600, count: 1000 } },
  });
  const duplicates = new LeadDuplicatesWorker();
  queueManager.registerQueue(LEAD_DUPLICATES_QUEUE, duplicates.getHandler(), {
    concurrency: 1,
    jobOptions: { attempts: 2, backoff: { type: 'exponential', delay: 15000 }, removeOnComplete: { age: 3600, count: 1000 } },
  });
  const schedule = (queue, name, cron) => queueManager.addScheduledJob(queue, name, {}, cron)
    .catch((err) => logger.warn(`Failed to schedule ${name}`, { module: 'jobs', error: { message: err.message } }));
  schedule(LEAD_SCORING_QUEUE, 'sweep', '*/15 * * * *');
  schedule(LEAD_DUPLICATES_QUEUE, 'scan-all', '30 2 * * *');
  schedule(LEAD_DUPLICATES_QUEUE, 'merge-recovery', '*/5 * * * *');
}

export default { registerLeadQualityJobs };
