import { BaseWorker } from '../shared/queue/BaseWorker.js';
import benchmarkService, { BENCHMARK_QUEUE } from '../modules/aiCalling/benchmark.service.js';
import experimentService from '../modules/aiCalling/scriptExperiment.service.js';
import logger from '../shared/logger/index.js';

/** Runs one queued benchmark (text replay, optional extractor and STT). Never retried blindly. */
export class AiCallingBenchmarkWorker extends BaseWorker {
  constructor() { super(BENCHMARK_QUEUE); }
  async process(job) { return benchmarkService.processRun(job.data.runId); }
}

/** Every 5 min: experiment guardrails (auto-pause a breaching variant) and stale benchmark runs. */
export class AiCallingQualitySweepWorker extends BaseWorker {
  constructor() { super('ai-calling-quality-sweep'); }
  async process() {
    const guardrails = await experimentService.evaluateGuardrails();
    const staleRuns = await benchmarkService.failStaleRuns();
    return { ...guardrails, staleRuns };
  }
}

export function registerCallingQualityJobs(queueManager) {
  queueManager.registerQueue(BENCHMARK_QUEUE, new AiCallingBenchmarkWorker().getHandler(), {
    concurrency: 1,
    jobOptions: { attempts: 1, removeOnComplete: { age: 86400, count: 500 } },
  });
  queueManager.registerQueue('ai-calling-quality-sweep', new AiCallingQualitySweepWorker().getHandler(), {
    concurrency: 1,
    jobOptions: { attempts: 2, backoff: { type: 'exponential', delay: 10000 } },
  });
  queueManager.addScheduledJob('ai-calling-quality-sweep', 'periodic-ai-calling-quality-sweep', {}, '*/5 * * * *')
    .catch((err) => logger.warn('Failed to schedule AI calling quality sweep', { module: 'jobs', error: { message: err.message } }));
}

export default registerCallingQualityJobs;
