import voiceCommandRepository from './voiceCommand.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import auditService from '../auth/audit.service.js';
import { AppError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

const ACTIVE_COMMANDS_TTL = { l1Ttl: 120, l2Ttl: 600 };
const LIST_TTL = { l1Ttl: 30, l2Ttl: 120 };

class VoiceCommandService {
  /**
   * Create a new voice command.
   *
   * @param {object} data - { intent, language, phrases, actionType, actionTarget, actionParameters, requiresConfirmation }
   * @param {string} userId
   * @param {object} meta
   * @returns {object} Created command
   */
  async create(data, userId, meta = {}) {
    // Check for duplicate (intent + language)
    const existing = await voiceCommandRepository.findByIntentAndLanguage(data.intent, data.language);
    if (existing) {
      throw new AppError(
        `Voice command with intent '${data.intent}' already exists for language '${data.language}'`,
        409,
        ERROR_CODES.AI_COMMAND_DUPLICATE,
      );
    }

    const created = await voiceCommandRepository.create(data);

    await this._invalidateActiveCommandsCache(data.language);
    await this._invalidateListCache();

    auditService.logEvent({
      eventType: 'ai.command.created',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { commandId: created._id, intent: created.intent, language: created.language },
      module: 'ai',
    });

    logger.info('Voice command created', {
      module: 'ai',
      action: 'command.create',
      commandId: created._id,
      intent: created.intent,
    });

    return created;
  }

  /**
   * Get a voice command by ID.
   *
   * @param {string} id
   * @returns {object}
   */
  async getById(id) {
    const command = await voiceCommandRepository.findById(id);
    if (!command) {
      throw new AppError('Voice command not found', 404, ERROR_CODES.AI_COMMAND_NOT_FOUND);
    }
    return command;
  }

  /**
   * List voice commands with cursor pagination.
   *
   * @param {object} queryParams
   * @returns {object} Paginated result
   */
  async list(queryParams = {}) {
    const { cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', search, ...filters } = queryParams;

    const filterKey = Object.entries(filters)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    const cacheKey = `ai:commands:list:${cursor || ''}:${limit}:${sortBy}:${sortOrder}:${search || ''}:${filterKey}`;

    return cacheManager.getOrSet(
      cacheKey,
      () => voiceCommandRepository.findWithCursor({
        cursor,
        limit,
        sortBy,
        sortOrder,
        filters,
        search,
      }),
      LIST_TTL,
    );
  }

  /**
   * Update a voice command.
   *
   * @param {string} id
   * @param {object} data
   * @param {string} userId
   * @param {object} meta
   * @returns {object} Updated command
   */
  async update(id, data, userId, meta = {}) {
    const existing = await voiceCommandRepository.findById(id);
    if (!existing) {
      throw new AppError('Voice command not found', 404, ERROR_CODES.AI_COMMAND_NOT_FOUND);
    }

    // If intent or language changed, check for duplicates
    if ((data.intent && data.intent !== existing.intent) || (data.language && data.language !== existing.language)) {
      const duplicate = await voiceCommandRepository.findByIntentAndLanguage(
        data.intent || existing.intent,
        data.language || existing.language,
      );
      if (duplicate && duplicate._id.toString() !== id.toString()) {
        throw new AppError(
          `Voice command with intent '${data.intent || existing.intent}' already exists for language '${data.language || existing.language}'`,
          409,
          ERROR_CODES.AI_COMMAND_DUPLICATE,
        );
      }
    }

    const updated = await voiceCommandRepository.updateById(id, data);

    await this._invalidateActiveCommandsCache(updated.language);
    if (existing.language !== updated.language) {
      await this._invalidateActiveCommandsCache(existing.language);
    }
    await this._invalidateListCache();

    auditService.logEvent({
      eventType: 'ai.command.updated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { commandId: id, changedFields: Object.keys(data) },
      module: 'ai',
    });

    logger.info('Voice command updated', {
      module: 'ai',
      action: 'command.update',
      commandId: id,
      changedFields: Object.keys(data),
    });

    return updated;
  }

  /**
   * Soft-delete a voice command.
   *
   * @param {string} id
   * @param {string} userId
   * @param {object} meta
   */
  async remove(id, userId, meta = {}) {
    const existing = await voiceCommandRepository.findById(id);
    if (!existing) {
      throw new AppError('Voice command not found', 404, ERROR_CODES.AI_COMMAND_NOT_FOUND);
    }

    await voiceCommandRepository.softDelete(id);

    await this._invalidateActiveCommandsCache(existing.language);
    await this._invalidateListCache();

    auditService.logEvent({
      eventType: 'ai.command.deleted',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { commandId: id, intent: existing.intent },
      module: 'ai',
    });

    logger.info('Voice command deleted', {
      module: 'ai',
      action: 'command.remove',
      commandId: id,
      intent: existing.intent,
    });
  }

  /**
   * Find a matching voice command for a given transcript.
   * Loads active commands for the language and checks if the transcript
   * contains any of the registered command phrases.
   *
   * @param {string} transcript - Transcribed text
   * @param {string} language - Language code (e.g. 'de')
   * @returns {object|null} Best matching command with confidence, or null
   */
  async matchCommand(transcript, language) {
    if (!transcript || !language) return null;

    const cacheKey = `ai:commands:active:${language}`;

    const commands = await cacheManager.getOrSet(
      cacheKey,
      () => voiceCommandRepository.findActive(language),
      ACTIVE_COMMANDS_TTL,
    );

    if (!commands || commands.length === 0) return null;

    const lowerTranscript = transcript.toLowerCase().trim();
    let bestMatch = null;
    let bestScore = 0;

    for (const command of commands) {
      for (const phrase of command.phrases) {
        const lowerPhrase = phrase.toLowerCase().trim();

        if (lowerTranscript.includes(lowerPhrase)) {
          // Score based on how much of the transcript the phrase covers
          const score = lowerPhrase.length / lowerTranscript.length;

          if (score > bestScore) {
            bestScore = score;
            bestMatch = command;
          }
        }
      }
    }

    if (!bestMatch) return null;

    // Convert score to confidence (0-1). A phrase covering >50% of text = high confidence
    const confidence = Math.min(1, bestScore * 1.5);

    logger.debug('Voice command matched', {
      module: 'ai',
      action: 'command.match',
      intent: bestMatch.intent,
      confidence,
      language,
    });

    return {
      ...bestMatch,
      matchConfidence: Math.round(confidence * 100) / 100,
    };
  }

  async _invalidateActiveCommandsCache(language) {
    await cacheManager.del(`ai:commands:active:${language}`);
  }

  async _invalidateListCache() {
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}ai:commands:list:*`);
  }
}

const voiceCommandService = new VoiceCommandService();
export default voiceCommandService;
