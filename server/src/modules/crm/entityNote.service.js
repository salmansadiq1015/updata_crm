import entityNoteRepository from './entityNote.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { NotFoundError, ConflictError, AuthorizationError } from '../../shared/errors/AppError.js';
import logger from '../../shared/logger/index.js';

const LIST_TTL = { l1Ttl: 30, l2Ttl: 120 };

class EntityNoteService {
  _cacheKey(entityType, entityId) {
    return `crm:notes:${entityType}:${entityId}`;
  }

  async create(entityType, entityId, data, authorId, meta = {}) {
    await this._assertEntityExists(entityType, entityId);

    const editableUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const note = await entityNoteRepository.create({
      ...data,
      entityType,
      entityId,
      authorId,
      editableUntil,
    });

    await this._invalidateCache(entityType, entityId);

    eventBus.publish(EVENT_TYPES.NOTE_CREATED, {
      noteId: note._id,
      entityType,
      entityId,
      authorId,
    }, { source: 'crm:notes' });

    auditService.logEvent({
      eventType: 'note.created',
      userId: authorId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { noteId: note._id, entityType, entityId },
      module: 'crm',
    });

    logger.info('Entity note created', { module: 'crm', action: 'note.create', noteId: note._id, entityType, entityId });

    return note;
  }

  async listByEntity(entityType, entityId) {
    const cacheKey = this._cacheKey(entityType, entityId);
    return cacheManager.getOrSet(
      cacheKey,
      () => entityNoteRepository.findByEntity(entityType, entityId),
      LIST_TTL,
    );
  }

  async update(id, data, updatedBy, meta = {}) {
    const note = await entityNoteRepository.findById(id);
    if (!note) throw new NotFoundError('EntityNote', id);

    // Only the original author may edit their note (CRM-011 AC-5).
    if (note.authorId?.toString() !== updatedBy?.toString()) {
      throw new AuthorizationError('Only the note author can edit this note');
    }

    if (new Date() > note.editableUntil) {
      throw new ConflictError('Note can only be edited within 24 hours of creation');
    }

    const allowedFields = {};
    if (data.text !== undefined) allowedFields.text = data.text;
    if (data.category !== undefined) allowedFields.category = data.category;
    if (data.isPinned !== undefined) allowedFields.isPinned = data.isPinned;
    if (data.isWarning !== undefined) allowedFields.isWarning = data.isWarning;

    const updated = await entityNoteRepository.updateById(id, allowedFields);
    await this._invalidateCache(note.entityType, note.entityId);

    auditService.logEvent({
      eventType: 'note.updated',
      userId: updatedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { noteId: id, changedFields: Object.keys(allowedFields) },
      module: 'crm',
    });

    return updated;
  }

  async delete(id, deletedBy, meta = {}) {
    const note = await entityNoteRepository.findById(id);
    if (!note) throw new NotFoundError('EntityNote', id);

    await entityNoteRepository.softDelete(id);
    await this._invalidateCache(note.entityType, note.entityId);

    auditService.logEvent({
      eventType: 'note.deleted',
      userId: deletedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { noteId: id, entityType: note.entityType, entityId: note.entityId },
      module: 'crm',
    });

    logger.info('Entity note deleted', { module: 'crm', action: 'note.delete', noteId: id });
  }

  async _invalidateCache(entityType, entityId) {
    await cacheManager.del(this._cacheKey(entityType, entityId));
  }

  async _assertEntityExists(entityType, entityId) {
    const modelByType = {
      customer: () => import('./customer.model.js'),
      site: () => import('./site.model.js'),
      installation: () => import('./installation.model.js'),
    };

    const loadModel = modelByType[entityType];
    if (!loadModel) throw new NotFoundError('CRM entity', `${entityType}:${entityId}`);

    const { default: Model } = await loadModel();
    const entity = await Model.findById(entityId).select('_id').lean();
    if (!entity) throw new NotFoundError(entityType, entityId);
  }
}

const entityNoteService = new EntityNoteService();
export default entityNoteService;
