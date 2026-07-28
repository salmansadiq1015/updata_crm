'use client';

import { useRef, useState } from 'react';
import {
  CalendarDays, Circle, CircleCheck, CircleDashed, CirclePause, CircleX,
  Copy, ExternalLink, Flag, Lock, LockOpen, Paperclip, Plus, Send, Trash2,
  Upload, UserRound, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import type { Task, TaskNote, TaskPatch, TaskStatus } from '../types/task-types';
import {
  TASK_PRIORITIES, getTaskPriorityLabel,
  TASK_STATUSES, getTaskStatusLabel,
  taskPriorityClass, taskPriorityIconColor,
  taskStatusClass, taskStatusIconColor,
} from './task-ui-constants';
import { TaskInlineField } from './task-inline-field';
import { TaskEmptyState } from './task-empty-state';
import { AssigneeSelector } from './assignee-selector';
import { TaskSubtasksPanel } from './task-subtasks-panel';
import { taskApi } from '../services/task-api';
import { useTaskSubtasks, useTaskNotes } from '../hooks/use-task-queries';

const STATUS_ICON = {
  OPEN:        Circle,
  IN_PROGRESS: CircleDashed,
  ON_HOLD:      CirclePause,
  COMPLETED:   CircleCheck,
  CANCELLED:   CircleX,
} as const satisfies Record<TaskStatus, React.ElementType>;

const PRIORITY_ACCENT: Record<string, string> = {
  URGENT: 'from-red-500/20 via-transparent',
  HIGH:   'from-orange-500/15 via-transparent',
  MEDIUM: 'from-amber-400/15 via-transparent',
  LOW:    'from-sky-400/15 via-transparent',
  NONE:   'from-transparent via-transparent',
};

const PRIORITY_BORDER: Record<string, string> = {
  URGENT: 'border-l-red-500',
  HIGH:   'border-l-orange-500',
  MEDIUM: 'border-l-amber-400',
  LOW:    'border-l-sky-400',
  NONE:   'border-l-border',
};

type TaskDetailDrawerProps = {
  task: Task | undefined;
  open: boolean;
  isLoading: boolean;
  onOpenChange: (open: boolean) => void;
  onPatchTask: (id: string, patch: TaskPatch) => void;
  onTaskRefresh?: (id: string) => void;
  users?: WorkspaceUser[];
  onDuplicateTask?: (id: string) => void;
  onSetLock?: (id: string, locked: boolean, expectedVersion?: number) => void;
};

type WorkspaceUser = {
  id: string;
  firstName?: string;
  lastName?: string;
};

const toDateValue = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '');

const formatDate = (iso: string | null | undefined, fallback = 'Not set') => {
  if (!iso) return fallback;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(iso));
};

const timeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
        {children}
      </span>
      <div className="h-px flex-1 bg-border/50" />
    </div>
  );
}

function FieldRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/30">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
      <span className="w-20 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function ActivityNote({ note, users }: { note: TaskNote; users?: WorkspaceUser[] }) {
  const { t } = useLanguage();
  const author = (users ?? []).find((u) => u.id === note.authorId);
  const name = author ? `${author.firstName ?? ''} ${author.lastName ?? ''}`.trim() : t('tasks.teamMember');
  const initials = author
    ? `${author.firstName?.[0] ?? ''}${author.lastName?.[0] ?? ''}`.toUpperCase()
    : '?';

  return (
    <div className="flex gap-3">
      <div className="mt-0.5 h-6 w-6 shrink-0 rounded-full bg-primary/15 text-[9px] font-semibold text-primary flex items-center justify-center ring-1 ring-primary/20">
        {initials}
      </div>
      <div className="flex-1 rounded-xl border border-border/50 bg-muted/20 px-3 py-2">
        <div className="mb-1 flex items-baseline gap-2">
          <span className="text-xs font-semibold text-foreground">{name}</span>
          <span className="text-[10px] text-muted-foreground">{timeAgo(note.createdAt)}</span>
        </div>
        <div
          className="prose prose-sm max-w-none dark:prose-invert text-xs text-muted-foreground leading-relaxed"
          dangerouslySetInnerHTML={{ __html: note.bodyHtml }}
        />
      </div>
    </div>
  );
}

