import voiceCommandRepository from './voiceCommand.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import auditService from '../auth/audit.service.js';
import { AppError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

const ACTIVE_COMMANDS_TTL = { l1Ttl: 120, l2Ttl: 600 };
const LIST_TTL = { l1Ttl: 30, l2Ttl: 120 };
const SWISS_GERMAN_ALIASES = {
  auftrag: ['uftrag', 'uuftrag', 'uftraag'],
  erstellen: ['erstelle', 'mache', 'mach'],
  öffnen: ['oeffnen', 'ufmache', 'aufmache'],
  suchen: ['sueche', 'suche'],
  rapport: ['raport', 'rapport'],
  heute: ['huet', 'hüt', 'hut'],
};

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

    const languages = this._resolveLanguageFallbacks(language);
    const cacheKey = `ai:commands:active:${languages.join('|')}`;

    const commands = await cacheManager.getOrSet(
      cacheKey,
      () => voiceCommandRepository.findActive(languages),
      ACTIVE_COMMANDS_TTL,
    );

    if (!commands || commands.length === 0) return null;

    const normalizedTranscript = this._normalizeForMatching(transcript);
    let bestMatch = null;
    let bestScore = 0;
    let bestPhrase = null;

    for (const command of commands) {
      for (const phrase of command.phrases) {
        const normalizedPhrase = this._normalizeForMatching(phrase);
        const score = this._scorePhraseMatch(normalizedTranscript, normalizedPhrase);

        if (score > bestScore) {
          bestScore = score;
          bestMatch = command;
          bestPhrase = phrase;
        }
      }
    }

    if (!bestMatch || bestScore < 0.58) return null;

    const confidence = Math.min(1, bestScore);

    logger.debug('Voice command matched', {
      module: 'ai',
      action: 'command.match',
      intent: bestMatch.intent,
      confidence,
      language,
      matchedPhrase: bestPhrase,
    });

    return {
      ...bestMatch,
      matchConfidence: Math.round(confidence * 100) / 100,
    };
  }

  _resolveLanguageFallbacks(language) {
    const normalized = String(language || '').toLowerCase();
    const base = normalized.split('-')[0];
    const languages = new Set([normalized]);

    if (base) languages.add(base);
    if (normalized === 'de-ch' || normalized === 'gsw' || normalized === 'gsw-ch') {
      languages.add('de-CH');
      languages.add('de');
      languages.add('gsw-CH');
      languages.add('gsw');
    }

    return [...languages];
  }

  _normalizeForMatching(value) {
    let normalized = String(value || '')
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    for (const [standard, aliases] of Object.entries(SWISS_GERMAN_ALIASES)) {
      for (const alias of aliases) {
        const pattern = new RegExp(`\\b${alias}\\b`, 'g');
        normalized = normalized.replace(pattern, standard);
      }
    }

    return normalized.replace(/\s+/g, ' ').trim();
  }

  _scorePhraseMatch(transcript, phrase) {
    if (!transcript || !phrase) return 0;
    if (transcript.includes(phrase)) {
      return Math.min(1, 0.75 + (phrase.length / Math.max(transcript.length, phrase.length)) * 0.25);
    }

    const transcriptTokens = transcript.split(' ');
    const phraseTokens = phrase.split(' ');
    const phraseTokenSet = new Set(phraseTokens);
    const matchingTokens = transcriptTokens.filter((token) => phraseTokenSet.has(token)).length;
    const tokenCoverage = matchingTokens / phraseTokens.length;
    const distance = this._levenshtein(transcript, phrase);
    const distanceScore = 1 - (distance / Math.max(transcript.length, phrase.length));

    return Math.max(tokenCoverage * 0.85, distanceScore);
  }

  _levenshtein(left, right) {
    const rows = left.length + 1;
    const cols = right.length + 1;
    const matrix = Array.from({ length: rows }, () => Array(cols).fill(0));

    for (let row = 0; row < rows; row++) matrix[row][0] = row;
    for (let col = 0; col < cols; col++) matrix[0][col] = col;

    for (let row = 1; row < rows; row++) {
      for (let col = 1; col < cols; col++) {
        const cost = left[row - 1] === right[col - 1] ? 0 : 1;
        matrix[row][col] = Math.min(
          matrix[row - 1][col] + 1,
          matrix[row][col - 1] + 1,
          matrix[row - 1][col - 1] + cost,
        );
      }
    }

    return matrix[left.length][right.length];
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
