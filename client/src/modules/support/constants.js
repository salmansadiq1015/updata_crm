import { z } from 'zod';

export const TICKET_TYPES = ['feedback', 'bug', 'feature_request', 'other'];
export const TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
export const PRIORITY_LEVELS = ['low', 'normal', 'high', 'urgent'];

export const STATUS_CONFIG = {
  open: { color: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/30', dot: 'bg-blue-500' },
  in_progress: { color: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30', dot: 'bg-amber-500' },
  resolved: { color: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30', dot: 'bg-emerald-500' },
  closed: { color: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700', dot: 'bg-slate-400' },
};

export const TYPE_CONFIG = {
  feedback: { color: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-400 dark:border-cyan-500/30', dot: 'bg-cyan-500' },
  bug: { color: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30', dot: 'bg-red-500' },
  feature_request: { color: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/30', dot: 'bg-violet-500' },
  other: { color: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700', dot: 'bg-slate-400' },
};

export const PRIORITY_CONFIG = {
  low: { color: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700', dot: 'bg-slate-400' },
  normal: { color: 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/30', dot: 'bg-blue-400' },
  high: { color: 'bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/30', dot: 'bg-orange-500' },
  urgent: { color: 'bg-red-50 text-red-600 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30', dot: 'bg-red-500' },
};

export const ticketFormSchema = z.object({
  type: z.string().min(1),
  subject: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  priority: z.string().default('normal'),
});
