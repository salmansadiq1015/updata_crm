'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CalendarDays, Circle, CircleCheck, CircleDashed, CircleX, Copy, Flag, Loader2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
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
import { AssigneeSelector } from './assignee-selector';
import type { Task, TaskPatch } from '../types/task-types';
import {
  TASK_STATUSES, TASK_PRIORITIES,
  TASK_STATUS_LABEL, TASK_PRIORITY_LABEL,
  taskStatusClass, taskPriorityClass,
  taskStatusIconColor, taskPriorityIconColor,
} from './task-ui-constants';

// ── Status icon map ──────────────────────────────────────────────────────────

const STATUS_ICON = {
  OPEN: Circle,
  IN_PROGRESS: CircleDashed,
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

// ── Component ────────────────────────────────────────────────────────────────

export function TaskDetailPage({ taskId, listId }: TaskDetailPageProps) {
  const router = useRouter();
  const qc = useQueryClient();
  const currentUserId = useAuthStore((s: any) => s.user?._id ?? s.user?.id ?? null);

  // Data
  const taskQuery = useTaskDetailV2(taskId);
  const usersQuery = useWorkspaceUsers();
  const subtasksQuery = useTaskSubtasks(taskId);
  const notesQuery = useTaskNotes(taskId);
  const attachmentsQuery = useTaskAttachments(taskId);

  const task = taskQuery.data;
  const users = usersQuery.data ?? [];

  // Description local edit state
  const [descEditMode, setDescEditMode] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const startInputRef = useRef<HTMLInputElement>(null);
  const dueInputRef = useRef<HTMLInputElement>(null);

  // Patch the main task
  const patchMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TaskPatch }) => taskApi.patch(id, patch),
    onSuccess: (updated) => {
      qc.setQueryData(taskWorkspaceKeys.detail(taskId), updated);
    },
    onError: () => toast.error('Failed to update task'),
  });

  const patch = (p: TaskPatch) => {
    if (!task) return;
    patchMutation.mutate({ id: task.id, patch: { ...p, expectedVersion: task.version } });
  };

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

  const handleDuplicate = async () => {
    if (!task) return;
    const dup = await taskApi.duplicate(task.id);
    toast.success('Task duplicated');
    router.push(`/tasks/${listId}/${dup.id}`);
  };

  // Description save
  const saveDesc = () => {
    patch({ description: descDraft });
    setDescEditMode(false);
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
        <p className="text-muted-foreground">Task not found.</p>
        <Button variant="outline" onClick={() => router.push(`/tasks/${listId}`)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to list
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
          Back
        </Button>
        <div className="h-4 w-px bg-border" />
        <nav className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span>Tasks</span>
          <span>/</span>
          <span className="truncate max-w-32">List</span>
          <span>/</span>
          <span className="truncate max-w-48 font-medium text-foreground">{task.title}</span>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleDuplicate}>
            <Copy className="h-3.5 w-3.5" />
            Duplicate
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
              ariaLabel="Edit task title"
              className="block w-full text-left text-2xl font-bold text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              onCommit={(title) => patch({ title })}
            />
          </div>

          {/* Description */}
          <section className="mb-8">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Description
            </h3>
            {descEditMode ? (
              <div className="space-y-2">
                <textarea
                  autoFocus
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') { setDescEditMode(false); }
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveDesc();
                  }}
                  rows={6}
                  placeholder="Add a description…"
                  className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                />
                <div className="flex gap-2">
                  <Button size="sm" className="h-7 text-xs" onClick={saveDesc}>Save</Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDescEditMode(false)}>Cancel</Button>
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
                  <p className="text-muted-foreground/60 italic">Click to add a description…</p>
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
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Properties</h3>

          <div className="space-y-3">
            {/* Status */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select value={task.status} onValueChange={(v) => patch({ status: v as Task['status'] })}>
                <SelectTrigger className={cn('h-8 gap-1.5 text-xs font-semibold border', taskStatusClass[task.status])}>
                  {(() => { const Icon = STATUS_ICON[task.status]; return <Icon className="h-3.5 w-3.5 shrink-0" />; })()}
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.map((s) => {
                    const Icon = STATUS_ICON[s];
                    return (
                      <SelectItem key={s} value={s} textValue={TASK_STATUS_LABEL[s]}>
                        <span className={cn('flex items-center gap-2', taskStatusIconColor[s])}>
                          <Icon className="h-3.5 w-3.5 shrink-0" />
                          {TASK_STATUS_LABEL[s]}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Priority */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Priority</label>
              <Select value={task.priority} onValueChange={(v) => patch({ priority: v as Task['priority'] })}>
                <SelectTrigger className={cn('h-8 gap-1.5 text-xs font-semibold border', taskPriorityClass[task.priority])}>
                  {task.priority !== 'NONE'
                    ? <Flag className={cn('h-3.5 w-3.5 shrink-0 fill-current', taskPriorityIconColor[task.priority])} />
                    : <span className="text-muted-foreground/40 text-sm">—</span>}
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p} textValue={TASK_PRIORITY_LABEL[p]}>
                      <span className={cn('flex items-center gap-2', p === 'NONE' ? 'text-muted-foreground' : taskPriorityIconColor[p])}>
                        {p !== 'NONE'
                          ? <Flag className="h-3.5 w-3.5 shrink-0 fill-current" />
                          : <span className="text-muted-foreground/40 w-3.5 text-center">—</span>}
                        {TASK_PRIORITY_LABEL[p]}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Assignee */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Assignee</label>
              <AssigneeSelector
                assigneeId={task.assigneeId ?? null}
                users={users}
                size="default"
                onAssigneeChange={(assigneeId) => patch({ assigneeId })}
              />
            </div>

            {/* Start date */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Start date</label>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50"
                onClick={() => startInputRef.current?.showPicker?.()}
              >
                <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className={task.startDate ? 'font-medium' : 'text-muted-foreground text-xs'}>
                  {formatDate(task.startDate, 'Set date')}
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
              <label className="text-xs font-medium text-muted-foreground">Due date</label>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50"
                onClick={() => dueInputRef.current?.showPicker?.()}
              >
                <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className={task.dueDate ? 'font-medium' : 'text-muted-foreground text-xs'}>
                  {formatDate(task.dueDate, 'Set date')}
                </span>
                <input
                  ref={dueInputRef}
                  type="date"
                  className="sr-only"
                  value={toDateValue(task.dueDate)}
                  onChange={(e) => patch({ dueDate: e.target.value || null })}
                />
              </button>
            </div>
          </div>

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
    </div>
  );
}
