import DlqEntry from './dlq.model.js';
import logger from '../../shared/logger/index.js';

/**
 * Dead-Letter Queue service.
 *
 * Persists failed EventBus events to MongoDB for inspection, retry, and resolution.
 */
const dlqService = {
  /**
   * Persist a failed event to the DLQ collection.
   *
   * @param {string} eventType - The event type that failed
   * @param {object} envelope - The full event envelope
   * @param {Error} error - The error thrown by the handler
   * @returns {Promise<object>} The created DLQ entry
   */
  async persistFailedEvent(eventType, envelope, error) {
    const entry = await DlqEntry.create({
      eventType,
      envelope,
      error: error.message,
      stack: error.stack,
    });

    logger.warn('Event persisted to DLQ', {
      module: 'dlq',
      action: 'persist',
      eventType,
      eventId: envelope?.id,
      dlqEntryId: entry._id,
    });

    return entry;
  },

  /**
   * List pending and failed DLQ entries, sorted oldest first.
   *
   * @param {number} limit - Max entries to return (default 50)
   * @returns {Promise<object[]>}
   */
  async listPending(limit = 50) {
    return DlqEntry.find({ status: { $in: ['pending', 'failed'] } })
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean();
  },

  /**
   * Retry a DLQ entry by re-publishing its envelope through the EventBus.
   * Increments retryCount and updates lastRetryAt.
   * If retryCount >= maxRetries, marks the entry as 'failed'.
   *
   * @param {string} dlqEntryId - The DLQ entry _id
   * @returns {Promise<object>} The updated DLQ entry
   */
  async retry(dlqEntryId) {
    const entry = await DlqEntry.findById(dlqEntryId);
    if (!entry) {
      throw new Error(`DLQ entry not found: ${dlqEntryId}`);
    }

    entry.retryCount += 1;
    entry.lastRetryAt = new Date();

    if (entry.retryCount >= entry.maxRetries) {
      entry.status = 'failed';
      await entry.save();

      logger.warn('DLQ entry exceeded max retries', {
        module: 'dlq',
        action: 'retry_exhausted',
        dlqEntryId: entry._id,
        eventType: entry.eventType,
        retryCount: entry.retryCount,
      });

      return entry;
    }

    entry.status = 'retrying';
    await entry.save();

    try {
      // Lazy import to avoid circular dependency
      const eventBus = (await import('./EventBus.js')).default;
      const { type, payload, ...options } = entry.envelope;
      eventBus.publish(type, payload, {
        source: options.source,
        correlationId: options.correlationId,
      });

      logger.info('DLQ entry retried successfully', {
        module: 'dlq',
        action: 'retry',
        dlqEntryId: entry._id,
        eventType: entry.eventType,
        retryCount: entry.retryCount,
      });
    } catch (retryErr) {
      entry.status = 'pending';
      await entry.save();

      logger.error('DLQ retry failed', {
        module: 'dlq',
        action: 'retry_error',
        dlqEntryId: entry._id,
        error: retryErr.message,
      });
    }

    return entry;
  },

  /**
   * Mark a DLQ entry as resolved.
   *
   * @param {string} dlqEntryId - The DLQ entry _id
   * @returns {Promise<object>} The updated DLQ entry
   */
  async resolve(dlqEntryId) {
    const entry = await DlqEntry.findByIdAndUpdate(
      dlqEntryId,
      { status: 'resolved', resolvedAt: new Date() },
      { new: true },
    );

    if (!entry) {
      throw new Error(`DLQ entry not found: ${dlqEntryId}`);
    }

    logger.info('DLQ entry resolved', {
      module: 'dlq',
      action: 'resolve',
      dlqEntryId: entry._id,
      eventType: entry.eventType,
    });

    return entry;
  },

  /**
   * Purge resolved entries older than N days.
   *
   * @param {number} olderThanDays - Delete resolved entries older than this (default 30)
   * @returns {Promise<number>} Number of deleted entries
   */
  async purgeResolved(olderThanDays = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    const result = await DlqEntry.deleteMany({
      status: 'resolved',
      resolvedAt: { $lt: cutoff },
    });

    logger.info('DLQ purged resolved entries', {
      module: 'dlq',
      action: 'purge',
      olderThanDays,
      deletedCount: result.deletedCount,
    });

    return result.deletedCount;
  },
};

export default dlqService;
