import type { TaskPriority, TaskStatus } from '../types/task-types';

export const TASK_STATUSES: TaskStatus[] = ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
export const TASK_PRIORITIES: TaskPriority[] = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  OPEN: 'To do',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Complete',
  CANCELLED: 'Cancelled',
};

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  NONE: 'None',
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

export const taskStatusClass: Record<TaskStatus, string> = {
  OPEN: 'border-border bg-muted text-foreground',
  IN_PROGRESS: 'border-primary/30 bg-primary/15 text-primary',
  COMPLETED: 'border-success/30 bg-success/15 text-success',
  CANCELLED: 'border-danger/30 bg-danger/15 text-danger',
};

export const taskPriorityClass: Record<TaskPriority, string> = {
  NONE: 'border-border bg-muted text-muted-foreground',
  LOW: 'border-secondary/30 bg-secondary/10 text-secondary',
  MEDIUM: 'border-warning/30 bg-warning/10 text-warning',
  HIGH: 'border-primary/30 bg-primary/15 text-primary',
  URGENT: 'border-danger/30 bg-danger/15 text-danger',
};

export const taskPriorityBorderClass: Record<string, string> = {
  NONE: 'border-l-border',
  LOW: 'border-l-blue-400/50',
  MEDIUM: 'border-l-yellow-400/70',
  HIGH: 'border-l-orange-500/70',
  URGENT: 'border-l-red-500',
};

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
