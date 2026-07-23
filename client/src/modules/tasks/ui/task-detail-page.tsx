'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CalendarDays, Circle, CircleCheck, CircleDashed, CirclePause, CircleX, Copy, Flag, LifeBuoy, Loader2, Lock, LockOpen, UserPlus } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { TaskSubtasksPanel } from './task-subtasks-panel';
import { TaskChatPanel } from './task-chat-panel';
import { TaskFileViewer } from './task-file-viewer';
import { TaskInlineField } from './task-inline-field';
import { TaskRemindersPanel } from './task-reminders-panel';
import { TaskContextSelector } from './task-context-selector';
import { TaskCompletionDialog } from './task-completion-dialog';
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
  if (!iso) return fallback;
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
  const { t } = useLanguage();
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
  useBreadcrumbLabel(taskId, task?.title);
  const users = usersQuery.data ?? [];

  // Description local edit state
  const [descEditMode, setDescEditMode] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [dueText, setDueText] = useState('');
  const [completionPrompt, setCompletionPrompt] = useState<{ patch: TaskPatch; count: number } | null>(null);
  const startInputRef = useRef<HTMLInputElement>(null);
  const dueInputRef = useRef<HTMLInputElement>(null);

  // Patch the main task
  const patchMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TaskPatch }) => taskApi.patch(id, patch),
    onSuccess: (updated) => {
      qc.setQueryData(taskWorkspaceKeys.detail(taskId), updated);
      qc.invalidateQueries({ queryKey: taskWorkspaceKeys.windows() });
      qc.invalidateQueries({ queryKey: taskWorkspaceKeys.lists() });
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
    if (!task) return;
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

  const handleDuplicate = async () => {
    if (!task) return;
    const dup = await taskApi.duplicate(task.id);
    toast.success(t('tasks.duplicated'));
    router.push(`/tasks/${listId}/${dup.id}`);
  };

  // Description save
  const saveDesc = () => {
    patch({ description: descDraft });
    setDescEditMode(false);
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

  if (!task) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-muted-foreground">{t('tasks.notFound')}</p>
        <Button variant="outline" onClick={() => router.push(`/tasks/${listId}`)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> {t('tasks.backToList')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* ── Header ── */}
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-6 py-3">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => router.push(`/tasks/${listId}`)}
        >
          <ArrowLeft className="h-4 w-4" />
          {t('common.back')}
        </Button>
        <div className="h-4 w-px bg-border" />
        <nav className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span>{t('tasks.title')}</span>
          <span>/</span>
          <span className="truncate max-w-32">{t('tasks.list')}</span>
          <span>/</span>
          <span className="truncate max-w-48 font-medium text-foreground">{task.title}</span>
        </nav>
        <div className="ml-auto flex items-center gap-2">
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
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleDuplicate}>
            <Copy className="h-3.5 w-3.5" />
            {t('common.duplicate')}
          </Button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left — main content */}
        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-7 scrollbar-thin">
          {/* Title */}
          <div className="mb-6">
            <TaskInlineField
              value={task.title}
              ariaLabel={t('tasks.editTitle')}
              className="block w-full text-left text-2xl font-bold text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              onCommit={(title) => patch({ title })}
            />
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

          {/* Description */}
          <section className="mb-8">
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
                  <Button size="sm" className="h-7 text-xs" onClick={saveDesc}>{t('common.save')}</Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDescEditMode(false)}>{t('common.cancel')}</Button>
                </div>
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                className="min-h-16 cursor-text rounded-lg border border-dashed border-border bg-background px-3 py-2.5 text-sm transition-colors hover:border-ring/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => { setDescDraft(task.description ?? ''); setDescEditMode(true); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { setDescDraft(task.description ?? ''); setDescEditMode(true); } }}
              >
                {task.description ? (
                  <div
                    className="prose prose-sm max-w-none dark:prose-invert"
                    dangerouslySetInnerHTML={{ __html: task.description }}
                  />
                ) : (
                  <p className="text-muted-foreground/60 italic">{t('tasks.clickAddDescription')}</p>
                )}
              </div>
            )}
          </section>

          {/* Subtasks */}
          <div className="mb-8">
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
          <div className="pb-8">
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
        <aside className="w-72 shrink-0 overflow-y-auto border-l border-border bg-card px-4 py-6 scrollbar-thin">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('tasks.properties')}</h3>

          <div className="space-y-3">
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
                assigneeId={task.assigneeId ?? null}
                users={users}
                size="default"
                disabled={task.locked}
                onAssigneeChange={(assigneeId) => patch({ assigneeId })}
              />
            </div>

            {/* Start date */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t('tasks.startDate')}</label>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50"
                onClick={() => startInputRef.current?.showPicker?.()}
              >
                <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className={task.startDate ? 'font-medium' : 'text-muted-foreground text-xs'}>
                  {formatDate(task.startDate, t('tasks.setDate'))}
                </span>
                <input
                  ref={startInputRef}
                  type="date"
                  className="sr-only"
                  value={toDateValue(task.startDate)}
                  onChange={(e) => patch({ startDate: e.target.value || null })}
                />
              </button>
            </div>

            {/* Due date */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t('tasks.dueDate')}</label>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50"
                onClick={() => dueInputRef.current?.showPicker?.()}
              >
                <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className={task.dueDate ? 'font-medium' : 'text-muted-foreground text-xs'}>
                  {formatDate(task.dueDate, t('tasks.setDate'))}
                </span>
                <input
                  ref={dueInputRef}
                  type="date"
                  className="sr-only"
                  value={toDateValue(task.dueDate)}
                  onChange={(e) => patch({ dueDate: e.target.value || null })}
                />
              </button>
              <div className="flex gap-1.5">
                <Input
                  value={dueText}
                  onChange={(event) => setDueText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') applyDueText();
                  }}
                  placeholder="tomorrow, +3d, next Friday"
                  className="h-8 text-xs"
                />
                <Button type="button" variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={applyDueText}>
                  Set
                </Button>
              </div>
            </div>
          </div>

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
    </div>
  );
}
