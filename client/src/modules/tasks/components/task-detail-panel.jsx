'use client';

import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { TaskStatusBadge } from './task-status-badge';
import { TaskPriorityBadge } from './task-priority-badge';
import { useTaskDetail, useTaskSubtasks, useTaskNotes } from '../hooks/use-task-queries';
import { useTaskMutations, useTaskNoteMutations } from '../hooks/use-task-mutations';
import { useLanguage } from '@/lib/i18n/language-context';
import { formatDate } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import {
  Pencil, CircleCheck, RefreshCw, Trash2, Plus, Send,
  Calendar, User, List, Tag, FileText, ChevronRight,
} from 'lucide-react';

function Section({ icon: Icon, title, children }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
      </div>
      {children}
    </div>
  );
}

function DetailRow({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-xs text-muted-foreground min-w-[80px] mt-0.5">{label}</span>
      <div className="flex-1 text-right">{children}</div>
    </div>
  );
}

function SubtaskRow({ subtask, de }) {
  const { changeStatus } = useTaskMutations();
  return (
    <div className="flex items-center gap-2 py-1.5 border-b last:border-0">
      <button
        type="button"
        onClick={() => changeStatus.mutate({
          id: subtask._id,
          status: subtask.status === 'COMPLETED' ? 'OPEN' : 'COMPLETED',
        })}
        className={cn(
          'h-4 w-4 rounded border shrink-0 transition-colors',
          subtask.status === 'COMPLETED'
            ? 'bg-emerald-500 border-emerald-500'
            : 'border-muted-foreground hover:border-primary',
        )}
      >
        {subtask.status === 'COMPLETED' && (
          <svg viewBox="0 0 12 12" fill="none" className="w-full h-full p-0.5">
            <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <span className={cn('text-sm flex-1', subtask.status === 'COMPLETED' && 'line-through text-muted-foreground')}>
        {subtask.title}
      </span>
      <TaskStatusBadge status={subtask.status} size="sm" />
    </div>
  );
}

function NoteRow({ note, taskId, de }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(note.content);
  const { updateNote, deleteNote } = useTaskNoteMutations(taskId);

  const save = () => {
    updateNote.mutate({ noteId: note._id, content: val }, { onSuccess: () => setEditing(false) });
  };

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
      {editing ? (
        <>
          <Textarea value={val} onChange={(e) => setVal(e.target.value)} rows={3} className="text-sm resize-none" autoFocus />
          <div className="flex gap-1.5">
            <Button size="sm" className="h-7 text-xs" onClick={save} disabled={updateNote.isPending}>
              {de ? 'Speichern' : 'Save'}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEditing(false); setVal(note.content); }}>
              {de ? 'Abbrechen' : 'Cancel'}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm whitespace-pre-wrap">{note.content}</p>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">{formatDate(note.createdAt)}</span>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditing(true)}>
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive"
                onClick={() => deleteNote.mutate(note._id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function TaskDetailPanel({ task, open, onOpenChange, onEdit }) {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const [newNote, setNewNote] = useState('');

  const { data: detail } = useTaskDetail(task?._id);
  const { data: subtasks = [] } = useTaskSubtasks(task?._id);
  const { data: notes = [] } = useTaskNotes(task?._id);
  const { completeTask, reopenTask, removeTask } = useTaskMutations();
  const { createNote } = useTaskNoteMutations(task?._id);

  const t = detail || task;
  if (!t) return null;

  const isCompleted = t.status === 'COMPLETED';

  const assigneeName = t.assigneeId
    ? typeof t.assigneeId === 'object'
      ? `${t.assigneeId.firstName || ''} ${t.assigneeId.lastName || ''}`.trim()
      : t.assigneeId
    : null;

  const listName = t.listId
    ? typeof t.listId === 'object' ? t.listId.name : null
    : null;

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    createNote.mutate(newNote.trim(), { onSuccess: () => setNewNote('') });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto flex flex-col gap-0 p-0">
        {/* Header */}
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-start justify-between gap-3">
            <SheetTitle className="text-base leading-snug line-clamp-3 text-left">{t.title}</SheetTitle>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <TaskStatusBadge status={t.status} />
            {t.priority !== 'NONE' && <TaskPriorityBadge priority={t.priority} />}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => onEdit(t)}>
              <Pencil className="h-3.5 w-3.5" />
              {de ? 'Bearbeiten' : 'Edit'}
            </Button>
            {isCompleted ? (
              <Button
                size="sm" variant="outline" className="h-8 gap-1.5"
                onClick={() => reopenTask.mutate(t._id)}
                disabled={reopenTask.isPending}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {de ? 'Wieder öffnen' : 'Reopen'}
              </Button>
            ) : (
              <Button
                size="sm" variant="outline" className="h-8 gap-1.5 text-emerald-600 hover:text-emerald-700"
                onClick={() => completeTask.mutate({ id: t._id })}
                disabled={completeTask.isPending}
              >
                <CircleCheck className="h-3.5 w-3.5" />
                {de ? 'Abschließen' : 'Complete'}
              </Button>
            )}
            <Button
              size="sm" variant="ghost" className="h-8 gap-1.5 text-destructive hover:text-destructive ml-auto"
              onClick={() => removeTask.mutate(t._id, { onSuccess: () => onOpenChange(false) })}
              disabled={removeTask.isPending}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {de ? 'Löschen' : 'Delete'}
            </Button>
          </div>

          <Separator />

          {/* Properties */}
          <Section icon={Tag} title={de ? 'Eigenschaften' : 'Properties'}>
            <div className="space-y-2">
              {assigneeName && (
                <DetailRow label={de ? 'Zugewiesen' : 'Assignee'}>
                  <span className="text-sm">{assigneeName}</span>
                </DetailRow>
              )}
              {t.dueDate && (
                <DetailRow label={de ? 'Fällig' : 'Due'}>
                  <span className={cn(
                    'text-sm',
                    new Date(t.dueDate) < new Date() && !isCompleted ? 'text-red-600 font-medium' : '',
                  )}>
                    {formatDate(t.dueDate)}
                  </span>
                </DetailRow>
              )}
              {listName && (
                <DetailRow label={de ? 'Liste' : 'List'}>
                  <span className="text-sm">{listName}</span>
                </DetailRow>
              )}
              <DetailRow label={de ? 'Erstellt' : 'Created'}>
                <span className="text-sm text-muted-foreground">{formatDate(t.createdAt)}</span>
              </DetailRow>
            </div>
          </Section>

          {/* Description */}
          {t.description && (
            <>
              <Separator />
              <Section icon={FileText} title={de ? 'Beschreibung' : 'Description'}>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{t.description}</p>
              </Section>
            </>
          )}

          {/* Subtasks */}
          {subtasks.length > 0 && (
            <>
              <Separator />
              <Section icon={ChevronRight} title={de ? `Unteraufgaben (${subtasks.length})` : `Subtasks (${subtasks.length})`}>
                <div className="rounded-lg border overflow-hidden">
                  {subtasks.map((st) => (
                    <SubtaskRow key={st._id} subtask={st} de={de} />
                  ))}
                </div>
              </Section>
            </>
          )}

          {/* Notes */}
          <Separator />
          <Section icon={FileText} title={de ? `Notizen (${notes.length})` : `Notes (${notes.length})`}>
            <div className="space-y-2">
              {notes.map((n) => (
                <NoteRow key={n._id} note={n} taskId={t._id} de={de} />
              ))}
              <div className="flex gap-2">
                <Textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder={de ? 'Notiz hinzufügen...' : 'Add a note...'}
                  rows={2}
                  className="text-sm resize-none flex-1"
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddNote(); }}
                />
                <Button
                  size="icon" className="h-10 w-10 shrink-0 self-end"
                  onClick={handleAddNote}
                  disabled={!newNote.trim() || createNote.isPending}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
