'use client';

import { useEffect } from 'react';
import { type InfiniteData, useQueryClient } from '@tanstack/react-query';
import type { Socket } from 'socket.io-client';
import { getSocket, onSocketConnect } from '@/lib/socket/client';
import { taskWorkspaceKeys } from './use-task-workspace';
import { normalizeTask } from '../services/task-api';
import type { Task, TaskListParams, TaskPage, TaskRealtimeEvent } from '../types/task-types';

const isNewer = (incomingVersion: number, currentVersion: number) => incomingVersion >= currentVersion;

const taskMatchesParams = (task: Task, params: Omit<TaskListParams, 'cursor'> | undefined) => {
  if (!params) return false;
  if (params.active && !['OPEN', 'IN_PROGRESS', 'ON_HOLD'].includes(task.status)) return false;
  if (params.completedThisWeek) {
    const now = new Date();
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getDay() + 6) % 7);
    if (task.status !== 'COMPLETED' || !task.completedAt || new Date(task.completedAt) < monday) return false;
  }
  if (params.listId && task.listId !== params.listId) return false;
  if (params.status && task.status !== params.status) return false;
  if (params.priority && task.priority !== params.priority) return false;
  if (params.assigneeId && task.assigneeId !== params.assigneeId) return false;
  if (params.departmentId && (task.departmentId?.id ?? task.departmentId?._id ?? task.departmentId) !== params.departmentId) return false;
  if (params.inPool && !task.inPool) return false;
  if (params.overdue && (!task.dueDate || new Date(task.dueDate) >= new Date() || ['COMPLETED', 'CANCELLED'].includes(task.status))) return false;
  if (params.dueToday) {
    const due = task.dueDate && new Date(task.dueDate);
    if (!due || due.toDateString() !== new Date().toDateString()) return false;
  }
  if (params.hasParent === false && task.parentTaskId) return false;
  if (params.hasParent === true && !task.parentTaskId) return false;
  if (params.q) {
    const q = params.q.toLowerCase();
    const haystack = `${task.title} ${task.description ?? ''}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
};

const normalizeRealtimeEvent = (payload: TaskRealtimeEvent): TaskRealtimeEvent => {
  if (payload.type === 'task_deleted') return payload;
  return payload.task ? { ...payload, task: normalizeTask(payload.task) } : payload;
};

const mergeTaskEvent = (
  oldData: InfiniteData<TaskPage> | undefined,
  event: TaskRealtimeEvent,
  params: Omit<TaskListParams, 'cursor'> | undefined,
): InfiniteData<TaskPage> | undefined => {
  if (!oldData) return oldData;
  if (event.type === 'task_deleted') {
    return {
      ...oldData,
      pages: oldData.pages.map((page) => ({
        ...page,
        data: page.data.filter((task) => task.id !== event.taskId),
      })),
    };
  }

  if (!event.task) return oldData;

  let wasPatched = false;
  const pages = oldData.pages.map((page) => ({
    ...page,
    data: page.data
      .map((task) => {
        if (task.id !== event.taskId) return task;
        wasPatched = true;
        if (!isNewer(event.version, task.version)) return task;
        return taskMatchesParams(event.task as Task, params) ? event.task as Task : null;
      })
      .filter((task): task is Task => task !== null),
  }));

  if (wasPatched) return { ...oldData, pages };

  const [firstPage, ...restPages] = pages;
  if (!firstPage || event.type !== 'task_created' || !taskMatchesParams(event.task, params)) return { ...oldData, pages };

  return {
    ...oldData,
    pages: [
      {
        ...firstPage,
        data: [event.task, ...firstPage.data].slice(0, firstPage.pagination.limit),
      },
      ...restPages,
    ],
  };
};

export function useTaskRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const applyEvent = (payload: TaskRealtimeEvent) => {
      const event = normalizeRealtimeEvent(payload);
      queryClient.invalidateQueries({ queryKey: ['tasks', 'dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['task-time'] });
      queryClient.invalidateQueries({ queryKey: taskWorkspaceKeys.windows() });
      const windows = queryClient.getQueriesData<InfiniteData<TaskPage>>({ queryKey: taskWorkspaceKeys.windows() });
      for (const [queryKey, oldData] of windows) {
        const params = queryKey[3] as Omit<TaskListParams, 'cursor'> | undefined;
        queryClient.setQueryData(queryKey, mergeTaskEvent(oldData, event, params));
      }

      if (event.type !== 'task_deleted' && event.task) {
        queryClient.setQueryData(taskWorkspaceKeys.detail(event.taskId), (current: Task | undefined) => {
          if (!current) return event.task;
          return isNewer(event.version, current.version) ? event.task : current;
        });
      }

      if (event.type === 'task_deleted') {
        queryClient.removeQueries({ queryKey: taskWorkspaceKeys.detail(event.taskId) });
      }
    };

    const register = (socket: Socket | null = getSocket() as Socket | null) => {
      socket?.off('task_created', applyEvent);
      socket?.off('task_updated', applyEvent);
      socket?.off('task_deleted', applyEvent);
      socket?.off('task_moved', applyEvent);
      socket?.off('task_reordered', applyEvent);
      socket?.on('task_created', applyEvent);
      socket?.on('task_updated', applyEvent);
      socket?.on('task_deleted', applyEvent);
      socket?.on('task_moved', applyEvent);
      socket?.on('task_reordered', applyEvent);
    };

    register();
    const offConnect = onSocketConnect((socket: Socket) => {
      socket.emit('tasks:subscribe', { scope: 'workspace' });
      register(socket);
    });

    return () => {
      offConnect();
      const socket = getSocket();
      socket?.off('task_created', applyEvent);
      socket?.off('task_updated', applyEvent);
      socket?.off('task_deleted', applyEvent);
      socket?.off('task_moved', applyEvent);
      socket?.off('task_reordered', applyEvent);
      socket?.emit('tasks:unsubscribe', { scope: 'workspace' });
    };
  }, [queryClient]);
}
