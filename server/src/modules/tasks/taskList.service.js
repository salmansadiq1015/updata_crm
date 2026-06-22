import taskListRepository from './taskList.repository.js';
import TaskListMember from './taskListMember.model.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { AppError, NotFoundError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

const ENTITY_TTL = { l1Ttl: 60, l2Ttl: 300 };
const LIST_TTL = { l1Ttl: 30, l2Ttl: 120 };
const MAX_LISTS_PER_USER = 50;
const MAX_GROUP_MEMBERS = 50;

class TaskListService {
  async ensureDefaultList(userId) {
    const existing = await taskListRepository.findDefaultByOwnerId(userId);
    if (existing) return existing;

    const defaultList = await taskListRepository.create({
      name: 'My Tasks',
      type: 'PERSONAL',
      ownerId: userId,
      isDefault: true,
      sortOrder: 0,
    });

    await this._invalidateUserListCache(userId);

    logger.info('Default task list created', { module: 'tasks', action: 'ensureDefaultList', userId, listId: defaultList._id });

    return taskListRepository.findById(defaultList._id);
  }

  async getAllForUser(userId) {
    const cacheKey = `tasks:lists:user:${userId}`;
    return cacheManager.getOrSet(
      cacheKey,
      async () => {
        await this.ensureDefaultList(userId);
        const personalLists = await taskListRepository.findByOwnerId(userId);
        const groupLists = await taskListRepository.findGroupListsByUserId(userId);
        return { personal: personalLists, group: groupLists };
      },
      LIST_TTL,
    );
  }

  async create(data, userId, meta = {}) {
    const count = await taskListRepository.countByOwnerId(userId);
    if (count >= MAX_LISTS_PER_USER) {
      throw new AppError(
        `Maximum of ${MAX_LISTS_PER_USER} task lists per user exceeded`,
        400,
        ERROR_CODES.TASK_LIST_LIMIT_EXCEEDED,
      );
    }

    const listData = {
      ...data,
      ownerId: userId,
    };

    const list = await taskListRepository.create(listData);

    if (data.type === 'GROUP') {
      await TaskListMember.create({
        listId: list._id,
        userId,
        role: 'ADMIN',
        invitedBy: userId,
      });
    }

    await this._invalidateUserListCache(userId);

    auditService.logEvent({
      eventType: 'task_list.created',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { listId: list._id, name: list.name, type: list.type },
      module: 'tasks',
    });

    eventBus.publish(EVENT_TYPES.TASK_LIST_CREATED, {
      listId: list._id,
      ownerId: userId,
      name: list.name,
      type: list.type,
    });

    logger.info('Task list created', { module: 'tasks', action: 'create', listId: list._id, userId });

    return taskListRepository.findById(list._id);
  }

  async getById(id, userId) {
    const cacheKey = `tasks:list:${id}`;
    const list = await cacheManager.getOrSet(
      cacheKey,
      () => taskListRepository.findById(id),
      ENTITY_TTL,
    );
    if (!list) throw new NotFoundError('TaskList', id);

    await this._checkAccess(id, userId, 'VIEWER');

    return list;
  }

  async update(id, data, userId, meta = {}) {
    const list = await taskListRepository.findById(id);
    if (!list) throw new NotFoundError('TaskList', id);

    await this._checkAccess(id, userId, 'ADMIN');

    const updated = await taskListRepository.updateById(id, data);

    await this._invalidateListCache(id);
    await this._invalidateUserListCache(userId);

    auditService.logEvent({
      eventType: 'task_list.updated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { listId: id, changedFields: Object.keys(data) },
      module: 'tasks',
    });

    logger.info('Task list updated', { module: 'tasks', action: 'update', listId: id, userId });

    return updated;
  }

  async archive(id, userId, meta = {}) {
    const list = await taskListRepository.findById(id);
    if (!list) throw new NotFoundError('TaskList', id);

    if (list.isDefault) {
      throw new AppError('Cannot archive the default task list', 400, ERROR_CODES.TASK_LIST_IS_DEFAULT);
    }

    await this._checkAccess(id, userId, 'ADMIN');

    const updated = await taskListRepository.updateById(id, { isArchived: true });

    await this._invalidateListCache(id);
    await this._invalidateUserListCache(userId);

    auditService.logEvent({
      eventType: 'task_list.archived',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { listId: id },
      module: 'tasks',
    });

    logger.info('Task list archived', { module: 'tasks', action: 'archive', listId: id, userId });

    return updated;
  }

  async unarchive(id, userId, meta = {}) {
    const list = await taskListRepository.findById(id);
    if (!list) throw new NotFoundError('TaskList', id);

    await this._checkAccess(id, userId, 'ADMIN');

    const updated = await taskListRepository.updateById(id, { isArchived: false });

    await this._invalidateListCache(id);
    await this._invalidateUserListCache(userId);

    auditService.logEvent({
      eventType: 'task_list.unarchived',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { listId: id },
      module: 'tasks',
    });

    logger.info('Task list unarchived', { module: 'tasks', action: 'unarchive', listId: id, userId });

    return updated;
  }

