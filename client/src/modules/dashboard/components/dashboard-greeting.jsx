'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, CheckSquare, FolderKanban, ListTodo, AlertTriangle, CalendarClock } from 'lucide-react';
import { taskService } from '@/modules/tasks/services/task-service';
import { useAuthStore } from '@/stores/auth-store';
import { useLanguage } from '@/lib/i18n/language-context';

/**
 * "Guten Morgen, {Vorname}" card: a one-glance day summary (open / due today /
 * overdue tasks) with the most important shortcuts, so users don't have to
 * think about where to click first (client feedback — Dashboard changes).
 */
export function DashboardGreeting() {
  const { t } = useLanguage();
  const user = useAuthStore((s) => s.user);
  const userId = user?._id || user?.id || null;

  const { data: stats } = useQuery({
    queryKey: ['tasks', 'dashboard', 'stats', 'greeting'],
    queryFn: () => taskService.getDashboardStats(),
    staleTime: 60_000,
  });
  const { data: dueToday } = useQuery({
    queryKey: ['tasks', 'greeting', 'dueToday', userId],
    queryFn: () => taskService.list({ assigneeId: userId, dueToday: true, hasParent: false, limit: 100 }),
    enabled: !!userId,
    staleTime: 60_000,
    select: (d) => (Array.isArray(d) ? d.length : (d?.data?.length ?? 0)),
  });

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 11) return t('dashboard.greetingMorning', 'Guten Morgen');
    if (h < 17) return t('dashboard.greetingDay', 'Guten Tag');
    return t('dashboard.greetingEvening', 'Guten Abend');
  }, [t]);

  const items = [
    { icon: CalendarClock, value: dueToday ?? '–', label: t('dashboard.greetDueToday', 'heute fällig'), cls: 'text-sky-600' },
    { icon: ListTodo, value: stats?.totalOpen ?? '–', label: t('dashboard.greetOpen', 'offene Aufgaben'), cls: 'text-indigo-600' },
    { icon: AlertTriangle, value: stats?.overdueCount ?? '–', label: t('dashboard.greetOverdue', 'überfällig'), cls: 'text-red-600' },
  ];

  const shortcuts = [
    { href: '/tasks', icon: CheckSquare, label: t('dashboard.greetTasks', 'Aufgaben') },
    { href: '/scheduling/calendar', icon: CalendarDays, label: t('dashboard.greetCalendar', 'Kalender') },
    { href: '/projects', icon: FolderKanban, label: t('dashboard.greetProjects', 'Projekte') },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-tight text-foreground">
            {greeting}, {user?.firstName || ''} 👋
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {items.map((it) => {
              const Icon = it.icon;
              return (
                <span key={it.label} className="inline-flex items-center gap-1.5">
                  <Icon className={`h-3.5 w-3.5 ${it.cls}`} />
                  <b className="tabular-nums text-foreground">{it.value}</b> {it.label}
                </span>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {shortcuts.map((s) => {
            const Icon = s.icon;
            return (
              <Link
                key={s.href}
                href={s.href}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
              >
                <Icon className="h-3.5 w-3.5" /> {s.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
