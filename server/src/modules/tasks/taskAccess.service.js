import taskRepository from './task.repository.js';
import taskListRepository from './taskList.repository.js';
import TaskListMember from './taskListMember.model.js';
import { AppError, NotFoundError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';

const ROLE_RANK = Object.freeze({ VIEWER: 0, EDITOR: 1, ADMIN: 2 });

function toId(value) {
  if (!value) return null;
  if (value._id) return value._id;
  return value;
}

function sameId(left, right) {
  const leftId = toId(left);
  const rightId = toId(right);
  if (!leftId || !rightId) return false;
  return String(leftId) === String(rightId);
}

function assertRole(membershipRole, requiredRole) {
  if (ROLE_RANK[membershipRole] < ROLE_RANK[requiredRole]) {
    throw new AppError('Insufficient role for this action', 403, ERROR_CODES.TASK_ACCESS_DENIED);
  }
}

class TaskAccessService {
  async getAccessibleListIds(userId, { includeArchived = true } = {}) {
    const [ownedLists, groupLists] = await Promise.all([
      taskListRepository.findByOwnerId(userId, { includeArchived }),
      taskListRepository.findGroupListsByUserId(userId),
    ]);

    const ids = new Map();
    for (const list of [...ownedLists, ...groupLists]) {
      if (list?._id) ids.set(String(list._id), list._id);
    }
    return Array.from(ids.values());
  }

  async assertListAccess(listOrId, userId, requiredRole = 'VIEWER') {
    const list = typeof listOrId === 'object'
      ? listOrId
      : await taskListRepository.findById(listOrId);

    if (!list) throw new NotFoundError('TaskList', listOrId);

    if (sameId(list.ownerId, userId)) return list;

    if (list.type === 'PERSONAL') {
      throw new AppError('Access denied to this task list', 403, ERROR_CODES.TASK_ACCESS_DENIED);
    }

    const membership = await TaskListMember.findOne({ listId: list._id, userId }).lean();
    if (!membership) {
      throw new AppError('Access denied to this task list', 403, ERROR_CODES.TASK_ACCESS_DENIED);
    }

    assertRole(membership.role, requiredRole);
    return list;
  }

  async assertTaskAccess(taskOrId, userId, requiredRole = 'VIEWER') {
    const task = typeof taskOrId === 'object'
      ? taskOrId
      : await taskRepository.findById(taskOrId);

    if (!task) throw new NotFoundError('Task', taskOrId);

    const list = await taskListRepository.findById(task.listId);
    if (!list) {
      if (sameId(task.createdBy, userId) || sameId(task.assigneeId, userId)) return task;
      throw new AppError('Access denied to this task', 403, ERROR_CODES.TASK_ACCESS_DENIED);
    }

    if (sameId(list.ownerId, userId)) return task;

    if (list.type === 'GROUP') {
      const membership = await TaskListMember.findOne({ listId: list._id, userId }).lean();
      if (!membership) {
        if (requiredRole === 'VIEWER' && (sameId(task.createdBy, userId) || sameId(task.assigneeId, userId))) {
          return task;
        }
        throw new AppError('Access denied to this task', 403, ERROR_CODES.TASK_ACCESS_DENIED);
      }
      assertRole(membership.role, requiredRole);
      return task;
    }

    if (sameId(task.createdBy, userId) || sameId(task.assigneeId, userId)) return task;

    throw new AppError('Access denied to this task', 403, ERROR_CODES.TASK_ACCESS_DENIED);
  }
}

const taskAccessService = new TaskAccessService();
export default taskAccessService;