  async remove(id, userId, meta = {}) {
    const list = await taskListRepository.findById(id);
    if (!list) throw new NotFoundError('TaskList', id);

    if (list.isDefault) {
      throw new AppError('Cannot delete the default task list', 400, ERROR_CODES.TASK_LIST_IS_DEFAULT);
    }

    await this._checkAccess(id, userId, 'ADMIN');

    const defaultList = await this.ensureDefaultList(userId);

    const Task = (await import('./task.model.js')).default;
    await Task.updateMany({ listId: id, isDeleted: false }, { $set: { listId: defaultList._id } });

    await taskListRepository.softDelete(id);
    await TaskListMember.deleteMany({ listId: id });

    await this._invalidateListCache(id);
    await this._invalidateUserListCache(userId);

    auditService.logEvent({
      eventType: 'task_list.deleted',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { listId: id, tasksMovedTo: defaultList._id },
      module: 'tasks',
    });

    logger.info('Task list deleted', { module: 'tasks', action: 'remove', listId: id, userId });

    return { deleted: true, tasksMovedTo: defaultList._id };
  }

  async reorder(orderedIds, userId) {
    const updates = orderedIds.map((id, index) => ({ id, sortOrder: index }));
    await taskListRepository.bulkUpdateSortOrder(updates);
    await this._invalidateUserListCache(userId);

    logger.info('Task lists reordered', { module: 'tasks', action: 'reorder', userId, count: orderedIds.length });

    return { reordered: true };
  }

  async addMember(listId, targetUserId, role, userId, meta = {}) {
    const list = await taskListRepository.findById(listId);
    if (!list) throw new NotFoundError('TaskList', listId);

    if (list.type !== 'GROUP') {
      throw new AppError('Cannot add members to a personal list', 400, ERROR_CODES.TASK_LIST_NOT_GROUP);
    }

    await this._checkAccess(listId, userId, 'ADMIN');

    const existing = await TaskListMember.findOne({ listId, userId: targetUserId }).lean();
    if (existing) {
      throw new AppError('User is already a member of this list', 409, ERROR_CODES.TASK_LIST_MEMBER_EXISTS);
    }

    const memberCount = await TaskListMember.countDocuments({ listId });
    if (memberCount >= MAX_GROUP_MEMBERS) {
      throw new AppError(
        `Group task lists support a maximum of ${MAX_GROUP_MEMBERS} members`,
        400,
        ERROR_CODES.TASK_LIST_LIMIT_EXCEEDED,
      );
    }

    const member = await TaskListMember.create({
      listId,
      userId: targetUserId,
      role,
      invitedBy: userId,
    });

    await this._invalidateUserListCache(targetUserId);

    auditService.logEvent({
      eventType: 'task_list.member.added',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { listId, targetUserId, role },
      module: 'tasks',
    });

    eventBus.publish(EVENT_TYPES.TASK_LIST_MEMBER_ADDED, {
      listId,
      userId: targetUserId,
      role,
      invitedBy: userId,
    });

    logger.info('Member added to task list', { module: 'tasks', action: 'addMember', listId, targetUserId, role });

    return member;
  }

  async updateMemberRole(listId, targetUserId, role, userId, meta = {}) {
    const list = await taskListRepository.findById(listId);
    if (!list) throw new NotFoundError('TaskList', listId);

    if (list.type !== 'GROUP') {
      throw new AppError('Cannot manage members on a personal list', 400, ERROR_CODES.TASK_LIST_NOT_GROUP);
    }

    await this._checkAccess(listId, userId, 'ADMIN');

    const member = await TaskListMember.findOneAndUpdate(
      { listId, userId: targetUserId },
      { role },
      { returnDocument: 'after', runValidators: true },
    ).lean();

    if (!member) throw new NotFoundError('TaskListMember', targetUserId);

    auditService.logEvent({
      eventType: 'task_list.member.role_updated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { listId, targetUserId, newRole: role },
      module: 'tasks',
    });

    logger.info('Member role updated', { module: 'tasks', action: 'updateMemberRole', listId, targetUserId, role });

    return member;
  }

