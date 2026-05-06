import type { TaskPriority, TaskStatus } from '../types/task-types';

export const TASK_STATUSES: TaskStatus[] = ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
export const TASK_PRIORITIES: TaskPriority[] = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  OPEN:       'To do',
  IN_PROGRESS:'In progress',
  COMPLETED:  'Complete',
  CANCELLED:  'Cancelled',
};

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  NONE:   'None',
  LOW:    'Low',
  MEDIUM: 'Medium',
  HIGH:   'High',
  URGENT: 'Urgent',
};

// ── Icon colors ─────────────────────────────────────────────────────────────
// Used on the lucide icon component as className

export const taskStatusIconColor: Record<TaskStatus, string> = {
  OPEN:        'text-muted-foreground',
  IN_PROGRESS: 'text-primary',
  COMPLETED:   'text-emerald-500',
  CANCELLED:   'text-danger',
};

export const taskPriorityIconColor: Record<TaskPriority, string> = {
  NONE:   'text-muted-foreground/50',
  LOW:    'text-sky-400',
  MEDIUM: 'text-amber-400',
  HIGH:   'text-orange-500',
  URGENT: 'text-red-500',
};

// ── Left border accent on task rows ─────────────────────────────────────────

export const taskPriorityBorderClass: Record<string, string> = {
  NONE:   'border-l-border',
  LOW:    'border-l-sky-400/50',
  MEDIUM: 'border-l-amber-400/70',
  HIGH:   'border-l-orange-500/70',
  URGENT: 'border-l-red-500',
};

// ── Legacy Select-based classes (drawer status/priority selects) ──────────
// Keep these for the detail drawer Selects until they are also redesigned.

export const taskStatusClass: Record<TaskStatus, string> = {
  OPEN:        'border-border bg-muted text-foreground',
  IN_PROGRESS: 'border-primary/30 bg-primary/15 text-primary',
  COMPLETED:   'border-emerald-500/30 bg-emerald-500/15 text-emerald-500',
  CANCELLED:   'border-danger/30 bg-danger/15 text-danger',
};

export const taskPriorityClass: Record<TaskPriority, string> = {
  NONE:   'border-border bg-muted text-muted-foreground',
  LOW:    'border-sky-400/30 bg-sky-400/10 text-sky-400',
  MEDIUM: 'border-amber-400/30 bg-amber-400/10 text-amber-400',
  HIGH:   'border-orange-500/30 bg-orange-500/15 text-orange-500',
  URGENT: 'border-red-500/30 bg-red-500/15 text-red-500',
};

// ── Color swatches ───────────────────────────────────────────────────────────

export const LIST_COLORS = [
  '#ef4444','#f97316','#eab308','#84cc16',
  '#22c55e','#14b8a6','#06b6d4','#3b82f6',
  '#8b5cf6','#ec4899','#64748b','#78716c',
  '#a3a3a3','#fbbf24','#4ade80','#38bdf8',
];

export const FOLDER_COLOR_OPTIONS = [
  { value: 'slate',  label: 'Slate',  class: 'text-slate-500'  },
  { value: 'red',    label: 'Red',    class: 'text-red-500'    },
  { value: 'orange', label: 'Orange', class: 'text-orange-500' },
  { value: 'amber',  label: 'Amber',  class: 'text-amber-400'  },
  { value: 'green',  label: 'Green',  class: 'text-green-500'  },
  { value: 'teal',   label: 'Teal',   class: 'text-teal-500'   },
  { value: 'blue',   label: 'Blue',   class: 'text-blue-500'   },
  { value: 'violet', label: 'Violet', class: 'text-violet-500' },
  { value: 'pink',   label: 'Pink',   class: 'text-pink-500'   },
];
