import type { UseMutationResult } from '@tanstack/react-query';

type Mutation<TVariables> = UseMutationResult<unknown, Error, TVariables, unknown>;

export function useTaskListMutations(): {
  createList: Mutation<{ name: string; folderId?: string }>;
  updateList: Mutation<{ id: string; data: Record<string, unknown> }>;
  removeList: Mutation<string>;
  archiveList: Mutation<string>;
};

export function useTaskMutations(): {
  createTask: Mutation<Record<string, unknown>>;
  updateTask: Mutation<{ id: string; data: Record<string, unknown> }>;
  removeTask: Mutation<string>;
  changeStatus: Mutation<{ id: string; status: string }>;
  completeTask: Mutation<{ id: string; completeSubtasks?: boolean }>;
  reopenTask: Mutation<string>;
  bulkUpdateStatus: Mutation<{ taskIds: string[]; status: string }>;
  bulkUpdatePriority: Mutation<{ taskIds: string[]; priority: string }>;
  bulkDelete: Mutation<string[]>;
  createSubtask: Mutation<{ parentId: string; data: Record<string, unknown> }>;
};

export function useTaskNoteMutations(taskId: string): {
  createNote: Mutation<string>;
  updateNote: Mutation<{ noteId: string; content: string }>;
  deleteNote: Mutation<string>;
};
