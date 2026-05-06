'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { taskService } from '../services/task-service';
import { taskListService } from '../services/task-list-service';
import { taskApi } from '../services/task-api';

export function useTaskLists() {
  return useQuery({
    queryKey: ['tasks', 'workspace', 'lists'],
    queryFn: () => taskApi.lists(),
    staleTime: 90_000,
    gcTime: 10 * 60_000,
    select: (data) => (Array.isArray(data) ? data : []),
  });
}

export function useTaskListDetail(id) {
  return useQuery({
    queryKey: queryKeys.tasks.listDetail(id),
    queryFn: () => taskListService.getById(id),
    enabled: !!id,
  });
}

const selectArray = (data) => (Array.isArray(data) ? data : (data?.data ?? data?.items ?? []));
const selectOne = (data) => (data?.data ?? data);

export function useTasks(filters = {}) {
  return useQuery({
    queryKey: queryKeys.tasks.list(filters),
    queryFn: () => taskService.list(filters),
    staleTime: 30_000,
    select: selectArray,
  });
}

export function useTaskDetail(id) {
  return useQuery({
    queryKey: queryKeys.tasks.detail(id),
    queryFn: () => taskService.getById(id),
    enabled: !!id,
    select: selectOne,
  });
}

export function useTaskSubtasks(parentId) {
  return useQuery({
    queryKey: queryKeys.tasks.subtasks(parentId),
    queryFn: () => taskService.getSubtasks(parentId),
    enabled: !!parentId,
    select: selectArray,
  });
}

export function useTaskNotes(taskId) {
  return useQuery({
    queryKey: queryKeys.tasks.notes(taskId),
    queryFn: () => taskService.listNotes(taskId),
    enabled: !!taskId,
    select: selectArray,
  });
}

export function useTaskDashboard(filters = {}) {
  return useQuery({
    queryKey: queryKeys.tasks.dashboard(filters),
    queryFn: () => taskService.getDashboard(filters),
    staleTime: 60_000,
  });
}

export function useTaskStats(filters = {}) {
  return useQuery({
    queryKey: queryKeys.tasks.stats(filters),
    queryFn: () => taskService.getStats(filters),
    staleTime: 60_000,
  });
}
