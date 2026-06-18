'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { taskService } from '../services/task-service';
import { taskListService } from '../services/task-list-service';
import toast from 'react-hot-toast';

function useInvalidate() {
  const qc = useQueryClient();
  return {
    lists:       ()   => qc.invalidateQueries({ queryKey: queryKeys.tasks.lists() }),
    allTasks:    ()   => qc.invalidateQueries({ queryKey: queryKeys.tasks.all() }),
    task:        (id) => qc.invalidateQueries({ queryKey: queryKeys.tasks.detail(id) }),
    orderTasks:  (orderId) => qc.invalidateQueries({ queryKey: ['tasks', 'byOrder', orderId] }),
    subtasks:    (parentId) => qc.invalidateQueries({ queryKey: queryKeys.tasks.subtasks(parentId) }),
    notes:       (taskId) => qc.invalidateQueries({ queryKey: queryKeys.tasks.notes(taskId) }),
  };
}

function normalizeId(value) {
  return value?._id || value?.id || value || '';
}

function mutationData(payload) {
  return payload?.data ?? payload;
}

// ── Task list mutations ───────────────────────────────────────────────────────

export function useTaskListMutations() {
  const inv = useInvalidate();

  const createList = useMutation({
    mutationFn: (data) => taskListService.create(data),
    onSuccess: () => { inv.lists(); toast.success('Liste erstellt'); },
    onError: () => toast.error('Liste konnte nicht erstellt werden'),
  });

  const updateList = useMutation({
    mutationFn: ({ id, data }) => taskListService.update(id, data),
    onSuccess: () => { inv.lists(); toast.success('Liste aktualisiert'); },
    onError: () => toast.error('Aktualisierung fehlgeschlagen'),
  });

  const removeList = useMutation({
    mutationFn: (id) => taskListService.remove(id),
    onSuccess: () => { inv.lists(); toast.success('Liste gelöscht'); },
    onError: () => toast.error('Löschen fehlgeschlagen'),
  });

  const archiveList = useMutation({
    mutationFn: (id) => taskListService.archive(id),
    onSuccess: () => { inv.lists(); toast.success('Liste archiviert'); },
    onError: () => toast.error('Archivieren fehlgeschlagen'),
  });

  return { createList, updateList, removeList, archiveList };
}

// ── Task mutations ────────────────────────────────────────────────────────────

export function useTaskMutations() {
  const inv = useInvalidate();

  const createTask = useMutation({
    mutationFn: (data) => taskService.create(data),
    onSuccess: (_, data) => {
      inv.allTasks();
      if (data?.orderId) inv.orderTasks(data.orderId);
      toast.success('Aufgabe erstellt');
    },
    onError: () => toast.error('Aufgabe konnte nicht erstellt werden'),
  });

  const updateTask = useMutation({
    mutationFn: ({ id, data }) => taskService.update(id, data),
    onSuccess: (_, { id, data }) => {
      inv.allTasks();
      inv.task(id);
      if (data?.orderId) inv.orderTasks(data.orderId);
      toast.success('Aufgabe aktualisiert');
    },
    onError: () => toast.error('Aktualisierung fehlgeschlagen'),
  });

  const removeTask = useMutation({
    mutationFn: (id) => taskService.remove(id),
    onSuccess: () => { inv.allTasks(); toast.success('Aufgabe gelöscht'); },
    onError: () => toast.error('Löschen fehlgeschlagen'),
  });

  const changeStatus = useMutation({
    mutationFn: ({ id, status }) => taskService.changeStatus(id, status),
    onSuccess: (result, { id }) => {
      const task = mutationData(result);
      inv.allTasks();
      inv.task(id);
      if (task?.orderId) inv.orderTasks(normalizeId(task.orderId));
    },
    onError: () => toast.error('Status konnte nicht geändert werden'),
  });

  const completeTask = useMutation({
    mutationFn: ({ id, completeSubtasks }) => taskService.complete(id, completeSubtasks),
    onSuccess: (result, { id }) => {
      const task = mutationData(result);
      inv.allTasks();
      inv.task(id);
      inv.subtasks(id);
      if (task?.orderId) inv.orderTasks(normalizeId(task.orderId));
      toast.success('Aufgabe abgeschlossen');
    },
    onError: () => toast.error('Abschließen fehlgeschlagen'),
  });

  const reopenTask = useMutation({
    mutationFn: (id) => taskService.reopen(id),
    onSuccess: (result, id) => {
      const task = mutationData(result);
      inv.allTasks();
      inv.task(id);
      if (task?.orderId) inv.orderTasks(normalizeId(task.orderId));
      toast.success('Aufgabe wieder geöffnet');
    },
    onError: () => toast.error('Wieder öffnen fehlgeschlagen'),
  });

  const bulkUpdateStatus = useMutation({
    mutationFn: ({ taskIds, status }) => taskService.bulk('updateStatus', taskIds, { status }),
    onSuccess: () => { inv.allTasks(); toast.success('Status aktualisiert'); },
    onError: () => toast.error('Massenaktualisierung fehlgeschlagen'),
  });

  const bulkUpdatePriority = useMutation({
    mutationFn: ({ taskIds, priority }) => taskService.bulk('updatePriority', taskIds, { priority }),
    onSuccess: () => { inv.allTasks(); toast.success('Priorität aktualisiert'); },
    onError: () => toast.error('Massenaktualisierung fehlgeschlagen'),
  });

  const bulkDelete = useMutation({
    mutationFn: (taskIds) => taskService.bulk('delete', taskIds),
    onSuccess: () => { inv.allTasks(); toast.success('Aufgaben gelöscht'); },
    onError: () => toast.error('Massenlöschung fehlgeschlagen'),
  });

  const createSubtask = useMutation({
    mutationFn: ({ parentId, data }) => taskService.createSubtask(parentId, data),
    onSuccess: (_, { parentId }) => { inv.subtasks(parentId); inv.task(parentId); toast.success('Unteraufgabe erstellt'); },
    onError: () => toast.error('Unteraufgabe konnte nicht erstellt werden'),
  });

  return {
    createTask, updateTask, removeTask,
    changeStatus, completeTask, reopenTask,
    bulkUpdateStatus, bulkUpdatePriority, bulkDelete,
    createSubtask,
  };
}

// ── Task note mutations ───────────────────────────────────────────────────────

export function useTaskNoteMutations(taskId) {
  const inv = useInvalidate();

  const createNote = useMutation({
    mutationFn: (content) => taskService.createNote(taskId, content),
    onSuccess: () => { inv.notes(taskId); },
    onError: () => toast.error('Notiz konnte nicht erstellt werden'),
  });

  const updateNote = useMutation({
    mutationFn: ({ noteId, content }) => taskService.updateNote(taskId, noteId, content),
    onSuccess: () => { inv.notes(taskId); },
    onError: () => toast.error('Notiz konnte nicht aktualisiert werden'),
  });

  const deleteNote = useMutation({
    mutationFn: (noteId) => taskService.deleteNote(taskId, noteId),
    onSuccess: () => { inv.notes(taskId); toast.success('Notiz gelöscht'); },
    onError: () => toast.error('Löschen fehlgeschlagen'),
  });

  return { createNote, updateNote, deleteNote };
}
