import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { rawTaskListSchema, rawTaskSchema } from '../schemas/task-schemas';
import type {
  ReminderDefaults,
  Task,
  TaskAttachment,
  TaskContextOption,
  TaskDashboard,
  TaskDashboardStats,
  TaskList,
  TaskListMember,
  TaskListParams,
  TaskNote,
  TaskPage,
  TaskPatch,
  TaskProjectSummary,
  TaskReminder,
  TaskReminderInput,
  TaskSyncChange,
  TaskSyncResult,
} from '../types/task-types';

type ApiEnvelope<T> = {
  data?: T;
  pagination?: TaskPage['pagination'] | null;
};

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const toApiResponse = <T>(value: unknown): ApiEnvelope<T> => value as ApiEnvelope<T>;

const readRecord = (value: unknown): UnknownRecord => (isRecord(value) ? value : {});

const unwrapData = (value: unknown): unknown => {
  const record = readRecord(value);
  return 'data' in record ? record.data : value;
};

const readString = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
};

const readNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const readBoolean = (value: unknown, fallback = false): boolean =>
  typeof value === 'boolean' ? value : fallback;

const readId = (value: unknown): string => {
  if (isRecord(value)) return readString(value._id ?? value.id);
  return readString(value);
};

const readIso = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
};

const readIsoOrNull = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null;
  return readIso(value);
};

const readArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const envelopeData = <T>(value: unknown, fallback: T): T => {
  const response = toApiResponse<T>(value);
  return response.data ?? fallback;
};

export const normalizeTask = (value: unknown): Task => rawTaskSchema.parse(value);

const parseTaskArray = (value: unknown): Task[] => readArray(value).map(normalizeTask);

const normalizeTaskNote = (value: unknown, taskId: string, fallbackBody = ''): TaskNote => {
  const item = readRecord(value);
  return {
    id: readId(item._id ?? item.id),
    taskId: readId(item.taskId) || taskId,
    authorId: readId(item.authorId),
    bodyHtml: readString(item.bodyHtml, fallbackBody),
    isEdited: readBoolean(item.isEdited),
    mentions: readArray(item.mentions).map((mention) => readString(mention)).filter(Boolean),
    createdAt: readIso(item.createdAt),
    updatedAt: readIso(item.updatedAt),
  };
};

const normalizeTaskAttachment = (value: unknown, taskId: string): TaskAttachment => {
  const item = readRecord(value);
  const id = readId(item._id ?? item.id);
  const base = (apiClient.defaults?.baseURL ?? '').replace(/\/$/, '');
  return {
    id,
    taskId: readId(item.taskId) || taskId,
    fileName: readString(item.fileName ?? item.filename, 'file'),
    fileSize: readNumber(item.fileSize),
    mimeType: readString(item.mimeType, 'application/octet-stream'),
    uploadedBy: readId(item.uploadedBy),
    createdAt: readIso(item.createdAt),
    downloadUrl: `${base}/tasks/${taskId}/attachments/${id}/download`,
  };
};

const normalizeReminder = (value: unknown): TaskReminder => {
  const item = readRecord(value);
  return {
    id: readId(item._id ?? item.id),
    taskId: readId(item.taskId),
    userId: readId(item.userId),
    type: readString(item.type) === 'ABSOLUTE' ? 'ABSOLUTE' : 'RELATIVE',
    offsetMinutes: item.offsetMinutes === null || item.offsetMinutes === undefined ? null : readNumber(item.offsetMinutes),
    fireAt: readIso(item.fireAt),
    channels: readArray(item.channels)
      .map((channel) => readString(channel))
      .filter((channel): channel is TaskReminder['channels'][number] =>
        channel === 'PUSH' || channel === 'IN_APP' || channel === 'EMAIL',
      ),
    status: readString(item.status) as TaskReminder['status'],
    snoozedUntil: readIsoOrNull(item.snoozedUntil),
    firedAt: readIsoOrNull(item.firedAt),
    createdAt: readIso(item.createdAt),
    updatedAt: readIso(item.updatedAt),
  };
};

