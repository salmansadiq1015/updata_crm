'use client';

import DOMPurify from 'dompurify';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CalendarDays, Circle, CircleCheck, CircleDashed, CirclePause, CircleX, Copy, Flag, LifeBuoy, Loader2, Lock, LockOpen, MessagesSquare, UserPlus, CheckCheck, Link2, RefreshCw } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { useBreadcrumbLabel } from '@/stores/breadcrumb-store';
import { useAuthStore } from '@/stores/auth-store';
import { taskApi } from '../services/task-api';
import { useTaskDetailV2, taskWorkspaceKeys } from '../hooks/use-task-workspace';
import { useWorkspaceUsers } from '../hooks/use-workspace-users';
import { useTaskSubtasks, useCreateSubtask, usePatchSubtask } from '../hooks/use-task-subtasks';
import { useTaskNotes, useCreateNote, useDeleteNote } from '../hooks/use-task-notes';
import { useTaskAttachments, useUploadAttachment, useDeleteAttachment } from '../hooks/use-task-attachments';
import { TaskTimePanel } from './task-time-panel';
import { TaskSubtasksPanel } from './task-subtasks-panel';
import { TaskChatPanel } from './task-chat-panel';
import { TaskFileViewer } from './task-file-viewer';
import { TaskEmptyState } from './task-empty-state';
import { TaskInlineField } from './task-inline-field';
import { TaskRemindersPanel } from './task-reminders-panel';
import { TaskContextSelector } from './task-context-selector';
import { TaskCompletionDialog } from './task-completion-dialog';
import { TaskChatDialog } from '../components/task-chat-dialog';
import { taskService } from '../services/task-service';
import { TASK_SOURCE_META } from '../constants/task-source-meta';
import { AssigneeSelector } from './assignee-selector';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { parseTaskDueInput } from '../utils/task-date-parser';
import {
  useCreateTaskReminder,
  useDeleteTaskReminder,
  useSnoozeTaskReminder,
  useTaskReminders,
} from '../hooks/use-task-reminders';
import type { Task, TaskPatch } from '../types/task-types';
import {
  TASK_STATUSES, TASK_PRIORITIES,
  getTaskPriorityLabel, getTaskStatusLabel,
  taskStatusClass, taskPriorityClass,
  taskStatusIconColor, taskPriorityIconColor,
} from './task-ui-constants';

// ── Status icon map ──────────────────────────────────────────────────────────

const STATUS_ICON = {
  OPEN: Circle,
  IN_PROGRESS: CircleDashed,
  ON_HOLD: CirclePause,
  COMPLETED: CircleCheck,
  CANCELLED: CircleX,
} as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

const toDateValue = (iso: string | null | undefined) => iso ? iso.slice(0, 10) : '';
const formatDate = (iso: string | null | undefined, fallback = 'Not set') => {
  if (!iso || Number.isNaN(new Date(iso).getTime())) return fallback;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(iso));
};

// ── Props ────────────────────────────────────────────────────────────────────

