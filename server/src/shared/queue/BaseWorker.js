import logger from '../logger/index.js';

/**
 * Base class for job processors.
 * Provides structured logging, idempotency check hook, and error handling.
 *
 * Usage:
 *   class FileCleanupWorker extends BaseWorker {
 *     async process(job) { ... }
 *   }
 */
export class BaseWorker {
  constructor(name) {
    this.name = name;
  }

  /**
   * Override in subclass — the actual job logic.
   */
  async process(_job) {
    throw new Error(`${this.name}: process() not implemented`);
  }

  /**
   * Override to check if the job was already done (idempotency).
   * Return true to skip processing.
   */
  async isAlreadyDone(_job) {
    return false;
  }

  /**
   * The handler registered with BullMQ.
   * Wraps process() with logging and idempotency check.
   */
  getHandler() {
    return async (job) => {
      const startTime = Date.now();

      logger.info(`Job started: ${this.name}`, {
        module: 'queue',
        action: 'job.start',
        worker: this.name,
        jobId: job.id,
        jobName: job.name,
        attempt: job.attemptsMade + 1,
      });

      // Idempotency check
      if (await this.isAlreadyDone(job)) {
        logger.info(`Job skipped (already done): ${this.name}`, {
          module: 'queue',
          action: 'job.skip',
          worker: this.name,
          jobId: job.id,
        });
        return { skipped: true };
      }

      const result = await this.process(job);

      logger.info(`Job finished: ${this.name}`, {
        module: 'queue',
        action: 'job.finish',
        worker: this.name,
        jobId: job.id,
        duration: Date.now() - startTime,
      });

      return result;
    };
  }
}

export default BaseWorker;
