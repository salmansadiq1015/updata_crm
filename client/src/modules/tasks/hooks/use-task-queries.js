'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { taskService } from '../services/task-service';
import { taskListService } from '../services/task-list-service';

export function useTaskLists() {
  return useQuery({
    queryKey: queryKeys.tasks.lists(),
    queryFn: () => taskListService.list(),
    staleTime: 60_000,
  });
}

export function useTaskListDetail(id) {
  return useQuery({
    queryKey: queryKeys.tasks.listDetail(id),
    queryFn: () => taskListService.getById(id),
    enabled: !!id,
  });
}

export function useTasks(filters = {}) {
  return useQuery({
    queryKey: queryKeys.tasks.list(filters),
    queryFn: () => taskService.list(filters),
    staleTime: 30_000,
  });
}

export function useTaskDetail(id) {
  return useQuery({
    queryKey: queryKeys.tasks.detail(id),
    queryFn: () => taskService.getById(id),
    enabled: !!id,
  });
}

export function useTaskSubtasks(parentId) {
  return useQuery({
    queryKey: queryKeys.tasks.subtasks(parentId),
    queryFn: () => taskService.getSubtasks(parentId),
    enabled: !!parentId,
  });
}

export function useTaskNotes(taskId) {
  return useQuery({
    queryKey: queryKeys.tasks.notes(taskId),
    queryFn: () => taskService.listNotes(taskId),
    enabled: !!taskId,
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
