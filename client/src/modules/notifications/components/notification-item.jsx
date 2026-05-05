'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import {
  CheckSquare, Package, MessageSquare, Settings,
  DollarSign, Wrench, FileText, Users, FolderKanban, CalendarClock, Bell,
} from 'lucide-react';

const CATEGORY_ICONS = {
  TASK: CheckSquare,
  ORDER: Package,
  CHAT: MessageSquare,
  SYSTEM: Settings,
  FINANCE: DollarSign,
  MAINTENANCE: Wrench,
  DOCUMENT: FileText,
  CRM: Users,
  PROJECT: FolderKanban,
  SCHEDULING: CalendarClock,
};

const CATEGORY_COLORS = {
  TASK: 'text-emerald-500 bg-emerald-500/10',
  ORDER: 'text-blue-500 bg-blue-500/10',
  CHAT: 'text-violet-500 bg-violet-500/10',
  SYSTEM: 'text-slate-500 bg-slate-500/10',
  FINANCE: 'text-amber-500 bg-amber-500/10',
  MAINTENANCE: 'text-orange-500 bg-orange-500/10',
  DOCUMENT: 'text-sky-500 bg-sky-500/10',
  CRM: 'text-pink-500 bg-pink-500/10',
  PROJECT: 'text-indigo-500 bg-indigo-500/10',
  SCHEDULING: 'text-teal-500 bg-teal-500/10',
};

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Jetzt';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export function NotificationItem({ notification: n, onMarkRead, onDismiss, compact = false }) {
  const Icon = CATEGORY_ICONS[n.category] || Bell;
  const colorCls = CATEGORY_COLORS[n.category] || 'text-slate-500 bg-slate-500/10';

  return (
    <div
      className={cn(
        'group flex items-start gap-3 transition-colors cursor-pointer',
        compact ? 'px-4 py-3 hover:bg-muted/50' : 'px-4 py-4 rounded-xl hover:bg-muted/40',
        !n.isRead && !compact && 'bg-primary/[0.03]',
      )}
      onClick={() => !n.isRead && onMarkRead?.(n._id || n.id)}
    >
      {/* Icon */}
      <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5', colorCls)}>
        <Icon className="h-4 w-4" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={cn('text-sm leading-snug', !n.isRead ? 'font-semibold' : 'font-medium text-muted-foreground')}>
            {n.title}
          </p>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">{timeAgo(n.sentAt)}</span>
            {onDismiss && (
              <Button
                size="icon"
                variant="ghost"
                className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => { e.stopPropagation(); onDismiss(n._id || n.id); }}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
        <p className={cn('text-xs mt-0.5', compact ? 'line-clamp-1' : 'line-clamp-2', 'text-muted-foreground')}>
          {n.body}
        </p>
      </div>

      {/* Unread dot */}
      {!n.isRead && (
        <span className="mt-2 h-2 w-2 rounded-full bg-primary shrink-0" />
      )}
    </div>
  );
}
