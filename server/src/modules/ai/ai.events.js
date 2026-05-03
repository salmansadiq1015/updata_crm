import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import logger from '../../shared/logger/index.js';

export function registerAiEvents() {
  // When an order is created from voice → update session result
  eventBus.subscribe(EVENT_TYPES.AI_ORDER_CREATE_REQUESTED, async (data) => {
    try {
      const payload = data.payload || data;
      logger.info('AI order creation requested', {
        module: 'ai',
        action: 'event.order_create_requested',
        sessionId: payload.sessionId,
        intentName: payload.intentName,
      });
      // The actual order creation would be handled by the orders module
      // consuming this event. The AI module just publishes the intent.
    } catch (err) {
      logger.error('Failed to handle AI order create request', {
        module: 'ai',
        action: 'event.order_create_requested',
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  // When transcription completes → log for analytics
  eventBus.subscribe(EVENT_TYPES.AI_SESSION_TRANSCRIBED, async (data) => {
    try {
      const payload = data.payload || data;
      logger.info('AI session transcribed', {
        module: 'ai',
        action: 'event.session_transcribed',
        sessionId: payload.sessionId,
        confidence: payload.confidence,
        provider: payload.provider,
      });
    } catch (err) {
      logger.error('Failed to handle transcription event', {
        module: 'ai', action: 'event.session_transcribed', error: { message: err.message },
      });
    }
  });

  // When session is corrected → track for accuracy improvement
  eventBus.subscribe(EVENT_TYPES.AI_SESSION_CORRECTED, async (data) => {
    try {
      const payload = data.payload || data;
      logger.info('AI session corrections submitted', {
        module: 'ai',
        action: 'event.session_corrected',
        sessionId: payload.sessionId,
        correctionCount: payload.correctionCount || 0,
      });
      // Corrections are tracked in the entities. Monthly aggregation job
      // will compute accuracy metrics from the correction data.
    } catch (err) {
      logger.error('Failed to handle correction event', {
        module: 'ai', action: 'event.session_corrected', error: { message: err.message },
      });
    }
  });

  // When vocabulary is updated → invalidate STT pipeline cache
  eventBus.subscribe(EVENT_TYPES.AI_VOCABULARY_UPDATED, async (data) => {
    try {
      const payload = data.payload || data;
      const cacheManager = (await import('../../shared/cache/CacheManager.js')).default;
      if (payload.language) {
        await cacheManager.del(`ai:vocab:active:${payload.language}`);
      }
      logger.info('Vocabulary updated — cache invalidated', {
        module: 'ai',
        action: 'event.vocabulary_updated',
        term: payload.term,
        language: payload.language,
      });
    } catch (err) {
      logger.error('Failed to handle vocabulary update event', {
        module: 'ai', action: 'event.vocabulary_updated', error: { message: err.message },
      });
    }
  });

  // Agent lifecycle → WebSocket
  eventBus.subscribe(EVENT_TYPES.AI_AGENT_RUN_STARTED, (data) => {
    const { agentRunId, userId, workflowType } = data.payload || data;
    if (global.io) {
      global.io.to(`user:${userId}`).emit('ai:agent:started', { agentRunId, workflowType });
    }
  });

  eventBus.subscribe(EVENT_TYPES.AI_AGENT_AWAITING_CONFIRMATION, (data) => {
    const { agentRunId, userId, summary } = data.payload || data;
    if (global.io) {
      global.io.to(`user:${userId}`).emit('ai:agent:awaiting_confirmation', { agentRunId, summary });
    }
  });

  eventBus.subscribe(EVENT_TYPES.AI_AGENT_RUN_CANCELLED, (data) => {
    const { agentRunId, userId } = data.payload || data;
    if (global.io) {
      global.io.to(`user:${userId}`).emit('ai:agent:cancelled', { agentRunId });
    }
  });

  logger.info('AI event handlers registered', {
    module: 'ai',
    action: 'events.register',
    subscribedEvents: [
      'AI_ORDER_CREATE_REQUESTED', 'AI_SESSION_TRANSCRIBED',
      'AI_SESSION_CORRECTED', 'AI_VOCABULARY_UPDATED',
      'AI_AGENT_RUN_STARTED', 'AI_AGENT_AWAITING_CONFIRMATION', 'AI_AGENT_RUN_CANCELLED',
    ],
  });
}
