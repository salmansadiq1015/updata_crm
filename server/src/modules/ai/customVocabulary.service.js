import customVocabularyRepository from './customVocabulary.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import auditService from '../auth/audit.service.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import { AppError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

const ACTIVE_TERMS_TTL = { l1Ttl: 120, l2Ttl: 600 };
const LIST_TTL = { l1Ttl: 30, l2Ttl: 120 };
const ENTITY_TTL = { l1Ttl: 60, l2Ttl: 300 };

class CustomVocabularyService {
  /**
   * Create a new vocabulary term.
   *
   * @param {object} data - { term, phonetic, category, language, aliases, source, status }
   * @param {string} userId
   * @param {object} meta
   * @returns {object} Created vocabulary entry
   */
  async create(data, userId, meta = {}) {
    // Check for duplicate (term + language)
    const existing = await customVocabularyRepository.findByTermAndLanguage(data.term, data.language);
    if (existing) {
      throw new AppError(
        `Vocabulary term '${data.term}' already exists for language '${data.language}'`,
        409,
        ERROR_CODES.AI_VOCABULARY_DUPLICATE,
      );
    }

    const created = await customVocabularyRepository.create(data);

    await this._invalidateActiveTermsCache(data.language);
    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.AI_VOCABULARY_UPDATED, {
      vocabId: created._id,
      term: created.term,
      language: created.language,
      action: 'created',
    }, { source: 'ai:vocabulary' });

    auditService.logEvent({
      eventType: 'ai.vocabulary.created',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { vocabId: created._id, term: created.term, language: created.language },
      module: 'ai',
    });

    logger.info('Vocabulary term created', {
      module: 'ai',
      action: 'vocabulary.create',
      vocabId: created._id,
      term: created.term,
    });

    return created;
  }

  /**
   * Get a vocabulary term by ID.
   *
   * @param {string} id
   * @returns {object}
   */
  async getById(id) {
    const cacheKey = `ai:vocab:${id}`;

    const vocab = await cacheManager.getOrSet(
      cacheKey,
      () => customVocabularyRepository.findById(id),
      ENTITY_TTL,
    );

    if (!vocab) {
      throw new AppError('Vocabulary term not found', 404, ERROR_CODES.AI_VOCABULARY_NOT_FOUND);
    }

    return vocab;
  }

  /**
   * List vocabulary terms with cursor pagination.
   *
   * @param {object} queryParams - { cursor, limit, sortBy, sortOrder, search, ...filters }
   * @returns {object} Paginated result
   */
  async list(queryParams = {}) {
    const { cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', search, ...filters } = queryParams;

    const filterKey = Object.entries(filters)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    const cacheKey = `ai:vocab:list:${cursor || ''}:${limit}:${sortBy}:${sortOrder}:${search || ''}:${filterKey}`;

    return cacheManager.getOrSet(
      cacheKey,
      () => customVocabularyRepository.findWithCursor({
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
   * Update a vocabulary term.
   *
   * @param {string} id
   * @param {object} data
   * @param {string} userId
   * @param {object} meta
   * @returns {object} Updated vocabulary entry
   */
  async update(id, data, userId, meta = {}) {
    const existing = await customVocabularyRepository.findById(id);
    if (!existing) {
      throw new AppError('Vocabulary term not found', 404, ERROR_CODES.AI_VOCABULARY_NOT_FOUND);
    }

    // If term or language changed, check for duplicates
    if ((data.term && data.term !== existing.term) || (data.language && data.language !== existing.language)) {
      const duplicate = await customVocabularyRepository.findByTermAndLanguage(
        data.term || existing.term,
        data.language || existing.language,
      );
      if (duplicate && duplicate._id.toString() !== id.toString()) {
        throw new AppError(
          `Vocabulary term '${data.term || existing.term}' already exists for language '${data.language || existing.language}'`,
          409,
          ERROR_CODES.AI_VOCABULARY_DUPLICATE,
        );
      }
    }

    const updated = await customVocabularyRepository.updateById(id, data);

    await cacheManager.del(`ai:vocab:${id}`);
    await this._invalidateActiveTermsCache(updated.language);
    if (existing.language !== updated.language) {
      await this._invalidateActiveTermsCache(existing.language);
    }
    await this._invalidateListCache();

    auditService.logEvent({
      eventType: 'ai.vocabulary.updated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { vocabId: id, changedFields: Object.keys(data) },
      module: 'ai',
    });

    logger.info('Vocabulary term updated', {
      module: 'ai',
      action: 'vocabulary.update',
      vocabId: id,
      changedFields: Object.keys(data),
    });

    return updated;
  }

  /**
   * Soft-delete a vocabulary term.
   *
   * @param {string} id
   * @param {string} userId
   * @param {object} meta
   */
  async remove(id, userId, meta = {}) {
    const existing = await customVocabularyRepository.findById(id);
    if (!existing) {
      throw new AppError('Vocabulary term not found', 404, ERROR_CODES.AI_VOCABULARY_NOT_FOUND);
    }

    await customVocabularyRepository.softDelete(id);

    await cacheManager.del(`ai:vocab:${id}`);
    await this._invalidateActiveTermsCache(existing.language);
    await this._invalidateListCache();

    auditService.logEvent({
      eventType: 'ai.vocabulary.deleted',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { vocabId: id, term: existing.term },
      module: 'ai',
    });

    logger.info('Vocabulary term deleted', {
      module: 'ai',
      action: 'vocabulary.remove',
      vocabId: id,
      term: existing.term,
    });
  }

  /**
   * Get all active vocabulary terms for a given language.
   * Heavily cached since this is called on every transcription.
   *
   * @param {string} language - Language code (e.g. 'de')
   * @returns {object[]} Active vocabulary terms
   */
  /**
   * The vocabulary is held per language, not per region, so a regional tag
   * has to be reduced first: asking for "de-CH" used to match nothing at all
   * and return an empty list without a word of complaint.
   */
  async getActiveTerms(language) {
    const base = String(language || 'de').split('-')[0].toLowerCase();
    const cacheKey = `ai:vocab:active:${base}`;

    return cacheManager.getOrSet(
      cacheKey,
      () => customVocabularyRepository.findActive(base),
      ACTIVE_TERMS_TTL,
    );
  }

  async _invalidateActiveTermsCache(language) {
    await cacheManager.del(`ai:vocab:active:${String(language || 'de').split('-')[0].toLowerCase()}`);
  }

  async _invalidateListCache() {
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}ai:vocab:list:*`);
  }
}

const customVocabularyService = new CustomVocabularyService();
export default customVocabularyService;
