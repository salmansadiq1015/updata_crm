'use client';

import { useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { Circle, CircleCheck, CircleDashed, CirclePause, CircleX, Flag, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import type { Task, TaskStatus } from '../types/task-types';
import { taskPriorityIconColor } from './task-ui-constants';

const STATUS_ICON = {
  OPEN: Circle,
  IN_PROGRESS: CircleDashed,
  ON_HOLD: CirclePause,
  COMPLETED: CircleCheck,
  CANCELLED: CircleX,
} as const;

const STATUS_CYCLE: Record<TaskStatus, TaskStatus> = {
  OPEN: 'IN_PROGRESS',
  IN_PROGRESS: 'COMPLETED',
  ON_HOLD: 'IN_PROGRESS',
  COMPLETED: 'OPEN',
  CANCELLED: 'OPEN',
};

const STATUS_COLOR: Record<TaskStatus, string> = {
  OPEN: 'text-muted-foreground',
  IN_PROGRESS: 'text-primary',
  ON_HOLD: 'text-amber-500',
  COMPLETED: 'text-emerald-500',
  CANCELLED: 'text-red-500',
};

type SubtasksPanelProps = {
  parentId: string;
  subtasks: Task[];
  isLoading: boolean;
  onCreateSubtask: (title: string) => void;
  onPatchSubtask: (id: string, status: TaskStatus) => void;
  onDeleteSubtask: (id: string) => void;
};

export function TaskSubtasksPanel({
  parentId,
  subtasks,
  isLoading,
  onCreateSubtask,
  onPatchSubtask,
  onDeleteSubtask,
}: SubtasksPanelProps) {
  const { language } = useLanguage();
  const [newTitle, setNewTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const completed = subtasks.filter((s) => s.status === 'COMPLETED').length;
  const total = subtasks.length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  const handleAdd = () => {
    const t = newTitle.trim();
    if (!t) return;
    onCreateSubtask(t);
    setNewTitle('');
    inputRef.current?.focus();
  };

  return (
    <section>
      {total > 0 && (
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            {completed} {language === 'de' ? 'von' : 'of'} {total} {language === 'de' ? 'erledigt' : 'complete'}
          </span>
          <div className="flex items-center gap-2">
            <div className="h-1 w-28 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="w-8 text-right text-[11px] font-medium text-muted-foreground">
              {progress}%
            </span>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : (
        <div className="space-y-0.5 rounded-lg overflow-hidden">
          {subtasks.map((sub) => {
            const Icon = STATUS_ICON[sub.status];
            return (
              <div
                key={sub.id ?? sub._id}
                className="group flex items-center gap-2 rounded-lg border border-transparent px-3 py-2 transition-colors hover:border-border/50 hover:bg-muted/30"
              >
                <button
                  type="button"
                  className="shrink-0"
                  title={language === 'de' ? `Status: ${sub.status}. Klicken zum Wechseln.` : `Status: ${sub.status}. Click to cycle.`}
                  onClick={() =>
                    onPatchSubtask(sub.id, STATUS_CYCLE[sub.status])
                  }
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 transition-colors hover:opacity-70",
                      STATUS_COLOR[sub.status],
                    )}
                  />
                </button>
                <span
                  className={cn(
                    "flex-1 text-sm leading-snug",
                    sub.status === "COMPLETED" &&
                      "text-muted-foreground line-through",
                    sub.status === "CANCELLED" &&
                      "text-muted-foreground/60 line-through",
                  )}
                >
                  {sub.title}
                </span>
                {sub.priority !== "NONE" && (
                  <Flag
                    className={cn(
                      "h-3 w-3 shrink-0 fill-current opacity-70",
                      taskPriorityIconColor[sub.priority],
                    )}
                  />
                )}
                <button
                  type="button"
                  className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => onDeleteSubtask(sub.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add subtask input */}
      <div className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-border/60 bg-background/40 px-3 py-1.5 transition-all hover:border-border focus-within:border-primary focus-within:bg-background focus-within:shadow-[0_0_0_2px_hsl(var(--primary)/0.15)]">
        <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
        <Input
          type="text"
          ref={inputRef}
          value={newTitle}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setNewTitle(e.target.value)}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) =>
            e.key === 'Enter' && handleAdd()
          }
          placeholder={language === 'de' ? 'Unteraufgabe hinzufügen…' : 'Add subtask…'}
          className="h-7 border-none bg-transparent px-1 text-sm shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/40"
        />
        {newTitle.trim() && (
          <Button
            size="sm"
            className="h-6 shrink-0 px-2.5 text-xs"
            onClick={handleAdd}
          >
            {language === 'de' ? 'Hinzufügen' : 'Add'}
          </Button>
        )}
      </div>
    </section>
  );
}
