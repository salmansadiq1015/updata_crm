import { taskApi, normalizeTask } from '@/modules/tasks/services/task-api';
import { rawTaskListSchema } from '@/modules/tasks/schemas/task-schemas';
import { generateId } from '@/lib/utils/ids';
import { db, enqueueSync } from '../db/mobile-db';
import {
  SYNC_ENTITY_TYPE,
  SYNC_OPERATION,
  SYNC_PRIORITY,
  SYNC_STATUS,
} from '../constants/mobile-constants';

const TASK_SYNC_EPOCH = '1970-01-01T00:00:00.000Z';
const ACTIVE_STATUSES = new Set(['OPEN', 'IN_PROGRESS', 'ON_HOLD']);
const VALID_STATUSES = new Set(['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED']);
const VALID_PRIORITIES = new Set(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT']);

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeTaskListRecord(value, syncTimestamp) {
  const list = rawTaskListSchema.parse(value);
  return {
    ...list,
    _id: list.id,
    owner_id: list.ownerId,
    is_archived: list.isArchived,
    updated_at: value?.updatedAt || value?.updated_at || syncTimestamp,
    last_synced_at: syncTimestamp,
  };
}

export function normalizeMobileTaskRecord(value, options = {}) {
  const syncTimestamp = Object.prototype.hasOwnProperty.call(options, 'lastSyncedAt')
    ? options.lastSyncedAt
    : new Date().toISOString();
  const syncStatus = options.syncStatus || SYNC_STATUS.SYNCED;
  const deleted = isRecord(value) && (value.isDeleted === true || value.is_deleted === true);
  const task = normalizeTask(value);

  return {
    ...task,
    _id: task.id,
    list_id: task.listId,
    project_id: task.projectId,
    order_id: task.orderId,
    parent_task_id: task.parentTaskId,
    assignee_id: task.assigneeId,
    due_date: task.dueDate,
    updated_at: task.updatedAt,
    created_at: task.createdAt,
    is_deleted: deleted,
    sync_status: syncStatus,
    last_synced_at: syncTimestamp,
  };
}

function toTaskPage(records) {
  const data = records
    .filter((record) => !record.is_deleted)
    .map((record) => ({
      ...normalizeTask(record),
      sync_status: record.sync_status,
    }));

  return {
    data,
    pagination: { hasNext: false, nextCursor: null, limit: data.length },
  };
}

function buildLocalTask(input, id = generateId()) {
  const now = new Date().toISOString();
  return normalizeMobileTaskRecord(
    {
      id,
      title: String(input.title || '').trim(),
      description: input.description || null,
      status: VALID_STATUSES.has(input.status) ? input.status : 'OPEN',
      priority: VALID_PRIORITIES.has(input.priority) ? input.priority : 'NONE',
      listId: input.listId || null,
      assigneeId: input.assigneeId || null,
      projectId: input.projectId || null,
      orderId: input.orderId || null,
      parentTaskId: input.parentTaskId || null,
      startDate: input.startDate || null,
      dueDate: input.dueDate || null,
      sortOrder: Number.isFinite(input.sortOrder) ? input.sortOrder : 0,
      depth: Number.isFinite(input.depth) ? input.depth : 0,
      subtaskCount: 0,
      noteCount: 0,
      attachmentCount: 0,
      version: 0,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      completedBy: null,
      cancelledAt: null,
    },
    { syncStatus: SYNC_STATUS.PENDING_SYNC, lastSyncedAt: null },
  );
}

function applyLocalPatch(record, patch) {
  const now = new Date().toISOString();
  const next = {
    ...record,
    ...patch,
    id: record.id,
    _id: record.id,
    version: (record.version || 0) + 1,
    updatedAt: now,
    updated_at: now,
    sync_status: SYNC_STATUS.PENDING_SYNC,
  };

  if ('listId' in patch) next.list_id = patch.listId || null;
  if ('projectId' in patch) next.project_id = patch.projectId || null;
  if ('orderId' in patch) next.order_id = patch.orderId || null;
  if ('parentTaskId' in patch) next.parent_task_id = patch.parentTaskId || null;
  if ('assigneeId' in patch) next.assignee_id = patch.assigneeId || null;
  if ('dueDate' in patch) next.due_date = patch.dueDate || null;

  if (patch.status === 'COMPLETED' && !record.completedAt) {
    next.completedAt = now;
  }
  if (patch.status !== 'COMPLETED') {
    next.completedAt = null;
  }

  return normalizeMobileTaskRecord(next, {
    syncStatus: SYNC_STATUS.PENDING_SYNC,
    lastSyncedAt: record.last_synced_at || null,
  });
}

function cleanTaskPayload(input) {
  const payload = {};
  for (const key of [
    'title',
    'description',
    'status',
    'priority',
    'listId',
    'assigneeId',
    'projectId',
    'orderId',
    'startDate',
    'dueDate',
    'sortOrder',
  ]) {
    if (key in input) payload[key] = input[key];
  }
  return payload;
}

export async function upsertMobileTasks(tasks, syncTimestamp = new Date().toISOString()) {
  if (!Array.isArray(tasks) || tasks.length === 0) return;

  const deletes = [];
  const puts = [];
  for (const value of tasks) {
    if (!isRecord(value)) continue;
    const id = String(value.id || value._id || '');
    if (!id) continue;
    if (value.isDeleted === true || value.is_deleted === true) {
      deletes.push(id);
    } else {
      puts.push(normalizeMobileTaskRecord(value, { lastSyncedAt: syncTimestamp }));
    }
  }

  await db.transaction('rw', db.tasks, async () => {
    if (deletes.length > 0) await db.tasks.bulkDelete(deletes);
    if (puts.length > 0) await db.tasks.bulkPut(puts);
  });
}

export async function upsertMobileTaskLists(taskLists, syncTimestamp = new Date().toISOString()) {
  if (!Array.isArray(taskLists) || taskLists.length === 0) return;
  await db.taskLists.bulkPut(taskLists.map((list) => normalizeTaskListRecord(list, syncTimestamp)));
}

export const mobileTaskService = {
  async listTasks(params = {}) {
    const { hideCompleted, ...apiParams } = params;
    void hideCompleted;
    const page = await taskApi.list({
      limit: 100,
      sortBy: 'dueDate',
      sortOrder: 'asc',
      ...apiParams,
    });
    await upsertMobileTasks(page.data);
    return page;
  },

  async listLocalTasks(params = {}) {
    let records = await db.tasks.orderBy('updated_at').reverse().toArray();
    records = records.filter((task) => !task.is_deleted);

    if (params.status && params.status !== 'ALL') {
      records = records.filter((task) => task.status === params.status);
    } else if (params.hideCompleted) {
      records = records.filter((task) => ACTIVE_STATUSES.has(task.status));
    }

    if (params.priority && params.priority !== 'ALL') {
      records = records.filter((task) => task.priority === params.priority);
    }

    const query = String(params.q || '').trim().toLowerCase();
    if (query) {
      records = records.filter((task) => {
        const haystack = `${task.title || ''} ${task.description || ''}`.toLowerCase();
        return haystack.includes(query);
      });
    }

    records.sort((a, b) => {
      const left = a.due_date || '9999-12-31T23:59:59.999Z';
      const right = b.due_date || '9999-12-31T23:59:59.999Z';
      return left.localeCompare(right);
    });

    return toTaskPage(records.slice(0, params.limit || 100));
  },

  async createTask(input) {
    const task = await taskApi.create(cleanTaskPayload(input));
    await upsertMobileTasks([task]);
    return task;
  },

  async updateTask(id, patch) {
    const task = await taskApi.patch(id, cleanTaskPayload(patch));
    await upsertMobileTasks([task]);
    return task;
  },

  async deleteTask(id) {
    await taskApi.remove(id);
    await db.tasks.delete(id);
    return { deleted: true };
  },

  async createLocalTask(input) {
    const task = buildLocalTask(input);
    await db.tasks.put(task);
    await enqueueSync(
      SYNC_ENTITY_TYPE.TASK,
      task.id,
      SYNC_OPERATION.CREATE,
      { data: cleanTaskPayload({ ...input, title: task.title }) },
      SYNC_PRIORITY[SYNC_ENTITY_TYPE.TASK],
    );
    return { ...normalizeTask(task), sync_status: task.sync_status };
  },

  async updateLocalTask(id, patch) {
    const existing = await db.tasks.get(id);
    if (!existing) throw new Error('Task not found in local cache');
    const updated = applyLocalPatch(existing, cleanTaskPayload(patch));
    await db.tasks.put(updated);
    await enqueueSync(
      SYNC_ENTITY_TYPE.TASK,
      id,
      SYNC_OPERATION.UPDATE,
      { data: cleanTaskPayload(patch) },
      SYNC_PRIORITY[SYNC_ENTITY_TYPE.TASK],
    );
    return { ...normalizeTask(updated), sync_status: updated.sync_status };
  },

  async deleteLocalTask(id) {
    const existing = await db.tasks.get(id);
    if (existing) {
      await db.tasks.put({
        ...existing,
        is_deleted: true,
        sync_status: SYNC_STATUS.PENDING_SYNC,
        updatedAt: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    await enqueueSync(
      SYNC_ENTITY_TYPE.TASK,
      id,
      SYNC_OPERATION.DELETE,
      { data: { id } },
      SYNC_PRIORITY[SYNC_ENTITY_TYPE.TASK],
    );
    return { deleted: true };
  },

  getSyncEpoch() {
    return TASK_SYNC_EPOCH;
  },
};