type TaskDetailPageProps = {
  taskId: string;
  listId: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const getIncompleteSubtaskCount = (error: unknown): number | null => {
  if (!isRecord(error)) return null;
  const response = isRecord(error.response) ? error.response : null;
  const data = response && isRecord(response.data) ? response.data : error;
  if (!isRecord(data) || data.code !== 'TASK_INCOMPLETE_SUBTASKS') return null;
  return Array.isArray(data.details) ? data.details.length : 1;
};

// ── Component ────────────────────────────────────────────────────────────────

export function TaskDetailPage({ taskId, listId }: TaskDetailPageProps) {
  const { t, language } = useLanguage();
  const router = useRouter();
  const qc = useQueryClient();
  const currentUserId = useAuthStore((state: { user?: { _id?: string; id?: string } | null }) =>
    state.user?._id ?? state.user?.id ?? null,
  );

  // Data
  const taskQuery = useTaskDetailV2(taskId);
  const usersQuery = useWorkspaceUsers();
  const subtasksQuery = useTaskSubtasks(taskId);
  const notesQuery = useTaskNotes(taskId);
  const attachmentsQuery = useTaskAttachments(taskId);
  const remindersQuery = useTaskReminders(taskId);

  const task = taskQuery.data;
  const [chatOpen, setChatOpen] = useState(false);
  const { data: departments = [] } = useQuery<Array<{ _id: string; name: string; color?: string }>>({
    queryKey: ['tasks', 'departments'],
    queryFn: () => taskService.listDepartments(),
    staleTime: 300_000,
  });
  useBreadcrumbLabel(taskId, task?.title);
  const users = usersQuery.data ?? [];
  const backPath = listId === 'all' ? '/tasks' : `/tasks/${listId}`;

  // Description local edit state
  const [descEditMode, setDescEditMode] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [dueText, setDueText] = useState('');
  const [completionPrompt, setCompletionPrompt] = useState<{ patch: TaskPatch; count: number } | null>(null);

  // Patch the main task
  const patchMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TaskPatch }) => taskApi.patch(id, patch),
    onSuccess: (updated) => {
      qc.setQueryData(taskWorkspaceKeys.detail(taskId), updated);
      qc.invalidateQueries({ queryKey: taskWorkspaceKeys.windows() });
      qc.invalidateQueries({ queryKey: taskWorkspaceKeys.lists() });
      qc.invalidateQueries({ queryKey: ['tasks', 'dashboard'] });
      qc.invalidateQueries({ queryKey: ['task-time'] });
    },
    onError: (error, variables) => {
      const incompleteCount = getIncompleteSubtaskCount(error);
      if (variables.patch.status === 'COMPLETED' && incompleteCount !== null) {
        setCompletionPrompt({ patch: variables.patch, count: incompleteCount });
        return;
      }
      toast.error(t('tasks.updateFailed'));
    },
  });

  const patch = (p: TaskPatch) => {
    if (!task || patchMutation.isPending) return;
    patchMutation.mutate({ id: task.id, patch: { ...p, expectedVersion: task.version } });
  };

  // Lock / unlock (Sperrfunktion): confidential task stays with its owner.
  const lockMutation = useMutation({
    mutationFn: ({ id, locked, expectedVersion }: { id: string; locked: boolean; expectedVersion?: number }) =>
      taskApi.setLock(id, locked, expectedVersion),
    onSuccess: (updated) => {
      qc.setQueryData(taskWorkspaceKeys.detail(taskId), updated);
      qc.invalidateQueries({ queryKey: taskWorkspaceKeys.windows() });
      qc.invalidateQueries({ queryKey: taskWorkspaceKeys.lists() });
      qc.invalidateQueries({ queryKey: ['tasks', 'dashboard'] });
      qc.invalidateQueries({ queryKey: ['task-time'] });
    },
    onError: () => toast.error(t('tasks.updateFailed')),
  });

  const toggleLock = () => {
    if (!task) return;
    lockMutation.mutate({ id: task.id, locked: !task.locked, expectedVersion: task.version });
  };

  // Take over (Übernehmen): assign a non-locked task to myself.
  const claimMutation = useMutation({
    mutationFn: ({ id, expectedVersion }: { id: string; expectedVersion?: number }) =>
      taskApi.claim(id, expectedVersion),
    onSuccess: (updated) => {
      qc.setQueryData(taskWorkspaceKeys.detail(taskId), updated);
      qc.invalidateQueries({ queryKey: taskWorkspaceKeys.windows() });
      qc.invalidateQueries({ queryKey: taskWorkspaceKeys.lists() });
      qc.invalidateQueries({ queryKey: ['tasks', 'dashboard'] });
      qc.invalidateQueries({ queryKey: ['task-time'] });
      toast.success(t('tasks.claimed', 'Aufgabe übernommen'));
    },
    onError: () => toast.error(t('tasks.updateFailed')),
  });

  const canClaim = Boolean(task && !task.locked && currentUserId && task.assigneeId !== currentUserId);

  // Help from the pool (Aus Pool helfen): support an overdue pooled task —
  // the owner stays assigned, I am recorded as helper.
  const helpMutation = useMutation({
    mutationFn: ({ id, expectedVersion }: { id: string; expectedVersion?: number }) =>
      taskApi.help(id, expectedVersion),
    onSuccess: (updated) => {
      qc.setQueryData(taskWorkspaceKeys.detail(taskId), updated);
      qc.invalidateQueries({ queryKey: taskWorkspaceKeys.windows() });
      qc.invalidateQueries({ queryKey: taskWorkspaceKeys.lists() });
      qc.invalidateQueries({ queryKey: ['tasks', 'dashboard'] });
      qc.invalidateQueries({ queryKey: ['task-time'] });
      toast.success(t('tasks.pooledHelped', 'Sie unterstützen diese Aufgabe'));
    },
    onError: () => toast.error(t('tasks.updateFailed')),
  });

  const canHelp = Boolean(
    task && task.inPool && !task.locked && currentUserId
    && task.assigneeId !== currentUserId && task.poolHelperId !== currentUserId,
  );

  // Subtask mutations
  const createSubtask = useCreateSubtask();
  const patchSubtask = usePatchSubtask();
  const deleteSubtaskMut = useMutation({
    mutationFn: taskApi.remove,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', taskId, 'subtasks'] }),
  });

  // Notes mutations
  const createNote = useCreateNote(taskId);
  const deleteNote = useDeleteNote(taskId);

  // Attachment mutations
  const uploadAttachment = useUploadAttachment(taskId);
  const deleteAttachment = useDeleteAttachment(taskId);
  const createReminder = useCreateTaskReminder(taskId);
  const deleteReminder = useDeleteTaskReminder(taskId);
  const snoozeReminder = useSnoozeTaskReminder(taskId);

  const duplicateMutation = useMutation({
    mutationFn: () => taskApi.duplicate(taskId),
    onSuccess: (dup) => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      toast.success(t('tasks.duplicated'));
      router.push(`/tasks/${dup.listId ?? 'all'}/${dup.id}`);
    },
    onError: () => toast.error(t('tasks.updateFailed')),
  });

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success(t('tasks.linkCopied', 'Task link copied'));
    } catch {
      toast.error(t('tasks.copyLinkFailed', 'Could not copy the task link'));
    }
  };

  // Description save
  const saveDesc = () => {
    if (!task) return;
    patchMutation.mutate({ id: task.id, patch: { description: descDraft, expectedVersion: task.version } }, {
      onSuccess: () => setDescEditMode(false),
    });
  };

  const applyDueText = () => {
    const dueDate = parseTaskDueInput(dueText);
    if (!dueDate) {
      toast.error(t('tasks.invalidDueDate', 'Invalid due date'));
      return;
    }
    patch({ dueDate });
    setDueText('');
  };

  if (taskQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (taskQuery.isError && !task && !(isRecord(taskQuery.error) && taskQuery.error.statusCode === 404)) {
    return <TaskEmptyState type="error" onRetry={() => void taskQuery.refetch()} />;
  }

  if (!task) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-muted-foreground">{t('tasks.notFound')}</p>
        <Button variant="outline" onClick={() => router.push(backPath)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> {t('tasks.backToList')}
        </Button>
      </div>
    );
  }

  return (
    <div data-testid="task-detail" className="flex h-full min-h-0 min-w-0 flex-col bg-background">
      {/* ── Header ── */}
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-3 sm:px-6">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => router.push(backPath)}
        >
          <ArrowLeft className="h-4 w-4" />
          {t('common.back')}
        </Button>
        <div className="h-4 w-px bg-border" />
        <nav className="hidden min-w-0 items-center gap-1.5 text-xs text-muted-foreground xl:flex">
          <span>{t('tasks.title')}</span>
          <span>/</span>
          <span className="truncate max-w-32">{t('tasks.list')}</span>
          <span>/</span>
          <span className="truncate max-w-48 font-medium text-foreground">{task.title}</span>
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setChatOpen(true)}
            title={t('tasks.openChat', 'Chat öffnen')}
          >
            <MessagesSquare className="h-3.5 w-3.5" />
            Chat
          </Button>
          {canHelp && (
            <Button
              variant="default"
              size="sm"
              className="h-8 gap-1.5 bg-sky-600 text-xs hover:bg-sky-700"
              onClick={() => helpMutation.mutate({ id: task.id, expectedVersion: task.version })}
              disabled={helpMutation.isPending}
              title={t('tasks.helpHint', 'Aus dem Pool unterstützen – Verantwortlicher bleibt zuständig')}
            >
              <LifeBuoy className="h-3.5 w-3.5" />
              {t('tasks.help', 'Aus Pool helfen')}
            </Button>
          )}
          {canClaim && (
            <Button
              variant="default"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => claimMutation.mutate({ id: task.id, expectedVersion: task.version })}
              disabled={claimMutation.isPending}
              title={t('tasks.claimHint', 'Aufgabe übernehmen – wird mir zugewiesen')}
            >
              <UserPlus className="h-3.5 w-3.5" />
              {t('tasks.claim', 'Übernehmen')}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className={cn('h-8 gap-1.5 text-xs', task.locked && 'border-amber-300 text-amber-700 dark:text-amber-400')}
            onClick={toggleLock}
            disabled={lockMutation.isPending}
            title={task.locked
              ? t('tasks.unlockHint', 'Sperre aufheben – Aufgabe kann wieder zugewiesen werden')
              : t('tasks.lockHint', 'Aufgabe sperren – bleibt vertraulich beim Bearbeiter')}
          >
            {task.locked ? <LockOpen className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            {task.locked ? t('tasks.unlock', 'Entsperren') : t('tasks.lock', 'Sperren')}
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={copyLink} aria-label={t('tasks.copyLink', 'Copy task link')} title={t('tasks.copyLink', 'Copy task link')}><Link2 className="h-3.5 w-3.5" /></Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => duplicateMutation.mutate()} disabled={duplicateMutation.isPending}>
            <Copy className="h-3.5 w-3.5" />
            {t('common.duplicate')}
          </Button>
        </div>
      </header>

      {taskQuery.isError && task && <div role="status" className="flex shrink-0 items-center justify-between gap-3 border-b border-warning/20 bg-warning/5 px-5 py-2 text-xs">
        {t('tasks.cachedWarning', 'Showing saved tasks. Refresh to try loading the latest changes.')}
        <Button variant="ghost" size="sm" onClick={() => void taskQuery.refetch()} disabled={taskQuery.isFetching}><RefreshCw className="h-3.5 w-3.5" />{t('common.retry', 'Retry')}</Button>
      </div>}
      {/* ── Body ── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        {/* Left — main content */}
        <div className="min-w-0 shrink-0 px-4 py-5 scrollbar-thin sm:px-6 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:px-8 lg:py-7">
          {/* Title */}
          <div className="relative mb-6 overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-theme-sm sm:p-6">
            <div className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-primary/70 via-sky-400/40 to-transparent" />
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium', taskStatusClass[task.status])}>
                {getTaskStatusLabel(t, task.status)}
              </span>
              {task.status !== 'COMPLETED' && task.status !== 'CANCELLED' && <Button size="sm" variant="outline" disabled={patchMutation.isPending} onClick={() => patch({ status: 'COMPLETED' })}>
                <CheckCheck className="h-4 w-4" />{t('tasks.markComplete', 'Mark complete')}
              </Button>}
            </div>
            <h1>
            <TaskInlineField
              value={task.title}
              ariaLabel={t('tasks.editTitle')}
              className="block w-full text-left text-2xl font-bold text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              onCommit={(title) => patch({ title })}
            />
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
              <span>{t('tasks.updatedLabel', 'Updated')}: {formatDate(task.updatedAt)}</span>
              {task.dueDate && <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{formatDate(task.dueDate)}</span>}
              {patchMutation.isPending && <span role="status" className="inline-flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" />{t('common.saving', 'Saving…')}</span>}
            </div>
            {task.locked && (
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                <Lock className="h-3 w-3" />
                {t('tasks.lockedNotice', 'Gesperrt – vertraulich, bleibt beim Bearbeiter')}
              </span>
            )}
            {task.inPool && (
              <span className="mt-2 ml-2 inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-900/30 dark:text-sky-400">
                <LifeBuoy className="h-3 w-3" />
                {t('tasks.inPoolNotice', 'Im Aufgabenpool – Kollegen können unterstützen')}
              </span>
            )}
          </div>

          <TaskTimePanel key={task.id} task={task} />

          {/* Description */}
          <section className="mb-5 rounded-xl border border-border bg-card p-4 shadow-theme-sm sm:p-5">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('common.description')}
            </h3>
            {descEditMode ? (
              <div className="space-y-2">
                <RichTextEditor
                  value={descDraft}
                  onChange={setDescDraft}
                  placeholder={t('tasks.addDescription')}
                  minHeight={160}
                  maxLength={10000}
                />
                <div className="flex gap-2">
                  <Button size="sm" className="h-7 text-xs" onClick={saveDesc} disabled={patchMutation.isPending}>{t('common.save')}</Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDescEditMode(false)} disabled={patchMutation.isPending}>{t('common.cancel')}</Button>
                </div>
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                className="min-h-16 cursor-text rounded-lg border border-dashed border-border bg-background px-3 py-2.5 text-sm transition-colors hover:border-ring/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => { setDescDraft(task.description ?? ''); setDescEditMode(true); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDescDraft(task.description ?? ''); setDescEditMode(true); } }}
              >
                {task.description ? (
                  <div
                    className="prose prose-sm max-w-none dark:prose-invert"
                    dangerouslySetInnerHTML={{ __html: typeof window === 'undefined' ? '' : DOMPurify.sanitize(task.description) }}
                  />
                ) : (
                  <p className="text-muted-foreground/60 italic">{t('tasks.clickAddDescription')}</p>
                )}
              </div>
            )}
          </section>

          {/* Subtasks */}
          <div className="mb-5 rounded-xl border border-border bg-card p-4 shadow-theme-sm sm:p-5">
            <TaskSubtasksPanel
              parentId={taskId}
              subtasks={subtasksQuery.data ?? []}
              isLoading={subtasksQuery.isLoading}
              onCreateSubtask={(title) => createSubtask.mutate({ parentId: taskId, title })}
              onPatchSubtask={(id, status) => patchSubtask.mutate({ id, patch: { status } })}
              onDeleteSubtask={(id) => deleteSubtaskMut.mutate(id)}
            />
          </div>

          {/* Activity / Chat */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-theme-sm sm:p-5">
            <TaskChatPanel
              notes={notesQuery.data ?? []}
              isLoading={notesQuery.isLoading}
              currentUserId={currentUserId}
              users={users}
              onCreateNote={(bodyHtml) => createNote.mutate(bodyHtml)}
              onDeleteNote={(noteId) => deleteNote.mutate(noteId)}
              isCreating={createNote.isPending}
            />
          </div>
        </div>

        {/* Right — properties sidebar */}
        <aside className="w-full shrink-0 border-t border-border bg-card px-4 py-6 scrollbar-thin sm:px-6 lg:w-80 lg:overflow-y-auto lg:border-l lg:border-t-0 lg:px-5">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('tasks.properties')}</h3>

          <fieldset disabled={patchMutation.isPending} className="space-y-4">
            {/* Status */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t('tasks.status')}</label>
              <Select value={task.status} onValueChange={(v) => patch({ status: v as Task['status'] })}>
                <SelectTrigger className={cn('h-8 gap-1.5 text-xs font-semibold border', taskStatusClass[task.status])}>
                  {(() => { const Icon = STATUS_ICON[task.status]; return <Icon className="h-3.5 w-3.5 shrink-0" />; })()}
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.map((s) => {
                    const Icon = STATUS_ICON[s];
                    return (
                      <SelectItem key={s} value={s} textValue={getTaskStatusLabel(t, s)}>
                        <span className={cn('flex items-center gap-2', taskStatusIconColor[s])}>
                          <Icon className="h-3.5 w-3.5 shrink-0" />
                          {getTaskStatusLabel(t, s)}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Priority */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t('tasks.priority')}</label>
              <Select value={task.priority} onValueChange={(v) => patch({ priority: v as Task['priority'] })}>
                <SelectTrigger className={cn('h-8 gap-1.5 text-xs font-semibold border', taskPriorityClass[task.priority])}>
                  {task.priority !== 'NONE'
                    ? <Flag className={cn('h-3.5 w-3.5 shrink-0 fill-current', taskPriorityIconColor[task.priority])} />
                    : <span className="text-muted-foreground/40 text-sm">—</span>}
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p} textValue={getTaskPriorityLabel(t, p)}>
                      <span className={cn('flex items-center gap-2', p === 'NONE' ? 'text-muted-foreground' : taskPriorityIconColor[p])}>
                        {p !== 'NONE'
                          ? <Flag className="h-3.5 w-3.5 shrink-0 fill-current" />
                          : <span className="text-muted-foreground/40 w-3.5 text-center">—</span>}
                        {getTaskPriorityLabel(t, p)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Assignee */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t('tasks.assignee')}</label>
              <AssigneeSelector
                assigneeIds={task.assigneeIds ?? (task.assigneeId ? [task.assigneeId] : [])}
                users={users}
                size="default"
                disabled={task.locked}
                onAssigneeChange={(ids) => patch({ assigneeIds: ids })}
              />
            </div>

            {/* Department (Abteilung) */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t('tasks.department', language === 'de' ? 'Abteilung' : 'Department')}</label>
              <Select
                value={(task.departmentId?._id || task.departmentId?.id || (typeof task.departmentId === 'string' ? task.departmentId : '') || 'NONE') as string}
                onValueChange={(v) => patch({ departmentId: v === 'NONE' ? null : v })}
              >
                <SelectTrigger className="h-8 gap-1.5 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE"><span className="text-muted-foreground">—</span></SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d._id} value={String(d._id)} textValue={d.name}>
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color || '#94a3b8' }} />
                        {d.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Herkunft (origin) */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t('tasks.col.origin', 'Herkunft')}</label>
              <Select
                value={task.source?.type || 'MANUAL'}
                onValueChange={(v) => patch({ source: { ...(task.source ?? {}), type: v } })}
              >
                <SelectTrigger className="h-8 gap-1.5 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TASK_SOURCE_META) as Array<keyof typeof TASK_SOURCE_META>).map((k) => (
                    <SelectItem key={k} value={k} textValue={language === 'de' ? TASK_SOURCE_META[k].labelDe : TASK_SOURCE_META[k].labelEn}>
                      {language === 'de' ? TASK_SOURCE_META[k].labelDe : TASK_SOURCE_META[k].labelEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Start date */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t('tasks.startDate')}</label>
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input type="date" aria-label={t('tasks.startDate')} className="h-9 pl-9 text-sm [color-scheme:light] dark:[color-scheme:dark]" value={toDateValue(task.startDate)} onChange={(e) => patch({ startDate: e.target.value || null })} />
              </div>
            </div>

            {/* Due date */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t('tasks.dueDate')}</label>
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input type="date" aria-label={t('tasks.dueDate')} className="h-9 pl-9 text-sm [color-scheme:light] dark:[color-scheme:dark]" value={toDateValue(task.dueDate)} onChange={(e) => patch({ dueDate: e.target.value || null })} />
              </div>
              <div className="flex gap-1.5">
                <Input
                  value={dueText}
                  onChange={(event) => setDueText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') applyDueText();
                  }}
                  placeholder={t('tasks.dueQuickPlaceholder', 'morgen, +3d, nächsten Freitag')}
                  className="h-8 text-xs"
                />
                <Button type="button" variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={applyDueText}>
                  {t('common.set', 'Setzen')}
                </Button>
              </div>
            </div>
          </fieldset>

          <div className="my-5 border-t border-border" />

          <TaskContextSelector
            task={task}
            onSelect={(option) => {
              if (option.type === 'project') {
                patch({ projectId: option.id, orderId: null });
              } else {
                patch({ orderId: option.id, projectId: null });
              }
            }}
            onClear={() => patch({ projectId: null, orderId: null })}
          />

          <div className="my-5 border-t border-border" />

          <TaskRemindersPanel
            reminders={remindersQuery.data ?? []}
            isLoading={remindersQuery.isLoading}
            dueDate={task.dueDate}
            isSaving={createReminder.isPending || deleteReminder.isPending || snoozeReminder.isPending}
            onCreateReminder={(input) => createReminder.mutate(input)}
            onDeleteReminder={(reminderId) => deleteReminder.mutate(reminderId)}
            onSnoozeReminder={(reminderId, snoozeMinutes) => snoozeReminder.mutate({ reminderId, snoozeMinutes })}
          />

          {/* Divider */}
          <div className="my-5 border-t border-border" />

          {/* Attachments */}
          <TaskFileViewer
            attachments={attachmentsQuery.data ?? []}
            isLoading={attachmentsQuery.isLoading}
            isUploading={uploadAttachment.isPending}
            onUpload={(file) => uploadAttachment.mutate(file)}
            onDelete={(attachmentId) => deleteAttachment.mutate(attachmentId)}
          />
        </aside>
      </div>
      <TaskCompletionDialog
        open={Boolean(completionPrompt)}
        incompleteCount={completionPrompt?.count ?? 0}
        onCancel={() => setCompletionPrompt(null)}
        onParentOnly={() => {
          if (!task || !completionPrompt) return;
          patchMutation.mutate({
            id: task.id,
            patch: {
              ...completionPrompt.patch,
              expectedVersion: task.version,
              completeParentOnly: true,
            },
          });
          setCompletionPrompt(null);
        }}
        onCompleteAll={() => {
          if (!task || !completionPrompt) return;
          patchMutation.mutate({
            id: task.id,
            patch: {
              ...completionPrompt.patch,
              expectedVersion: task.version,
              completeSubtasks: true,
            },
          });
          setCompletionPrompt(null);
        }}
      />

      <TaskChatDialog task={task} open={chatOpen} onOpenChange={setChatOpen} />
    </div>
  );
}
