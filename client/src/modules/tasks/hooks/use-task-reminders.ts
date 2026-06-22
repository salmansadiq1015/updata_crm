'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { taskApi } from '../services/task-api';
import type { ReminderDefaults, TaskReminderInput } from '../types/task-types';

export const taskReminderKeys = {
  list: (taskId: string) => ['tasks', taskId, 'reminders'] as const,
  defaults: () => ['tasks', 'reminder-defaults'] as const,
};

export function useTaskReminders(taskId: string | null | undefined) {
  return useQuery({
    queryKey: taskReminderKeys.list(taskId ?? ''),
    queryFn: () => taskApi.listReminders(taskId!),
    enabled: Boolean(taskId),
    staleTime: 30_000,
  });
}

export function useCreateTaskReminder(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TaskReminderInput) => taskApi.createReminder(taskId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskReminderKeys.list(taskId) });
    },
  });
}

export function useDeleteTaskReminder(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reminderId: string) => taskApi.deleteReminder(taskId, reminderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskReminderKeys.list(taskId) });
    },
  });
}

export function useSnoozeTaskReminder(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reminderId, snoozeMinutes }: { reminderId: string; snoozeMinutes: number }) =>
      taskApi.snoozeReminder(taskId, reminderId, snoozeMinutes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskReminderKeys.list(taskId) });
    },
  });
}

export function useReminderDefaults() {
  return useQuery({
    queryKey: taskReminderKeys.defaults(),
    queryFn: () => taskApi.getReminderDefaults(),
    staleTime: 60_000,
  });
}

export function useUpdateReminderDefaults() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReminderDefaults) => taskApi.setReminderDefaults(input),
    onSuccess: (data) => {
      queryClient.setQueryData(taskReminderKeys.defaults(), data);
    },
  });
}
