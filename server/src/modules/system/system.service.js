import queueManager from '../../shared/queue/QueueManager.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

/**
 * System admin service.
 * Provides operational visibility into queues, cache, and config.
 * Admin-only access enforced at route level.
 */
class SystemService {
  /**
   * Non-sensitive runtime configuration.
   */
  getConfig() {
    return {
      env: config.env,
      server: config.server,
      rateLimit: config.rateLimit,
      storage: {
        backend: config.storage.backend,
        maxFileSize: config.storage.maxFileSize,
      },
      logging: { level: config.logging.level },
      // Secrets are never exposed
    };
  }

  /**
   * Get all queue stats.
   */
  async getJobQueues() {
    return queueManager.getAllStats();
  }

  /**
   * Get a specific job by ID from any queue.
   */
  async getJob(queueName, jobId) {
    const queue = queueManager.queues.get(queueName);
    if (!queue) return null;
    return queue.getJob(jobId);
  }

  /**
   * Cancel/remove a job.
   */
  async removeJob(queueName, jobId) {
    const queue = queueManager.queues.get(queueName);
    if (!queue) return null;
    const job = await queue.getJob(jobId);
    if (!job) return null;
    await job.remove();
    logger.info('Job removed by admin', {
      module: 'system',
      action: 'job.remove',
      queue: queueName,
      jobId,
    });
    return { removed: true };
  }

  /**
   * Get failed jobs (dead-letter queue equivalent).
   */
  async getFailedJobs(queueName, start = 0, end = 25) {
    if (queueName) {
      const jobs = await queueManager.getFailedJobs(queueName, start, end);
      return jobs.map(this._formatJob);
    }

    // All queues
    const allFailed = [];
    for (const name of queueManager.queues.keys()) {
      const jobs = await queueManager.getFailedJobs(name, start, end);
      allFailed.push(...jobs.map((j) => ({ ...this._formatJob(j), queue: name })));
    }
    return allFailed;
  }

  /**
   * Retry a failed job.
   */
  async retryJob(queueName, jobId) {
    await queueManager.retryJob(queueName, jobId);
    logger.info('Failed job retried by admin', {
      module: 'system',
      action: 'job.retry',
      queue: queueName,
      jobId,
    });
    return { retried: true };
  }

  /**
   * Invalidate cache by pattern.
   */
  async invalidateCache(pattern) {
    const deleted = await cacheManager.invalidatePattern(pattern);
    logger.info('Cache invalidated by admin', {
      module: 'system',
      action: 'cache.invalidate',
      pattern,
      keysDeleted: deleted,
    });
    return { pattern, keysDeleted: deleted };
  }

  /**
   * Get cache stats.
   */
  getCacheStats() {
    return cacheManager.getMetrics();
  }

  _formatJob(job) {
    if (!job) return null;
    return {
      id: job.id,
      name: job.name,
      data: job.data,
      status: job.failedReason ? 'failed' : 'completed',
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      timestamp: job.timestamp,
    };
  }
}

const systemService = new SystemService();
export default systemService;
