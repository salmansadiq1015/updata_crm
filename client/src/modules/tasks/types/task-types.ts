export type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type TaskPriority = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type TaskViewType = 'list' | 'board' | 'calendar' | 'timeline';

export type TaskSortField = 'createdAt' | 'dueDate' | 'priority' | 'title' | 'sortOrder' | '_id';

export type SortOrder = 'asc' | 'desc';

export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  listId: string | null;
  assigneeId: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  parentTaskId: string | null;
  projectId: string | null;
  orderId: string | null;
  startDate: string | null;
  dueDate: string | null;
  sortOrder: number;
  depth: number;
  subtaskCount: number;
  noteCount: number;
  attachmentCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  completedBy: string | null;
  cancelledAt: string | null;
};

export type TaskList = {
  id: string;
  name: string;
  type: 'PERSONAL' | 'GROUP';
  ownerId: string | null;
  color: string | null;
  icon: string | null;
  sortOrder: number;
  isDefault: boolean;
  isArchived: boolean;
  openTaskCount: number;
};

export type TaskFilters = {
  workspaceId?: string;
  listId?: string;
  q?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string;
  projectId?: string;
  orderId?: string;
  dueToday?: boolean;
  overdue?: boolean;
  hasParent?: boolean;
};

export type TaskListParams = TaskFilters & {
  cursor?: string | null;
  limit?: number;
  sortBy?: TaskSortField;
  sortOrder?: SortOrder;
};

export type TaskPage = {
  data: Task[];
  pagination: {
    hasNext: boolean;
    nextCursor: string | null;
    limit: number;
  };
};

export type TaskPatch = Partial<
  Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'assigneeId' | 'startDate' | 'dueDate' | 'listId' | 'sortOrder'>
> & {
  expectedVersion?: number;
};

export type TaskRealtimeEvent =
  | {
      type: 'task_created' | 'task_updated' | 'task_moved' | 'task_reordered';
      workspaceId?: string;
      listId?: string | null;
      taskId: string;
      version: number;
      updatedAt: string;
      changedFields?: string[];
      task?: Task;
    }
  | {
      type: 'task_deleted';
      workspaceId?: string;
      listId?: string | null;
      taskId: string;
      version: number;
      updatedAt: string;
    };

export type TaskFolder = {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  sortOrder: number;
  ownerId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskFolderWithLists = TaskFolder & {
  lists: TaskList[];
};

export type TaskFolderCreate = {
  name: string;
  color?: string | null;
  icon?: string | null;
  sortOrder?: number;
};

export type TaskFolderPatch = Partial<Pick<TaskFolder, 'name' | 'color' | 'icon' | 'sortOrder'>>;

export type TaskNote = {
  id: string;
  taskId: string;
  authorId: string;
  bodyHtml: string;
  isEdited: boolean;
  mentions: string[];
  createdAt: string;
  updatedAt: string;
};

export type TaskAttachment = {
  id: string;
  taskId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: string;
  createdAt: string;
  downloadUrl: string;
};

