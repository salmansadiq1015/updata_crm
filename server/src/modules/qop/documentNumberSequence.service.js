import documentNumberSequenceRepository from './documentNumberSequence.repository.js';
import counterService from './counter.service.js';
import auditService from '../auth/audit.service.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import logger from '../../shared/logger/index.js';
import { NotFoundError } from '../../shared/errors/AppError.js';

const LIST_CACHE_KEY = 'qop:sequences:list';
const LIST_TTL = { l1Ttl: 30, l2Ttl: 120 };

class DocumentNumberSequenceService {
  async list() {
    return cacheManager.getOrSet(
      LIST_CACHE_KEY,
      () => documentNumberSequenceRepository.findAll(),
      LIST_TTL,
    );
  }

  async create(data, userId, meta = {}) {
    const sequence = await documentNumberSequenceRepository.create(data);

    await cacheManager.del(LIST_CACHE_KEY);

    auditService.logEvent({
      eventType: 'documentNumberSequence.created',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { sequenceId: sequence._id, documentType: data.documentType },
      module: 'qop',
    });

    logger.info('Document number sequence created', {
      module: 'qop',
      action: 'create',
      sequenceId: sequence._id,
    });

    return sequence;
  }

  async update(id, data, userId, meta = {}) {
    const existing = await documentNumberSequenceRepository.findById(id);
    if (!existing) throw new NotFoundError('DocumentNumberSequence', id);

    const updated = await documentNumberSequenceRepository.updateById(id, data);

    await cacheManager.del(LIST_CACHE_KEY);

    auditService.logEvent({
      eventType: 'documentNumberSequence.updated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { sequenceId: id, changedFields: Object.keys(data) },
      module: 'qop',
    });

    return updated;
  }

  async preview(id) {
    const result = await counterService.previewNumber(id);
    if (!result) throw new NotFoundError('DocumentNumberSequence', id);
    return result;
  }
}

const documentNumberSequenceService = new DocumentNumberSequenceService();
export default documentNumberSequenceService;
