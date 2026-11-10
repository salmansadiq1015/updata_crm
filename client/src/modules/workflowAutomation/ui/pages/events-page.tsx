'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { History } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/shared/components/page-header';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { useWorkflowEvents, useWorkflows } from '../../hooks/use-workflows';
import { leadName, localeTag, personName, refId, refName } from '../../lib/format';
import type { EventFilters, WorkflowEventItem } from '../../types/workflow-types';
import { EmptyBlock, ErrorBlock, Pager, Panel } from './page-kit';

const TYPE_GROUPS = ['run.*', 'node.*', 'branch.*', 'manual.*', 'signal.*', 'link.*', 'workflow.*', 'schedule.*'];

function tone(type: string) {
  if (/failed/.test(type)) return 'bg-rose-500';
  if (type.startsWith('manual.')) return 'bg-amber-500';
  if (type.startsWith('signal.') || type.startsWith('link.')) return 'bg-cyan-500';
  if (type === 'run.completed') return 'bg-emerald-500';
  if (type.startsWith('branch.')) return 'bg-blue-600';
  return 'bg-sky-500';
}

export function EventsPage() {
  const { t, locale } = useLanguage();
  const [filters, setFilters] = useState<EventFilters>({ type: '', workflowId: '', from: '', to: '', page: 1, limit: 50 });
  const set = (patch: Partial<EventFilters>) => setFilters((f) => ({ ...f, page: 1, ...patch }));
  const query = useWorkflowEvents({
    ...filters,
    from: filters.from ? new Date(`${filters.from}T00:00:00`).toISOString() : undefined,
    to: filters.to ? new Date(`${filters.to}T23:59:59`).toISOString() : undefined,
  });
  const workflows = useWorkflows({ limit: 100, sortBy: 'name', sortOrder: 'asc' });

  const days = useMemo(() => {
    const groups = new Map<string, WorkflowEventItem[]>();
    for (const e of query.data?.data || []) {
      const key = new Date(e.at).toISOString().slice(0, 10);
      groups.set(key, [...(groups.get(key) || []), e]);
    }
    return [...groups.entries()];
  }, [query.data]);
  const dayFmt = new Intl.DateTimeFormat(localeTag(locale), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeFmt = new Intl.DateTimeFormat(localeTag(locale), { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="space-y-6">
      <PageHeader title={t('workflow.nav.events', 'Event history')} description={t('workflowPages.events.description', 'One chronological record of calls, messages, clicks, branch decisions, CRM updates and manual actions.')} icon={History} />
      <Panel bodyClassName="p-0">
        <div className="grid gap-2 border-b p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-4 dark:border-white/10">
          <Select value={filters.type || 'all'} onValueChange={(v) => set({ type: v === 'all' ? '' : v })}>
            <SelectTrigger aria-label={t('workflowPages.events.type', 'Event type')}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('workflowPages.events.allTypes', 'All event types')}</SelectItem>
              {TYPE_GROUPS.map((g) => <SelectItem key={g} value={g}>{t(`workflowPages.events.group.${g.slice(0, -2)}`, g)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.workflowId || 'all'} onValueChange={(v) => set({ workflowId: v === 'all' ? '' : v })}>
            <SelectTrigger aria-label={t('workflowPages.executions.colWorkflow', 'Workflow')}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('workflowPages.executions.allWorkflows', 'All workflows')}</SelectItem>
              {(workflows.data?.data || []).map((w) => <SelectItem key={w._id} value={w._id}>{w.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => set({ from: e.target.value })} aria-label={t('workflowPages.events.from', 'From')} />
          <Input type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => set({ to: e.target.value })} aria-label={t('workflowPages.events.to', 'To')} />
        </div>
        <div className="p-4 sm:p-5">
          {query.isLoading ? <div className="space-y-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>
            : query.isError ? <ErrorBlock onRetry={() => query.refetch()} />
            : days.length === 0 ? <EmptyBlock icon={History} title={t('workflowPages.events.empty', 'No events yet.')} description={t('workflowPages.events.emptyHint', 'Events are recorded as soon as workflows run.')} />
            : (
              <div className="space-y-6">
                {days.map(([day, items]) => (
                  <section key={day}>
                    <h3 className="sticky top-0 z-[1] mb-3 bg-card/95 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">{dayFmt.format(new Date(`${day}T12:00:00`))}</h3>
                    <ol className="relative space-y-3 border-s ps-5 dark:border-white/10">
                      {items.map((e) => {
                        const data = (e.data || {}) as Record<string, unknown>;
                        return (
                          <li key={e._id} data-testid="event-item" className="relative">
                            <span className={cn('absolute -start-[27px] top-1.5 size-3 rounded-full border-2 border-card', tone(e.type))} />
                            <div className="flex flex-wrap items-baseline gap-x-2">
                              <time className="w-[70px] shrink-0 text-xs tabular-nums text-muted-foreground" dateTime={e.at}>{timeFmt.format(new Date(e.at))}</time>
                              <span className="text-sm font-medium">{t(`workflow.event.${e.type}`, e.type)}</span>
                              {typeof data.port === 'string' && <span className="text-xs text-muted-foreground">→ {t(`workflow.port.${data.port}`, data.port)}</span>}
                            </div>
                            <div className="ms-[78px] flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                              {e.leadId && <Link className="hover:text-primary" href={`/leads?detail=${refId(e.leadId as never)}`}>{leadName(e.leadId, t('workflow.common.unknownLead', 'Unknown lead'))}</Link>}
                              {e.workflowId && <Link className="hover:text-primary" href={`/automation/workflows/${refId(e.workflowId as never)}`}>{refName(e.workflowId as never)}</Link>}
                              {e.runId && <Link className="text-primary hover:underline" href={`/automation/executions/${e.runId}`}>{t('workflowPages.events.openRun', 'Open execution')}</Link>}
                              {e.actor && <span>{personName(e.actor)}</span>}
                              {typeof data.message === 'string' && <span className="text-rose-600 dark:text-rose-400">{data.message}</span>}
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  </section>
                ))}
              </div>
            )}
          <Pager pagination={query.data?.pagination} onPage={(page) => setFilters((f) => ({ ...f, page }))} />
        </div>
      </Panel>
    </div>
  );
}