export default function TaskDetailDrawer({
  task,
  open,
  isLoading,
  onOpenChange,
  onPatchTask,
  onTaskRefresh,
  users,
  onDuplicateTask,
  onSetLock,
}: TaskDetailDrawerProps) {
  const { t } = useLanguage();
  const startInputRef = useRef<HTMLInputElement>(null);
  const dueInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [postingNote, setPostingNote] = useState(false);

  const subtasksQuery = useTaskSubtasks(task?.id ?? null);
  const notesQuery = useTaskNotes(task?.id ?? null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !task) return;
    e.target.value = '';
    setUploading(true);
    try {
      await taskApi.uploadAttachment(task.id, file);
      toast.success(t('tasks.attachmentUploaded'));
      onTaskRefresh?.(task.id);
    } catch {
      toast.error(t('tasks.uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const handlePostNote = async () => {
    const body = noteText.trim();
    if (!body || !task) return;
    setPostingNote(true);
    try {
      await taskApi.createNote(task.id, body);
      setNoteText('');
      notesQuery.refetch();
    } catch {
      toast.error(t('tasks.postNoteFailed'));
    } finally {
      setPostingNote(false);
    }
  };

  const handleCreateSubtask = async (title: string) => {
    if (!task) return;
    try {
      await taskApi.createSubtask(task.id, { title });
      subtasksQuery.refetch();
    } catch {
      toast.error(t('tasks.createSubtaskFailed'));
    }
  };

  const handlePatchSubtask = async (id: string, status: TaskStatus) => {
    if (!task) return;
    try {
      await taskApi.changeStatus(id, status);
      subtasksQuery.refetch();
    } catch {
      toast.error(t('tasks.updateSubtaskFailed'));
    }
  };

  const handleDeleteSubtask = async (id: string) => {
    if (!task) return;
    try {
      await taskApi.remove(id);
      subtasksQuery.refetch();
    } catch {
      toast.error(t('tasks.deleteSubtaskFailed'));
    }
  };

  const priority = task?.priority ?? 'NONE';
  const StatusIcon = task ? STATUS_ICON[task.status] : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          'flex w-full flex-col gap-0 overflow-hidden border-l border-border bg-card p-0 shadow-2xl sm:max-w-2xl',
          'border-l-4',
          PRIORITY_BORDER[priority],
        )}
      >
        {/* Loading skeleton */}
        {isLoading && (
          <>
            <SheetTitle className="sr-only">{t('tasks.loadingTask')}</SheetTitle>
            <div className="space-y-4 p-6">
              <div className="h-6 w-3/4 rounded-lg bg-muted skeleton-shimmer" />
              <div className="h-3 w-1/3 rounded bg-muted skeleton-shimmer" />
              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="h-9 rounded-lg bg-muted skeleton-shimmer" />
                <div className="h-9 rounded-lg bg-muted skeleton-shimmer" />
              </div>
              <div className="mt-4 h-32 rounded-xl bg-muted skeleton-shimmer" />
            </div>
          </>
        )}

        {/* No task */}
        {!isLoading && !task && (
          <>
            <SheetTitle className="sr-only">{t('tasks.noTaskSelected')}</SheetTitle>
            <TaskEmptyState type="empty" />
          </>
        )}

        {/* Task content */}
        {!isLoading && task && (
          <>
            {/* ── Header ─────────────────────────────────────────────────────── */}
            <div className={cn('relative shrink-0 bg-linear-to-r px-6 py-5 pr-14', PRIORITY_ACCENT[priority])}>
              <SheetTitle className="mb-1.5">
                <TaskInlineField
                  value={task.title}
                  ariaLabel={t('tasks.editTitle')}
                  className="block w-full text-left text-lg font-bold leading-snug text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onCommit={(title) => onPatchTask(task.id, { title, expectedVersion: task.version })}
                />
              </SheetTitle>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                {StatusIcon && <StatusIcon className={cn('h-3 w-3', taskStatusIconColor[task.status])} />}
                <span>{getTaskStatusLabel(t, task.status)}</span>
                {task.locked && (
                  <>
                    <span className="opacity-40">·</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      <Lock className="h-3 w-3" />
                      {t('tasks.locked', 'Gesperrt')}
                    </span>
                  </>
                )}
                <span className="opacity-40">·</span>
                <span>v{task.version}</span>
                <span className="opacity-40">·</span>
                <span>{t('tasks.updatedAt', { date: formatDate(task.updatedAt) })}</span>
              </div>
            </div>

            {/* ── Status + Priority row ────────────────────────────────────── */}
            <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background/60 px-6 py-3">
              <Select
                value={task.status}
                onValueChange={(s: string) =>
                  onPatchTask(task.id, { status: s as Task['status'], expectedVersion: task.version })
                }
              >
                <SelectTrigger
                  className={cn(
                    'h-7 w-auto gap-1.5 rounded-full border px-3 text-[11px] font-semibold',
                    taskStatusClass[task.status],
                  )}
                >
                  {StatusIcon && <StatusIcon className="h-3 w-3 shrink-0" />}
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

              <Select
                value={task.priority}
                onValueChange={(p: string) =>
                  onPatchTask(task.id, { priority: p as Task['priority'], expectedVersion: task.version })
                }
              >
                <SelectTrigger
                  className={cn(
                    'h-7 w-auto gap-1.5 rounded-full border px-3 text-[11px] font-semibold',
                    taskPriorityClass[task.priority],
                  )}
                >
                  {task.priority !== 'NONE' ? (
                    <Flag className={cn('h-3 w-3 shrink-0 fill-current', taskPriorityIconColor[task.priority])} />
                  ) : (
                    <span className="text-muted-foreground/50 text-sm leading-none">—</span>
                  )}
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p} textValue={getTaskPriorityLabel(t, p)}>
                      <span className={cn('flex items-center gap-2', p === 'NONE' ? 'text-muted-foreground' : taskPriorityIconColor[p])}>
                        {p !== 'NONE' ? (
                          <Flag className="h-3.5 w-3.5 shrink-0 fill-current" />
                        ) : (
                          <span className="w-3.5 text-center opacity-40">—</span>
                        )}
                        {getTaskPriorityLabel(t, p)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="ml-auto">
                <AssigneeSelector
                  assigneeIds={task.assigneeIds ?? (task.assigneeId ? [task.assigneeId] : [])}
                  users={users ?? []}
                  onAssigneeChange={(ids) =>
                    onPatchTask(task.id, { assigneeIds: ids, expectedVersion: task.version })
                  }
                  size="sm"
                  disabled={task.locked}
                />
              </div>
            </div>

            {/* ── Scrollable body ──────────────────────────────────────────── */}
            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
              <div className="space-y-5 p-6">

                {/* ── Properties ─────────────────────────────────────────── */}
                <section>
                  <SectionLabel>{t('tasks.properties')}</SectionLabel>
                  <div className="mt-1 divide-y divide-border/30 rounded-xl border border-border/50 bg-background/40 overflow-hidden">
                    {/* Start date */}
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
                      onClick={() => startInputRef.current?.showPicker?.()}
                    >
                      <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                      <span className="w-20 shrink-0 text-xs text-muted-foreground">{t('tasks.startDate')}</span>
                      <span className={cn('ml-auto text-xs font-medium', !task.startDate && 'text-muted-foreground/50')}>
                        {formatDate(task.startDate, t('tasks.notSet'))}
                      </span>
                      {task.startDate && (
                        <button
                          type="button"
                          className="ml-1 rounded p-0.5 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            onPatchTask(task.id, { startDate: null, expectedVersion: task.version });
                          }}
                        >
                          <X className="h-3 w-3 text-muted-foreground" />
                        </button>
                      )}
                      <input
                        ref={startInputRef}
                        type="date"
                        className="sr-only"
                        value={toDateValue(task.startDate)}
                        onChange={(e) =>
                          onPatchTask(task.id, { startDate: e.target.value || null, expectedVersion: task.version })
                        }
                      />
                    </button>

                    {/* Due date */}
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
                      onClick={() => dueInputRef.current?.showPicker?.()}
                    >
                      <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                      <span className="w-20 shrink-0 text-xs text-muted-foreground">{t('tasks.dueDate')}</span>
                      <span
                        className={cn(
                          'ml-auto text-xs font-medium',
                          !task.dueDate && 'text-muted-foreground/50',
                          task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'COMPLETED'
                            ? 'text-red-500'
                            : task.dueDate
                              ? 'text-foreground'
                              : '',
                        )}
                      >
                        {formatDate(task.dueDate, t('tasks.noDueDate'))}
                      </span>
                      <input
                        ref={dueInputRef}
                        type="date"
                        className="sr-only"
                        value={toDateValue(task.dueDate)}
                        onChange={(e) =>
                          onPatchTask(task.id, { dueDate: e.target.value || null, expectedVersion: task.version })
                        }
                      />
                    </button>

                    {/* Attachments */}
                    <button
                      type="button"
                      disabled={uploading}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                      <span className="w-20 shrink-0 text-xs text-muted-foreground">{t('tasks.attachments')}</span>
                      <span className="ml-auto flex items-center gap-1.5 text-xs font-medium">
                        {task.attachmentCount > 0 ? (
                          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                            {t('tasks.fileCount', { count: task.attachmentCount })}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">{t('tasks.none')}</span>
                        )}
                        <Upload className="h-3 w-3 text-muted-foreground" />
                      </span>
                      <input ref={fileInputRef} type="file" className="sr-only" onChange={handleFileChange} />
                    </button>
                  </div>
                </section>

                {/* ── Description ────────────────────────────────────────── */}
                <section>
                  <SectionLabel>{t('common.description')}</SectionLabel>
                  <div className="mt-1 min-h-24 rounded-xl border border-border/50 bg-background/40 px-4 py-3 text-sm">
                    {task.description ? (
                      <div
                        className="prose prose-sm max-w-none dark:prose-invert leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: task.description }}
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground/50 italic">{t('tasks.noDescription')}</p>
                    )}
                  </div>
                </section>

                {/* ── Subtasks ────────────────────────────────────────────── */}
                <section>
                  <SectionLabel>{t('tasks.subtasks')}</SectionLabel>
                  <div className="mt-1">
                    <TaskSubtasksPanel
                      parentId={task.id}
                      subtasks={subtasksQuery.data ?? []}
                      isLoading={subtasksQuery.isLoading}
                      onCreateSubtask={handleCreateSubtask}
                      onPatchSubtask={handlePatchSubtask}
                      onDeleteSubtask={handleDeleteSubtask}
                    />
                  </div>
                </section>

                {/* ── Activity / Notes ────────────────────────────────────── */}
                <section>
                  <SectionLabel>{t('tasks.activity')}</SectionLabel>
                  <div className="mt-2 space-y-3">
                    {notesQuery.isLoading && (
                      <div className="space-y-2">
                        {[1, 2].map((i) => (
                          <div key={i} className="flex gap-3">
                            <div className="h-6 w-6 shrink-0 rounded-full bg-muted skeleton-shimmer" />
                            <div className="flex-1 h-14 rounded-xl bg-muted skeleton-shimmer" />
                          </div>
                        ))}
                      </div>
                    )}
                    {!notesQuery.isLoading && (notesQuery.data ?? []).length === 0 && (
                      <p className="rounded-xl border border-dashed border-border/50 py-6 text-center text-xs text-muted-foreground/50">
                        {t('tasks.noActivity')}
                      </p>
                    )}
                    {(notesQuery.data ?? []).map((note) => (
                      <ActivityNote key={note.id} note={note} users={users} />
                    ))}

                    {/* Add note */}
                    <div className="flex gap-3">
                      <div className="mt-0.5 h-6 w-6 shrink-0 rounded-full bg-muted/50 text-muted-foreground/40 flex items-center justify-center ring-1 ring-border">
                        <UserRound className="h-3 w-3" />
                      </div>
                      <div className="flex-1">
                        <Textarea
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          placeholder={t('tasks.writeNote')}
                          rows={2}
                          className="min-h-0 resize-none rounded-xl border-border/50 bg-background/60 px-4 py-3 text-xs placeholder:text-muted-foreground/40 focus-visible:ring-1 focus-visible:ring-primary/50 transition-all"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handlePostNote();
                          }}
                        />
                        {noteText.trim() && (
                          <div className="mt-1.5 flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => setNoteText('')}
                            >
                              {t('common.cancel')}
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 gap-1.5 px-3 text-xs"
                              onClick={handlePostNote}
                              disabled={postingNote}
                            >
                              <Send className="h-3 w-3" />
                              {t('tasks.postNote')}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </section>

                <div className="h-2" />
              </div>
            </div>

            {/* ── Footer ──────────────────────────────────────────────────── */}
            <div className="flex shrink-0 items-center gap-2 border-t border-border bg-background/60 px-6 py-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => task && onDuplicateTask?.(task.id)}
              >
                <Copy className="h-3.5 w-3.5" />
                {t('common.duplicate')}
              </Button>
              {onSetLock && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'gap-1.5 text-xs',
                    task.locked ? 'text-amber-600 hover:text-amber-700' : 'text-muted-foreground hover:text-foreground',
                  )}
                  onClick={() => onSetLock(task.id, !task.locked, task.version)}
                  title={task.locked
                    ? t('tasks.unlockHint', 'Sperre aufheben – Aufgabe kann wieder zugewiesen werden')
                    : t('tasks.lockHint', 'Aufgabe sperren – bleibt vertraulich beim Bearbeiter')}
                >
                  {task.locked ? <LockOpen className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                  {task.locked ? t('tasks.unlock', 'Entsperren') : t('tasks.lock', 'Sperren')}
                </Button>
              )}
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
                <span>#{task.id.slice(-6)}</span>
              </div>
              <Button
                type="button"
                size="sm"
                className="ml-auto gap-1.5 text-xs"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-3.5 w-3.5" />
                {t('common.close')}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