  async removeMember(listId, targetUserId, userId, meta = {}) {
    const list = await taskListRepository.findById(listId);
    if (!list) throw new NotFoundError('TaskList', listId);

    if (list.type !== 'GROUP') {
      throw new AppError('Cannot remove members from a personal list', 400, ERROR_CODES.TASK_LIST_NOT_GROUP);
    }

    await this._checkAccess(listId, userId, 'ADMIN');

    if (String(list.ownerId) === String(targetUserId)) {
      throw new AppError('Cannot remove the owner from the list. Transfer ownership first.', 400, ERROR_CODES.TASK_LIST_NOT_OWNER);
    }

    const result = await TaskListMember.findOneAndDelete({ listId, userId: targetUserId });
    if (!result) throw new NotFoundError('TaskListMember', targetUserId);

    await this._invalidateUserListCache(targetUserId);

    auditService.logEvent({
      eventType: 'task_list.member.removed',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { listId, targetUserId },
      module: 'tasks',
    });

    eventBus.publish(EVENT_TYPES.TASK_LIST_MEMBER_REMOVED, {
      listId,
      userId: targetUserId,
      removedBy: userId,
    });

    logger.info('Member removed from task list', { module: 'tasks', action: 'removeMember', listId, targetUserId });

    return { removed: true };
  }

  async leaveGroup(listId, userId, meta = {}) {
    const list = await taskListRepository.findById(listId);
    if (!list) throw new NotFoundError('TaskList', listId);

    if (list.type !== 'GROUP') {
      throw new AppError('Cannot leave a personal list', 400, ERROR_CODES.TASK_LIST_NOT_GROUP);
    }

    if (String(list.ownerId) === String(userId)) {
      throw new AppError('Owner cannot leave the list. Transfer ownership first or delete the list.', 400, ERROR_CODES.TASK_LIST_NOT_OWNER);
    }

    const result = await TaskListMember.findOneAndDelete({ listId, userId });
    if (!result) throw new NotFoundError('TaskListMember', userId);

    await this._invalidateUserListCache(userId);

    auditService.logEvent({
      eventType: 'task_list.member.left',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { listId },
      module: 'tasks',
    });

    eventBus.publish(EVENT_TYPES.TASK_LIST_MEMBER_REMOVED, {
      listId,
      userId,
      removedBy: userId,
    });

    logger.info('User left task list', { module: 'tasks', action: 'leaveGroup', listId, userId });

    return { left: true };
  }

  async transferOwnership(listId, newOwnerId, userId, meta = {}) {
    const list = await taskListRepository.findById(listId);
    if (!list) throw new NotFoundError('TaskList', listId);

    if (list.type !== 'GROUP') {
      throw new AppError('Cannot transfer ownership of a personal list', 400, ERROR_CODES.TASK_LIST_NOT_GROUP);
    }

    if (String(list.ownerId) !== String(userId)) {
      throw new AppError('Only the owner can transfer ownership', 403, ERROR_CODES.TASK_LIST_NOT_OWNER);
    }

    const newOwnerMembership = await TaskListMember.findOne({ listId, userId: newOwnerId }).lean();
    if (!newOwnerMembership) throw new NotFoundError('TaskListMember', newOwnerId);

    await taskListRepository.updateById(listId, { ownerId: newOwnerId });
    await TaskListMember.findOneAndUpdate({ listId, userId: newOwnerId }, { role: 'ADMIN' });

    await this._invalidateListCache(listId);
    await this._invalidateUserListCache(userId);
    await this._invalidateUserListCache(newOwnerId);

    auditService.logEvent({
      eventType: 'task_list.ownership_transferred',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { listId, previousOwnerId: userId, newOwnerId },
      module: 'tasks',
    });

    logger.info('Task list ownership transferred', { module: 'tasks', action: 'transferOwnership', listId, previousOwnerId: userId, newOwnerId });

    return taskListRepository.findById(listId);
  }

  async getMembers(listId, userId) {
    const list = await taskListRepository.findById(listId);
    if (!list) throw new NotFoundError('TaskList', listId);

    await this._checkAccess(listId, userId, 'VIEWER');

    return TaskListMember.find({ listId }).populate('userId', 'name email avatar').populate('invitedBy', 'name email').lean();
  }

  async _checkAccess(listId, userId, requiredRole = 'VIEWER') {
    const list = await taskListRepository.findById(listId);
    if (!list) throw new NotFoundError('TaskList', listId);

    if (String(list.ownerId) === String(userId)) return;

    if (list.type === 'PERSONAL') {
      throw new AppError('Access denied to this task list', 403, ERROR_CODES.TASK_ACCESS_DENIED);
    }

    const membership = await TaskListMember.findOne({ listId, userId }).lean();
    if (!membership) {
      throw new AppError('Access denied to this task list', 403, ERROR_CODES.TASK_ACCESS_DENIED);
    }

    const roleHierarchy = { VIEWER: 0, EDITOR: 1, ADMIN: 2 };
    if (roleHierarchy[membership.role] < roleHierarchy[requiredRole]) {
      throw new AppError('Insufficient role for this action', 403, ERROR_CODES.TASK_ACCESS_DENIED);
    }
  }

  async _invalidateListCache(id) {
    await cacheManager.del(`tasks:list:${id}`);
  }

  async _invalidateUserListCache(userId) {
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}tasks:lists:user:${userId}`);
  }
}

const taskListService = new TaskListService();
export default taskListService;
