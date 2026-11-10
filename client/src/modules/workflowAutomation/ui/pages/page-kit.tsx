'use client';
import type { ComponentType, ReactNode, SVGProps } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import type { Pagination } from '../../types/workflow-types';

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

/** Elevated content panel used by every workflow screen. */
export function Panel({ title, description, action, children, className, bodyClassName, icon: Icon }: {
  title?: ReactNode; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; icon?: IconType;
}) {
  return (
    <section className={cn('rounded-2xl border bg-card text-card-foreground shadow-[0_1px_2px_rgb(15_23_42/0.04)] dark:border-white/10', className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3.5 sm:px-5 dark:border-white/10">
          <div className="flex min-w-0 items-center gap-2.5">
            {Icon && <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/8 text-primary"><Icon className="size-4" aria-hidden /></span>}
            <div className="min-w-0">
              {title && <h2 className="truncate text-sm font-semibold">{title}</h2>}
              {description && <p className="text-xs text-muted-foreground">{description}</p>}
            </div>
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </header>
      )}
      <div className={cn('p-4 sm:p-5', bodyClassName)}>{children}</div>
    </section>
  );
}

export function Kpi({ label, value, hint, icon: Icon, tone = 'blue' }: {
  label: string; value: ReactNode; hint?: ReactNode; icon: IconType; tone?: 'blue' | 'emerald' | 'amber' | 'rose' | 'cyan' | 'slate';
}) {
  const tones = {
    blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    cyan: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400',
    slate: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
  } as const;
  return (
    <div className="group relative overflow-hidden rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgb(15_23_42/0.04)] transition-shadow hover:shadow-md dark:border-white/10">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', tones[tone])}><Icon className="size-4" aria-hidden /></span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function KpiSkeleton({ count = 4 }: { count?: number }) {
  return <>{Array.from({ length: count }, (_, i) => <Skeleton key={i} className="h-[104px] rounded-2xl" />)}</>;
}

export function EmptyBlock({ icon: Icon = Inbox, title, description, action, className }: { icon?: IconType; title: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center', className)}>
      <span className="grid size-11 place-items-center rounded-xl bg-primary/8 text-primary"><Icon className="size-5" aria-hidden /></span>
      <p className="text-sm font-semibold">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorBlock({ onRetry }: { onRetry?: () => void }) {
  const { t } = useLanguage();
  return (
    <div role="alert" className="flex flex-col items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/5 px-6 py-8 text-center">
      <AlertTriangle className="size-5 text-rose-500" aria-hidden />
      <p className="text-sm font-medium">{t('workflowPages.common.loadError', 'This could not be loaded.')}</p>
      {onRetry && <Button size="sm" variant="outline" onClick={onRetry}>{t('workflowPages.common.retry', 'Try again')}</Button>}
    </div>
  );
}

export function Pager({ pagination, onPage }: { pagination?: Pagination; onPage: (page: number) => void }) {
  const { t } = useLanguage();
  if (!pagination || pagination.pages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 pt-4 text-xs text-muted-foreground">
      <span>{t('workflowPages.common.pageOf', 'Page {page} of {pages} · {total} total', { page: pagination.page, pages: pagination.pages, total: pagination.total })}</span>
      <div className="flex gap-1.5">
        <Button size="icon" variant="outline" className="size-8" disabled={pagination.page <= 1} onClick={() => onPage(pagination.page - 1)} aria-label={t('workflowPages.common.previous', 'Previous')}>
          <ChevronLeft className="size-4 rtl:rotate-180" />
        </Button>
        <Button size="icon" variant="outline" className="size-8" disabled={pagination.page >= pagination.pages} onClick={() => onPage(pagination.page + 1)} aria-label={t('workflowPages.common.next', 'Next')}>
          <ChevronRight className="size-4 rtl:rotate-180" />
        </Button>
      </div>
    </div>
  );
}

/** Progress bar split by segments (e.g. run statuses). */
export function SegmentBar({ segments, total, className }: { segments: Array<{ key: string; value: number; className: string; label: string }>; total: number; className?: string }) {
  if (!total) return <div className={cn('h-2 rounded-full bg-muted', className)} />;
  return (
    <div className={cn('flex h-2 overflow-hidden rounded-full bg-muted', className)} role="img" aria-label={segments.map((s) => `${s.label}: ${s.value}`).join(', ')}>
      {segments.filter((s) => s.value > 0).map((s) => (
        <span key={s.key} className={cn('h-full transition-all', s.className)} style={{ width: `${(s.value / total) * 100}%` }} title={`${s.label}: ${s.value}`} />
      ))}
    </div>
  );
}

export const RUN_SEGMENT_CLASSES: Record<string, string> = {
  completed: 'bg-emerald-500', running: 'bg-cyan-500', queued: 'bg-sky-400', pending: 'bg-slate-300', waiting: 'bg-sky-500',
  paused: 'bg-amber-400', failed: 'bg-rose-500', cancelled: 'bg-slate-400', skipped: 'bg-amber-600',
};

/** Translated label of a node type (shared catalog keys). */
export function useNodeLabel() {
  const { t } = useLanguage();
  return (type: string | null | undefined) => (type ? t(`workflow.node.${type}.label`, type) : '—');
}
