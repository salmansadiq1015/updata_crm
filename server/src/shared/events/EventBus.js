import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import logger from '../logger/index.js';

/**
 * In-process domain event bus.
 *
 * Design decision: EventEmitter (in-process) vs RabbitMQ/Redis Streams.
 *
 * We use in-process EventEmitter because:
 * 1. Modular monolith — all modules run in one process. No need for network-based messaging.
 * 2. At-least-once delivery is handled by BullMQ for jobs that need durability.
 * 3. EventBus is for fire-and-forget notifications (cache invalidation, logging).
 * 4. When we extract to microservices later, we swap EventBus implementation
 *    to RabbitMQ/Redis Streams — the interface stays the same.
 *
 * All events follow the envelope schema from the design doc.
 */
class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50); // We'll have many module subscribers
    this._metrics = { published: 0, consumed: 0, errors: 0 };
  }

  /**
   * Publish a domain event.
   * Wraps payload in standard envelope and emits.
   *
   * @param {string} type - Event type (e.g., 'customer.created')
   * @param {object} payload - Event data
   * @param {object} options - { source, correlationId }
   */
  publish(type, payload = {}, options = {}) {
    const envelope = {
      id: uuidv4(),
      type,
      source: options.source || 'core',
      correlationId: options.correlationId || uuidv4(),
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      payload,
    };

    this._metrics.published++;

    logger.debug('Event published', {
      module: 'eventBus',
      action: 'publish',
      eventType: type,
      eventId: envelope.id,
      correlationId: envelope.correlationId,
    });

    // Emit both the specific type and a wildcard '*' for global listeners
    this.emit(type, envelope);
    this.emit('*', envelope);
  }

  /**
   * Subscribe to a domain event type.
   * Handler receives the full envelope.
   *
   * @param {string} type - Event type or '*' for all events
   * @param {Function} handler - async (envelope) => void
   */
  subscribe(type, handler) {
    const wrappedHandler = async (envelope) => {
      try {
        await handler(envelope);
        this._metrics.consumed++;
      } catch (err) {
        this._metrics.errors++;
        logger.error('Event handler failed', {
          module: 'eventBus',
          action: 'consume',
          eventType: envelope.type,
          eventId: envelope.id,
          error: { message: err.message, stack: err.stack },
        });

        // Persist failed event to Dead-Letter Queue
        try {
          const dlqService = (await import('./dlq.service.js')).default;
          await dlqService.persistFailedEvent(envelope.type, envelope, err);
        } catch (dlqErr) {
          logger.error('Failed to persist to DLQ', { error: dlqErr.message });
        }
      }
    };

    this.on(type, wrappedHandler);

    logger.debug('Event subscription registered', {
      module: 'eventBus',
      action: 'subscribe',
      eventType: type,
    });

    // Return unsubscribe function
    return () => this.off(type, wrappedHandler);
  }

  getMetrics() {
    return { ...this._metrics };
  }
}

// Singleton
const eventBus = new EventBus();
export default eventBus;
