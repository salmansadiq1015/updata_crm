import taskFolderRepository from './taskFolder.repository.js';
import taskListRepository from './taskList.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import auditService from '../auth/audit.service.js';
import { AppError, NotFoundError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

const ENTITY_TTL = { l1Ttl: 60, l2Ttl: 300 };
const LIST_TTL = { l1Ttl: 30, l2Ttl: 120 };
const MAX_FOLDERS_PER_USER = 50;

class TaskFolderService {
  async getAllForUser(userId) {
    const cacheKey = `tasks:folders:user:${userId}`;
    return cacheManager.getOrSet(
      cacheKey,
      async () => {
        const folders = await taskFolderRepository.findByOwnerId(userId);
        const lists = await taskListRepository.findByOwnerId(userId, { includeArchived: false });

        const folderMap = {};
        for (const folder of folders) {
          folderMap[folder._id.toString()] = { ...folder, lists: [] };
        }
        const unfoldered = [];
        for (const list of lists) {
          if (list.folderId && folderMap[list.folderId.toString()]) {
            folderMap[list.folderId.toString()].lists.push(list);
          } else {
            unfoldered.push(list);
          }
        }
        return { folders: Object.values(folderMap), unfoldered };
      },
      LIST_TTL,
    );
  }

  async create(data, userId, meta = {}) {
    const count = await taskFolderRepository.countByOwnerId(userId);
    if (count >= MAX_FOLDERS_PER_USER) {
      throw new AppError(
        `Maximum of ${MAX_FOLDERS_PER_USER} task folders per user exceeded`,
        400,
        ERROR_CODES.TASK_FOLDER_LIMIT_EXCEEDED,
      );
    }

    const folder = await taskFolderRepository.create({ ...data, ownerId: userId });

    await this._invalidateUserFolderCache(userId);

    auditService.logEvent({
      eventType: 'task_folder.created',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { folderId: folder._id, name: folder.name },
      module: 'tasks',
    });

    logger.info('Task folder created', { module: 'tasks', action: 'create', folderId: folder._id, userId });

    return taskFolderRepository.findById(folder._id);
  }

  async getById(id, userId) {
    const cacheKey = `tasks:folder:${id}`;
    const folder = await cacheManager.getOrSet(
      cacheKey,
      () => taskFolderRepository.findById(id),
      ENTITY_TTL,
    );
    if (!folder) throw new NotFoundError('TaskFolder', id);

    if (folder.ownerId.toString() !== userId.toString()) {
      throw new AppError('Access denied to this task folder', 403, ERROR_CODES.TASK_FOLDER_ACCESS_DENIED);
    }

    return folder;
  }

  async update(id, data, userId, meta = {}) {
    await this.getById(id, userId);

    const updated = await taskFolderRepository.updateById(id, data);

    await this._invalidateFolderCache(id);
    await this._invalidateUserFolderCache(userId);

    auditService.logEvent({
      eventType: 'task_folder.updated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { folderId: id, changedFields: Object.keys(data) },
      module: 'tasks',
    });

    logger.info('Task folder updated', { module: 'tasks', action: 'update', folderId: id, userId });

    return updated;
  }

  async remove(id, userId, meta = {}) {
    await this.getById(id, userId);

    const TaskList = (await import('./taskList.model.js')).default;
    await TaskList.updateMany({ folderId: id }, { $set: { folderId: null } });

    await taskFolderRepository.softDelete(id);

    await this._invalidateFolderCache(id);
    await this._invalidateUserFolderCache(userId);
    await this._invalidateUserListCache(userId);

    auditService.logEvent({
      eventType: 'task_folder.deleted',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { folderId: id, listsUnlinked: true },
      module: 'tasks',
    });

    logger.info('Task folder deleted', { module: 'tasks', action: 'remove', folderId: id, userId });

    return { deleted: true };
  }

  async reorder(orderedIds, userId) {
    const folders = await taskFolderRepository.findByOwnerId(userId);
    const ownerSet = new Set(folders.map((f) => f._id.toString()));

    for (const id of orderedIds) {
      if (!ownerSet.has(id.toString())) {
        throw new AppError('One or more folder IDs do not belong to this user', 403, ERROR_CODES.TASK_FOLDER_ACCESS_DENIED);
      }
    }

    await taskFolderRepository.bulkUpdateSortOrder(orderedIds.map((id, i) => ({ id, sortOrder: i })));
    await this._invalidateUserFolderCache(userId);

    logger.info('Task folders reordered', { module: 'tasks', action: 'reorder', userId, count: orderedIds.length });

    return { reordered: true };
  }

  async _invalidateFolderCache(id) {
    await cacheManager.del(`tasks:folder:${id}`);
  }

  async _invalidateUserFolderCache(userId) {
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}tasks:folders:user:${userId}`);
  }

  async _invalidateUserListCache(userId) {
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}tasks:lists:user:${userId}`);
  }
}

const taskFolderService = new TaskFolderService();
export default taskFolderService;
