import voiceSessionRepository from './voiceSession.repository.js';
import voiceSessionEntityRepository from './voiceSessionEntity.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import queueManager from '../../shared/queue/QueueManager.js';
import { AppError, NotFoundError, ConflictError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

const SESSION_TTL = { l1Ttl: 30, l2Ttl: 120 };

class VoiceSessionService {
  /**
   * Create a new voice session.
   *
   * @param {object} data - Session data (sessionType, language, contextModule, etc.)
   * @param {string} userId - Creating user's ID
   * @param {object} meta - Request metadata (ipAddress, userAgent)
   * @returns {object} Created session
   */
  async create(data, userId, meta = {}) {
    const session = await voiceSessionRepository.create({
      ...data,
      userId,
      status: 'ACTIVE',
    });

    eventBus.publish(EVENT_TYPES.AI_SESSION_STARTED, {
      sessionId: session._id,
      userId,
      sessionType: session.sessionType,
      language: session.language,
    }, { source: 'ai:sessions' });

    auditService.logEvent({
      eventType: 'ai.session.created',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { sessionId: session._id, sessionType: session.sessionType },
      module: 'ai',
    });

    logger.info('Voice session created', {
      module: 'ai',
      action: 'session.create',
      sessionId: session._id,
      sessionType: session.sessionType,
    });

    return session;
  }

  /**
   * Upload audio for a session and queue transcription.
   *
   * @param {string} sessionId
   * @param {Buffer} audioBuffer
   * @param {string} mimeType
   * @param {string} userId
   * @param {object} meta
   * @returns {{ sessionId, status }}
   */
  async uploadAudio(sessionId, audioBuffer, mimeType, userId, meta = {}) {
    const session = await voiceSessionRepository.findById(sessionId);
    if (!session) {
      throw new AppError('Voice session not found', 404, ERROR_CODES.AI_SESSION_NOT_FOUND);
    }
    this._checkOwnership(session, userId);

    if (session.status !== 'ACTIVE') {
      throw new AppError(
        `Cannot upload audio: session status is ${session.status}`,
        409,
        ERROR_CODES.AI_SESSION_INVALID_STATUS,
      );
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      throw new AppError('No audio data provided', 400, ERROR_CODES.AI_SESSION_NO_AUDIO);
    }

    // Store audio via file service (save to temp or S3)
    let audioFileUrl;
    try {
      const { default: fileService } = await import('../files/file.service.js');
      const uploaded = await fileService.uploadBuffer(audioBuffer, {
        originalName: `voice-${sessionId}.wav`,
        mimeType: mimeType || 'audio/wav',
        folder: 'ai/audio',
        uploadedBy: userId,
      });
      audioFileUrl = uploaded.url || uploaded.fileUrl || uploaded.key;
    } catch {
      // Fallback: store base64 reference if file service is unavailable
      audioFileUrl = `buffer://${sessionId}`;
      logger.warn('File service unavailable, storing audio reference only', {
        module: 'ai',
        action: 'session.uploadAudio',
        sessionId,
      });
    }

    // Update session with audio info
    await voiceSessionRepository.updateById(sessionId, {
      audioFileUrl,
      audioDurationMs: null, // Whisper will provide duration
      status: 'PROCESSING',
    });

    // Queue transcription job
    await queueManager.addJob('ai-transcription', 'transcribe', {
      sessionId,
      audioFileUrl,
      mimeType: mimeType || 'audio/wav',
      language: session.language,
    });

    await this._invalidateSessionCache(sessionId);

    logger.info('Audio uploaded, transcription queued', {
      module: 'ai',
      action: 'session.uploadAudio',
      sessionId,
      audioSize: audioBuffer.length,
    });

    return { sessionId, status: 'processing' };
  }

  /**
   * Process transcription for a session. Called by the transcription job worker.
   *
   * @param {string} sessionId
   */
  async processTranscription(sessionId) {
    const session = await voiceSessionRepository.findById(sessionId);
    if (!session) {
      throw new AppError('Voice session not found', 404, ERROR_CODES.AI_SESSION_NOT_FOUND);
    }

    logger.info('Processing transcription', {
      module: 'ai',
      action: 'session.processTranscription',
      sessionId,
      language: session.language,
    });

    // Load custom vocabulary for the session language
    let customVocabulary = [];
    try {
      const { default: customVocabularyService } = await import('./customVocabulary.service.js');
      const terms = await customVocabularyService.getActiveTerms(session.language?.split('-')[0] || 'de');
      customVocabulary = terms.map((t) => t.term);
    } catch (err) {
      logger.warn('Failed to load custom vocabulary', {
        module: 'ai',
        action: 'session.processTranscription',
        sessionId,
        error: err.message,
      });
    }

    // Load audio buffer
    let audioBuffer;
    try {
      const { default: fileService } = await import('../files/file.service.js');
      audioBuffer = await fileService.downloadBuffer(session.audioFileUrl);
    } catch (err) {
      await voiceSessionRepository.updateStatus(sessionId, 'FAILED', {
        result: { action: 'transcription', message: `Audio load failed: ${err.message}` },
      });
      eventBus.publish(EVENT_TYPES.AI_SESSION_FAILED, {
        sessionId,
        error: err.message,
      }, { source: 'ai:sessions' });
      throw new AppError('Failed to load audio', 500, ERROR_CODES.AI_TRANSCRIPTION_FAILED);
    }

    // Call STT gateway
    const { default: sttGatewayService } = await import('./sttGateway.service.js');
    let transcription;
    try {
      transcription = await sttGatewayService.transcribe(audioBuffer, {
        language: session.language,
        customVocabulary,
      });
    } catch (err) {
      await voiceSessionRepository.updateStatus(sessionId, 'FAILED', {
        result: { action: 'transcription', message: `STT failed: ${err.message}` },
      });
      eventBus.publish(EVENT_TYPES.AI_SESSION_FAILED, {
        sessionId,
        error: err.message,
      }, { source: 'ai:sessions' });
      throw new AppError('Transcription failed', 500, ERROR_CODES.AI_TRANSCRIPTION_FAILED);
    }

    // Update session with transcription result
    await voiceSessionRepository.updateById(sessionId, {
      rawTranscript: transcription.text,
      transcriptConfidence: transcription.confidence,
      sttProvider: transcription.provider,
      processingTimeMs: transcription.processingTimeMs,
    });

    eventBus.publish(EVENT_TYPES.AI_SESSION_TRANSCRIBED, {
      sessionId,
      textLength: transcription.text.length,
      confidence: transcription.confidence,
      provider: transcription.provider,
    }, { source: 'ai:sessions' });

    // Call NLP pipeline for intent + entity extraction
    const { default: nlpPipelineService } = await import('./nlpPipeline.service.js');
    let nlpResult;
    try {
      nlpResult = await nlpPipelineService.process(transcription.text, {
        sessionType: session.sessionType,
        contextModule: session.contextModule,
        language: session.language,
      });
    } catch (err) {
      await voiceSessionRepository.updateStatus(sessionId, 'FAILED', {
        rawTranscript: transcription.text,
        result: { action: 'nlp', message: `NLP failed: ${err.message}` },
      });
      eventBus.publish(EVENT_TYPES.AI_SESSION_FAILED, {
        sessionId,
        error: err.message,
      }, { source: 'ai:sessions' });
      throw new AppError('NLP processing failed', 500, ERROR_CODES.AI_NLP_FAILED);
    }

    // Update session with intent
    await voiceSessionRepository.updateById(sessionId, {
      intentName: nlpResult.intent.name,
      intentConfidence: nlpResult.intent.confidence,
    });

    // Create VoiceSessionEntity records for each extracted entity
    if (nlpResult.entities.length > 0) {
      const entityDocs = nlpResult.entities.map((e) => ({
        sessionId,
        entityType: e.type,
        value: e.value,
        normalizedValue: e.normalizedValue,
        confidence: e.confidence,
        resolvedId: e.resolvedId || null,
        startOffset: e.startOffset,
        endOffset: e.endOffset,
      }));

      await voiceSessionEntityRepository.createMany(entityDocs);
    }

    eventBus.publish(EVENT_TYPES.AI_SESSION_ENTITIES_EXTRACTED, {
      sessionId,
      intentName: nlpResult.intent.name,
      entityCount: nlpResult.entities.length,
    }, { source: 'ai:sessions' });

    // Set status to AWAITING_CONFIRMATION
    await voiceSessionRepository.updateStatus(sessionId, 'AWAITING_CONFIRMATION');

    await this._invalidateSessionCache(sessionId);

    logger.info('Transcription processing completed', {
      module: 'ai',
      action: 'session.processTranscription',
      sessionId,
      intentName: nlpResult.intent.name,
      entityCount: nlpResult.entities.length,
    });
  }

  /**
   * Get a session by ID with its entities.
   *
   * @param {string} sessionId
   * @param {string} userId
   * @returns {object} Session with entities
   */
  async getById(sessionId, userId) {
    const cacheKey = `ai:session:${sessionId}`;

    const session = await cacheManager.getOrSet(
      cacheKey,
      () => voiceSessionRepository.findByIdWithEntities(sessionId),
      SESSION_TTL,
    );

    if (!session) {
      throw new AppError('Voice session not found', 404, ERROR_CODES.AI_SESSION_NOT_FOUND);
    }
    this._checkOwnership(session, userId);

    return session;
  }

  /**
   * List sessions for a user with cursor pagination.
   *
   * @param {string} userId
   * @param {object} queryParams - { cursor, limit, sortBy, sortOrder, ...filters }
   * @returns {object} Paginated result
   */
  async list(userId, queryParams = {}) {
    const { cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', ...filters } = queryParams;

    const filterKey = Object.entries(filters)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    const cacheKey = `ai:sessions:list:${userId}:${cursor || ''}:${limit}:${sortBy}:${sortOrder}:${filterKey}`;

    return cacheManager.getOrSet(
      cacheKey,
      () => voiceSessionRepository.findWithCursor({
        cursor,
        limit,
        sortBy,
        sortOrder,
        filters: { ...filters, userId },
      }),
      SESSION_TTL,
    );
  }

  /**
   * Submit corrections for a session's transcript and/or entities.
   *
   * @param {string} sessionId
   * @param {object} corrections - { correctedTranscript, entities: [{ entityId, correctedValue }] }
   * @param {string} userId
   * @param {object} meta
   * @returns {object} Updated session
   */
  async submitCorrections(sessionId, corrections, userId, meta = {}) {
    const session = await voiceSessionRepository.findById(sessionId);
    if (!session) {
      throw new AppError('Voice session not found', 404, ERROR_CODES.AI_SESSION_NOT_FOUND);
    }
    this._checkOwnership(session, userId);

    if (session.status !== 'AWAITING_CONFIRMATION') {
      throw new AppError(
        `Cannot submit corrections: session status is ${session.status}`,
        409,
        ERROR_CODES.AI_SESSION_INVALID_STATUS,
      );
    }

    // Update corrected transcript if provided
    if (corrections.correctedTranscript) {
      await voiceSessionRepository.updateById(sessionId, {
        correctedTranscript: corrections.correctedTranscript,
      });
    }

    // Update entity corrected values
    if (Array.isArray(corrections.entities)) {
      for (const entityCorrection of corrections.entities) {
        if (entityCorrection.entityId && entityCorrection.correctedValue !== undefined) {
          await voiceSessionEntityRepository.updateCorrectedValue(
            entityCorrection.entityId,
            entityCorrection.correctedValue,
          );
        }
      }
    }

    eventBus.publish(EVENT_TYPES.AI_SESSION_CORRECTED, {
      sessionId,
      userId,
      hasCorrectedTranscript: !!corrections.correctedTranscript,
      correctedEntityCount: corrections.entities?.length || 0,
    }, { source: 'ai:sessions' });

    auditService.logEvent({
      eventType: 'ai.session.corrected',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: {
        sessionId,
        hasCorrectedTranscript: !!corrections.correctedTranscript,
        correctedEntityCount: corrections.entities?.length || 0,
      },
      module: 'ai',
    });

    await this._invalidateSessionCache(sessionId);

    return voiceSessionRepository.findByIdWithEntities(sessionId);
  }

  /**
   * Confirm a session and dispatch the appropriate action.
   *
   * @param {string} sessionId
   * @param {string} userId
   * @param {object} meta
   * @returns {object} Updated session
   */
  async confirm(sessionId, userId, meta = {}) {
    const session = await voiceSessionRepository.findByIdWithEntities(sessionId);
    if (!session) {
      throw new AppError('Voice session not found', 404, ERROR_CODES.AI_SESSION_NOT_FOUND);
    }
    this._checkOwnership(session, userId);

    if (session.status !== 'AWAITING_CONFIRMATION') {
      throw new AppError(
        `Cannot confirm: session status is ${session.status}`,
        409,
        ERROR_CODES.AI_SESSION_INVALID_STATUS,
      );
    }

    // Build entity data map for dispatching
    const entityData = {};
    if (session.entities) {
      for (const entity of session.entities) {
        const value = entity.correctedValue || entity.normalizedValue || entity.value;
        entityData[entity.entityType] = entityData[entity.entityType] || [];
        entityData[entity.entityType].push({
          value,
          resolvedId: entity.resolvedId,
          confidence: entity.confidence,
        });
      }
    }

    const transcript = session.correctedTranscript || session.rawTranscript;
    let result = null;

    // Dispatch action based on intentName
    switch (session.intentName) {
      case 'create_order':
        eventBus.publish(EVENT_TYPES.AI_ORDER_CREATE_REQUESTED, {
          sessionId,
          userId,
          transcript,
          entities: entityData,
        }, { source: 'ai:sessions' });
        result = { action: 'create_order', message: 'Order creation requested' };
        break;

      case 'create_report':
        eventBus.publish(EVENT_TYPES.AI_REPORT_CONTENT_CAPTURED, {
          sessionId,
          userId,
          transcript,
          entities: entityData,
        }, { source: 'ai:sessions' });
        result = { action: 'create_report', message: 'Report content captured' };
        break;

      case 'capture_address':
        eventBus.publish(EVENT_TYPES.AI_ADDRESS_CAPTURED, {
          sessionId,
          userId,
          transcript,
          entities: entityData,
        }, { source: 'ai:sessions' });
        result = { action: 'capture_address', message: 'Address captured' };
        break;

      case 'command':
      case 'navigate':
      case 'search_customer':
      case 'update_status': {
        // Try to match a registered voice command
        try {
          const { default: voiceCommandService } = await import('./voiceCommand.service.js');
          const command = await voiceCommandService.matchCommand(
            transcript,
            session.language?.split('-')[0] || 'de',
          );
          if (command) {
            result = {
              action: command.actionType,
              recordType: command.actionTarget,
              message: `Command matched: ${command.intent}`,
            };
          } else {
            result = { action: session.intentName, message: 'No matching command found' };
          }
        } catch {
          result = { action: session.intentName, message: 'Command matching unavailable' };
        }
        break;
      }

      default:
        result = { action: 'general', message: 'Session confirmed without specific action' };
        break;
    }

    // Dispatch autonomous agent execution for actionable intents
    const AGENT_INTENTS = ['create_order', 'create_report'];
    if (AGENT_INTENTS.includes(session.intentName)) {
      try {
        const { default: agentService } = await import('./agent/agent.service.js');
        await agentService.runFromSession(
          sessionId,
          userId,
          meta.permissions || [],
          entityData,
          session.intentName,
          { ipAddress: meta.ipAddress, userAgent: meta.userAgent, correlationId: meta.correlationId },
        );
      } catch (err) {
        logger.warn('Failed to dispatch agent run from voice session', {
          module: 'ai',
          action: 'session.confirm',
          sessionId,
          error: err.message,
        });
      }
    }

    // Update session to COMPLETED
    await voiceSessionRepository.updateStatus(sessionId, 'COMPLETED', { result });

    eventBus.publish(EVENT_TYPES.AI_SESSION_COMPLETED, {
      sessionId,
      userId,
      intentName: session.intentName,
      result,
    }, { source: 'ai:sessions' });

    auditService.logEvent({
      eventType: 'ai.session.confirmed',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { sessionId, intentName: session.intentName, action: result?.action },
      module: 'ai',
    });

    await this._invalidateSessionCache(sessionId);

    logger.info('Voice session confirmed', {
      module: 'ai',
      action: 'session.confirm',
      sessionId,
      intentName: session.intentName,
      resultAction: result?.action,
    });

    return voiceSessionRepository.findByIdWithEntities(sessionId);
  }

  /**
   * Cancel a voice session.
   *
   * @param {string} sessionId
   * @param {string} userId
   * @param {object} meta
   */
  async cancel(sessionId, userId, meta = {}) {
    const session = await voiceSessionRepository.findById(sessionId);
    if (!session) {
      throw new AppError('Voice session not found', 404, ERROR_CODES.AI_SESSION_NOT_FOUND);
    }
    this._checkOwnership(session, userId);

    await voiceSessionRepository.updateStatus(sessionId, 'CANCELLED');

    auditService.logEvent({
      eventType: 'ai.session.cancelled',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { sessionId },
      module: 'ai',
    });

    await this._invalidateSessionCache(sessionId);

    logger.info('Voice session cancelled', {
      module: 'ai',
      action: 'session.cancel',
      sessionId,
    });
  }

  /**
   * Verify session ownership.
   *
   * @param {object} session
   * @param {string} userId
   */
  _checkOwnership(session, userId) {
    if (session.userId.toString() !== userId.toString()) {
      throw new AppError('Voice session not found', 404, ERROR_CODES.AI_SESSION_NOT_FOUND);
    }
  }

  async _invalidateSessionCache(sessionId) {
    await cacheManager.del(`ai:session:${sessionId}`);
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}ai:sessions:list:*`);
  }
}

const voiceSessionService = new VoiceSessionService();
export default voiceSessionService;