const normalizeTaskListMember = (value: unknown): TaskListMember => {
  const item = readRecord(value);
  return {
    id: readId(item._id ?? item.id),
    listId: readId(item.listId),
    userId: readId(item.userId),
    role: readString(item.role) as TaskListMember['role'],
    invitedBy: readId(item.invitedBy),
    joinedAt: readIso(item.joinedAt),
  };
};

const normalizeDashboard = (value: unknown): TaskDashboard => {
  const record = readRecord(value);
  return {
    overdue: parseTaskArray(record.overdue),
    dueToday: parseTaskArray(record.dueToday),
    upcoming: parseTaskArray(record.upcoming),
    recentlyCompleted: parseTaskArray(record.recentlyCompleted),
  };
};

const normalizeContextOption = (value: unknown, type: TaskContextOption['type']): TaskContextOption => {
  const item = readRecord(value);
  const id = readId(item._id ?? item.id);
  const number = readString(
    item.projectNumber ?? item.orderNumber ?? item.assignmentNumber ?? item.documentNumber,
    '',
  );
  const title = readString(item.name ?? item.title ?? item.customerName, number || id);
  return {
    id,
    type,
    label: number ? `${number} - ${title}` : title,
    number,
    status: readString(item.status),
  };
};

export const taskApi = {
  async list(params: TaskListParams): Promise<TaskPage> {
    const response = toApiResponse<unknown[]>(await apiClient.get(ENDPOINTS.TASKS.LIST, { params }));
    return {
      data: parseTaskArray(response.data),
      pagination: response.pagination ?? {
        hasNext: false,
        nextCursor: null,
        limit: params.limit ?? 50,
      },
    };
  },

  async lists(): Promise<TaskList[]> {
    const response = toApiResponse<unknown>(await apiClient.get(ENDPOINTS.TASK_LISTS.LIST));
    const payload = response.data;
    const items = Array.isArray(payload)
      ? payload
      : isRecord(payload)
        ? [
            ...readArray(payload.personal),
            ...readArray(payload.group),
          ]
        : [];
    return items.map((item) => rawTaskListSchema.parse(item));
  },

  async detail(id: string): Promise<Task> {
    const response = toApiResponse<unknown>(await apiClient.get(ENDPOINTS.TASKS.BY_ID(id)));
    return normalizeTask(response.data);
  },

  async create(data: Pick<Task, 'title'> & Partial<TaskPatch>): Promise<Task> {
    const response = toApiResponse<unknown>(await apiClient.post(ENDPOINTS.TASKS.LIST, data));
    return normalizeTask(response.data);
  },

  async patch(id: string, patch: TaskPatch): Promise<Task> {
    const changedKeys = Object.keys(patch).filter((key) =>
      !['expectedVersion', 'completeSubtasks', 'completeParentOnly'].includes(key),
    );
    const statusEndpointKeys = new Set(['status', 'sortOrder']);
    if (patch.status && changedKeys.every((key) => statusEndpointKeys.has(key))) {
      return taskApi.changeStatus(id, patch.status, {
        expectedVersion: patch.expectedVersion,
        completeSubtasks: patch.completeSubtasks,
        completeParentOnly: patch.completeParentOnly,
        sortOrder: patch.sortOrder,
      });
    }
    const response = toApiResponse<unknown>(await apiClient.put(ENDPOINTS.TASKS.BY_ID(id), patch));
    return normalizeTask(response.data);
  },

  async changeStatus(
    id: string,
    status: Task['status'],
    options: { expectedVersion?: number; completeSubtasks?: boolean; completeParentOnly?: boolean; sortOrder?: number } = {},
  ): Promise<Task> {
    const response = toApiResponse<unknown>(
      await apiClient.patch(ENDPOINTS.TASKS.STATUS(id), { status, ...options }),
    );
    return normalizeTask(response.data);
  },

  async complete(
    id: string,
    options: { completeSubtasks?: boolean; completeParentOnly?: boolean } = {},
  ): Promise<Task> {
    const response = toApiResponse<unknown>(await apiClient.patch(ENDPOINTS.TASKS.COMPLETE(id), options));
    return normalizeTask(response.data);
  },

  async remove(id: string): Promise<{ deleted: boolean }> {
    const response = toApiResponse<{ deleted?: boolean }>(await apiClient.delete(ENDPOINTS.TASKS.BY_ID(id)));
    return { deleted: response.data?.deleted ?? true };
  },

  async uploadAttachment(taskId: string, file: File): Promise<{ id: string; filename: string; url: string }> {
    const form = new FormData();
    form.append('file', file);
    const response = toApiResponse<unknown>(
      await apiClient.post(ENDPOINTS.TASKS.ATTACHMENTS(taskId), form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    );
    const data = readRecord(response.data);
    return {
      id: readId(data._id ?? data.id),
      filename: readString(data.fileName ?? data.filename, file.name),
      url: readString(data.url),
    };
  },

  async batchPatch(updates: Array<{ id: string; patch: TaskPatch }>): Promise<Task[]> {
    const response = toApiResponse<unknown[]>(await apiClient.patch('/tasks/batch', { updates }));
    return parseTaskArray(response.data);
  },

  async duplicate(id: string): Promise<Task> {
    const source = await taskApi.detail(id);
    return taskApi.create({
      title: `Copy of ${source.title}`,
      ...(source.description ? { description: source.description } : {}),
      status: 'OPEN',
      priority: source.priority,
      ...(source.listId ? { listId: source.listId } : {}),
      ...(source.dueDate ? { dueDate: source.dueDate } : {}),
      ...(source.assigneeId ? { assigneeId: source.assigneeId } : {}),
      ...(source.projectId ? { projectId: source.projectId } : {}),
      ...(source.orderId ? { orderId: source.orderId } : {}),
    });
  },

  async listSubtasks(parentId: string): Promise<Task[]> {
    const response = toApiResponse<unknown[]>(await apiClient.get(ENDPOINTS.TASKS.SUBTASKS(parentId)));
    return parseTaskArray(response.data);
  },

  async createSubtask(parentId: string, data: { title: string; priority?: Task['priority']; status?: Task['status'] }): Promise<Task> {
    const response = toApiResponse<unknown>(await apiClient.post(ENDPOINTS.TASKS.SUBTASKS(parentId), data));
    return normalizeTask(response.data);
  },

  async promote(id: string): Promise<Task> {
    const response = toApiResponse<unknown>(await apiClient.patch(ENDPOINTS.TASKS.PROMOTE(id)));
    return normalizeTask(response.data);
  },

  async reorderSubtasks(parentId: string, orderedIds: string[]): Promise<{ reordered: boolean }> {
    const response = toApiResponse<{ reordered?: boolean }>(
      await apiClient.patch(ENDPOINTS.TASKS.REORDER(parentId), { orderedIds }),
    );
    return { reordered: response.data?.reordered ?? true };
  },

  async listNotes(taskId: string): Promise<TaskNote[]> {
    const response = toApiResponse<unknown[]>(await apiClient.get(ENDPOINTS.TASKS.NOTES(taskId)));
    return readArray(response.data).map((note) => normalizeTaskNote(note, taskId));
  },

  async createNote(taskId: string, bodyHtml: string): Promise<TaskNote> {
    const response = toApiResponse<unknown>(await apiClient.post(ENDPOINTS.TASKS.NOTES(taskId), { bodyHtml }));
    return normalizeTaskNote(response.data, taskId, bodyHtml);
  },

  async deleteNote(taskId: string, noteId: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.TASKS.NOTE_BY_ID(taskId, noteId));
  },

  async listAttachments(taskId: string): Promise<TaskAttachment[]> {
    const response = toApiResponse<unknown[]>(await apiClient.get(ENDPOINTS.TASKS.ATTACHMENTS(taskId)));
    return readArray(response.data).map((attachment) => normalizeTaskAttachment(attachment, taskId));
  },

  async deleteAttachment(taskId: string, attachmentId: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.TASKS.ATTACHMENT_BY_ID(taskId, attachmentId));
  },

  async listReminders(taskId: string): Promise<TaskReminder[]> {
    const response = toApiResponse<unknown[]>(await apiClient.get(ENDPOINTS.TASKS.REMINDERS(taskId)));
    return readArray(response.data).map(normalizeReminder);
  },

  async createReminder(taskId: string, input: TaskReminderInput): Promise<TaskReminder> {
    const response = toApiResponse<unknown>(await apiClient.post(ENDPOINTS.TASKS.REMINDERS(taskId), input));
    return normalizeReminder(response.data);
  },

  async deleteReminder(taskId: string, reminderId: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.TASKS.REMINDER_BY_ID(taskId, reminderId));
  },

  async snoozeReminder(taskId: string, reminderId: string, snoozeMinutes: number): Promise<TaskReminder> {
    const response = toApiResponse<unknown>(
      await apiClient.patch(ENDPOINTS.TASKS.REMINDER_SNOOZE(taskId, reminderId), { snoozeMinutes }),
    );
    return normalizeReminder(response.data);
  },

  async getReminderDefaults(): Promise<ReminderDefaults> {
    const response = toApiResponse<unknown>(await apiClient.get(ENDPOINTS.TASKS.REMINDER_DEFAULTS));
    const data = readRecord(response.data);
    return {
      enabled: readBoolean(data.enabled, true),
      defaultOffsetMinutes: readNumber(data.defaultOffsetMinutes, -1440),
      defaultChannels: readArray(data.defaultChannels)
        .map((channel) => readString(channel))
        .filter((channel): channel is ReminderDefaults['defaultChannels'][number] =>
          channel === 'PUSH' || channel === 'IN_APP' || channel === 'EMAIL',
        ),
    };
  },

  async setReminderDefaults(input: ReminderDefaults): Promise<ReminderDefaults> {
    const response = toApiResponse<unknown>(await apiClient.put(ENDPOINTS.TASKS.REMINDER_DEFAULTS, input));
    const data = readRecord(response.data);
    return {
      enabled: readBoolean(data.enabled, input.enabled),
      defaultOffsetMinutes: readNumber(data.defaultOffsetMinutes, input.defaultOffsetMinutes),
      defaultChannels: readArray(data.defaultChannels)
        .map((channel) => readString(channel))
        .filter((channel): channel is ReminderDefaults['defaultChannels'][number] =>
          channel === 'PUSH' || channel === 'IN_APP' || channel === 'EMAIL',
        ),
    };
  },

  async dashboard(params: { projectId?: string; orderId?: string; upcomingDays?: number } = {}): Promise<TaskDashboard> {
    const response = toApiResponse<unknown>(await apiClient.get(ENDPOINTS.TASKS.DASHBOARD, { params }));
    return normalizeDashboard(response.data);
  },

  async dashboardStats(params: { projectId?: string; orderId?: string } = {}): Promise<TaskDashboardStats> {
    const response = toApiResponse<unknown>(await apiClient.get(ENDPOINTS.TASKS.DASHBOARD_STATS, { params }));
    const data = readRecord(response.data);
    return {
      totalOpen: readNumber(data.totalOpen),
      completedThisWeek: readNumber(data.completedThisWeek),
      overdueCount: readNumber(data.overdueCount),
      totalTasks: readNumber(data.totalTasks),
    };
  },

  async sync(since: string): Promise<{ tasks: Task[]; taskLists: TaskList[]; timestamp: string }> {
    const response = toApiResponse<unknown>(await apiClient.get(ENDPOINTS.TASKS.SYNC, { params: { since } }));
    const data = readRecord(response.data);
    return {
      tasks: parseTaskArray(data.tasks),
      taskLists: readArray(data.taskLists).map((list) => rawTaskListSchema.parse(list)),
      timestamp: readString(data.timestamp, new Date().toISOString()),
    };
  },

  async pushSync(changes: TaskSyncChange[]): Promise<TaskSyncResult> {
    const response = toApiResponse<unknown>(await apiClient.post(ENDPOINTS.TASKS.SYNC_PUSH, { changes }));
    const data = readRecord(response.data);
    return {
      applied: readNumber(data.applied),
      conflicts: readArray(data.conflicts).map((conflict) => {
        const item = readRecord(conflict);
        return {
          reason: readString(item.reason),
          change: readRecord(item.change) as TaskSyncChange,
        };
      }),
    };
  },

  async projectTasks(projectId: string, params: Omit<TaskListParams, 'projectId'> = {}): Promise<TaskPage> {
    const response = toApiResponse<unknown[]>(await apiClient.get(ENDPOINTS.TASKS.PROJECT_TASKS(projectId), { params }));
    return {
      data: parseTaskArray(response.data),
      pagination: response.pagination ?? { hasNext: false, nextCursor: null, limit: params.limit ?? 50 },
    };
  },

  async orderTasks(orderId: string, params: Omit<TaskListParams, 'orderId'> = {}): Promise<TaskPage> {
    const response = toApiResponse<unknown[]>(await apiClient.get(ENDPOINTS.TASKS.ORDER_TASKS(orderId), { params }));
    return {
      data: parseTaskArray(response.data),
      pagination: response.pagination ?? { hasNext: false, nextCursor: null, limit: params.limit ?? 50 },
    };
  },

  async projectSummary(projectId: string): Promise<TaskProjectSummary> {
    const response = toApiResponse<unknown>(await apiClient.get(ENDPOINTS.TASKS.PROJECT_TASK_SUMMARY(projectId)));
    const data = readRecord(response.data);
    return {
      total: readNumber(data.total),
      open: readNumber(data.open),
      inProgress: readNumber(data.inProgress),
      onHold: readNumber(data.onHold),
      completed: readNumber(data.completed),
      cancelled: readNumber(data.cancelled),
      completionRate: readNumber(data.completionRate),
    };
  },

  async crossProjectReport(limit = 100): Promise<TaskProjectSummary[]> {
    const response = toApiResponse<unknown[]>(await apiClient.get(ENDPOINTS.TASKS.PROJECT_TASK_REPORT, { params: { limit } }));
    return readArray(response.data).map((item) => {
      const data = readRecord(item);
      return {
        projectId: readId(data.projectId),
        projectName: readString(data.projectName),
        total: readNumber(data.total),
        open: readNumber(data.open),
        inProgress: readNumber(data.inProgress),
        onHold: readNumber(data.onHold),
        completed: readNumber(data.completed),
        cancelled: readNumber(data.cancelled),
        completionRate: readNumber(data.completionRate),
      };
    });
  },

  async searchProjects(query: string): Promise<TaskContextOption[]> {
    const response = await apiClient.get(ENDPOINTS.PM.PROJECTS_SEARCH, { params: { q: query, limit: 10 } });
    return readArray(unwrapData(response)).map((item) => normalizeContextOption(item, 'project'));
  },

  async searchOrders(query: string): Promise<TaskContextOption[]> {
    const response = await apiClient.get(ENDPOINTS.QOP.ORDERS, { params: { q: query, limit: 10 } });
    const payload = unwrapData(response);
    const list = isRecord(payload) ? readArray(payload.orders ?? payload.data) : readArray(payload);
    return list.map((item) => normalizeContextOption(item, 'order'));
  },

  async listMembers(listId: string): Promise<TaskListMember[]> {
    const response = toApiResponse<unknown[]>(await apiClient.get(ENDPOINTS.TASK_LISTS.MEMBERS(listId)));
    return readArray(response.data).map(normalizeTaskListMember);
  },

  async addMember(listId: string, userId: string, role: TaskListMember['role']): Promise<TaskListMember> {
    const response = toApiResponse<unknown>(await apiClient.post(ENDPOINTS.TASK_LISTS.MEMBERS(listId), { userId, role }));
    return normalizeTaskListMember(response.data);
  },

  async updateMemberRole(listId: string, userId: string, role: TaskListMember['role']): Promise<TaskListMember> {
    const response = toApiResponse<unknown>(await apiClient.put(ENDPOINTS.TASK_LISTS.MEMBER(listId, userId), { role }));
    return normalizeTaskListMember(response.data);
  },

  async removeMember(listId: string, userId: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.TASK_LISTS.MEMBER(listId, userId));
  },

  async transferOwnership(listId: string, newOwnerId: string): Promise<TaskList> {
    const response = toApiResponse<unknown>(
      await apiClient.post(ENDPOINTS.TASK_LISTS.TRANSFER_OWNERSHIP(listId), { newOwnerId }),
    );
    return rawTaskListSchema.parse(response.data);
  },

  async leaveList(listId: string): Promise<void> {
    await apiClient.post(ENDPOINTS.TASK_LISTS.LEAVE(listId));
  },
};
