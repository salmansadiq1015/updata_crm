import { Queue, Worker } from 'bullmq';
import { queueConnection, defaultJobOptions, queueConfig } from '../../config/queue.js';
import logger from '../logger/index.js';
import eventBus from '../events/EventBus.js';
import EVENT_TYPES from '../events/eventTypes.js';

/**
 * BullMQ queue manager.
 *
 * Provides a registry of named queues and workers.
 * Modules register their job handlers; the manager creates queues/workers.
 *
 * Why BullMQ over raw Redis pub/sub:
 * - Durable: jobs survive Redis restarts (AOF persistence).
 * - Retry: built-in exponential backoff with configurable attempts.
 * - Visibility: job status, progress, failed job inspection.
 * - Concurrency: per-queue worker concurrency control.
 * - Scheduling: cron + delayed jobs out of the box.
 */
class QueueManager {
  constructor() {
    this.queues = new Map();
    this.workers = new Map();
    this.queueEvents = new Map();
  }

  /**
   * Register a queue and its worker.
   *
   * @param {string} name - Queue name (e.g., 'file-processing')
   * @param {Function} processor - async (job) => result
   * @param {object} options - { concurrency, jobOptions }
   */
  registerQueue(name, processor, options = {}) {
    const queue = new Queue(name, {
      connection: queueConnection,
      prefix: queueConfig.prefix,
      defaultJobOptions: {
        ...defaultJobOptions,
        ...options.jobOptions,
      },
    });

    const worker = new Worker(name, processor, {
      connection: queueConnection,
      prefix: queueConfig.prefix,
      concurrency: options.concurrency || 3,
    });

    // Worker event handlers
    worker.on('completed', (job) => {
      logger.info('Job completed', {
        module: 'queue',
        action: 'job.completed',
        queue: name,
        jobId: job.id,
        jobName: job.name,
        duration: job.finishedOn - job.processedOn,
      });
    });

    worker.on('failed', (job, err) => {
      logger.error('Job failed', {
        module: 'queue',
        action: 'job.failed',
        queue: name,
        jobId: job?.id,
        jobName: job?.name,
        attempts: job?.attemptsMade,
        maxAttempts: job?.opts?.attempts,
        error: { message: err.message, stack: err.stack },
      });

      // Publish event if all retries exhausted
      if (job && job.attemptsMade >= (job.opts?.attempts || 3)) {
        eventBus.publish(EVENT_TYPES.JOB_FAILED, {
          jobId: job.id,
          queue: name,
          type: job.name,
          error: err.message,
          attempts: job.attemptsMade,
        });
      }
    });

    worker.on('error', (err) => {
      logger.error('Worker error', {
        module: 'queue',
        action: 'worker.error',
        queue: name,
        error: { message: err.message },
      });
    });

    this.queues.set(name, queue);
    this.workers.set(name, worker);

    logger.info('Queue registered', {
      module: 'queue',
      action: 'register',
      queue: name,
      concurrency: options.concurrency || 3,
    });

    return queue;
  }

  /**
   * Add a job to a registered queue.
   */
  async addJob(queueName, jobName, data, options = {}) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not registered`);
    }

    const job = await queue.add(jobName, data, options);

    logger.debug('Job enqueued', {
      module: 'queue',
      action: 'enqueue',
      queue: queueName,
      jobId: job.id,
      jobName,
    });

    return job;
  }

  /**
   * Add a bounded batch of jobs in one Redis operation. Callers remain
   * responsible for durable database state and idempotent worker claims.
   */
  async addJobs(queueName, jobs = []) {
    const queue = this.queues.get(queueName);
    if (!queue) throw new Error(`Queue '${queueName}' not registered`);
    if (!jobs.length) return [];

    const queued = await queue.addBulk(jobs.map((job) => ({
      name: job.name,
      data: job.data,
      opts: job.options || {},
    })));

    logger.debug('Jobs enqueued in bulk', {
      module: 'queue', action: 'enqueue.bulk', queue: queueName, count: queued.length,
    });
    return queued;
  }

  /**
   * Add a repeatable/scheduled job.
   */
  async addScheduledJob(queueName, jobName, data, cron, options = {}) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not registered`);
    }

    return queue.add(jobName, data, {
      ...options,
      repeat: { pattern: cron },
    });
  }

  /**
   * Get queue stats for monitoring.
   */
  async getQueueStats(queueName) {
    const queue = this.queues.get(queueName);
    if (!queue) return null;

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return { name: queueName, waiting, active, completed, failed, delayed };
  }

  /**
   * Get stats for all registered queues.
   */
  async getAllStats() {
    const stats = [];
    for (const name of this.queues.keys()) {
      stats.push(await this.getQueueStats(name));
    }
    return stats;
  }

  /**
   * Get failed jobs from a queue.
   */
  async getFailedJobs(queueName, start = 0, end = 25) {
    const queue = this.queues.get(queueName);
    if (!queue) return [];
    return queue.getFailed(start, end);
  }

  /**
   * Retry a failed job.
   */
  async retryJob(queueName, jobId) {
    const queue = this.queues.get(queueName);
    if (!queue) throw new Error(`Queue '${queueName}' not registered`);

    const job = await queue.getJob(jobId);
    if (!job) throw new Error(`Job '${jobId}' not found in queue '${queueName}'`);

    await job.retry();
    return job;
  }

  /**
   * Graceful shutdown — close all workers and queues.
   */
  async shutdown() {
    logger.info('Shutting down queue manager...', { module: 'queue', action: 'shutdown' });

    for (const [name, worker] of this.workers) {
      await worker.close();
      logger.info(`Worker ${name} closed`, { module: 'queue' });
    }

    for (const [name, queue] of this.queues) {
      await queue.close();
      logger.info(`Queue ${name} closed`, { module: 'queue' });
    }

    this.workers.clear();
    this.queues.clear();
  }
}

// Singleton
const queueManager = new QueueManager();
export default queueManager;
