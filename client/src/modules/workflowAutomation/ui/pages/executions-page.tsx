'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ListChecks } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/shared/components/page-header';
import { useLanguage } from '@/lib/i18n/language-context';
import { useWorkflowRuns, useWorkflows } from '../../hooks/use-workflows';
import { formatDateTime, formatRelative, leadName, refName } from '../../lib/format';
import type { RunFilters, RunStatus, WorkflowRun } from '../../types/workflow-types';
import { OutcomeBadge, RunStatusBadge } from '../shared/status-badge';
import { EmptyBlock, ErrorBlock, Pager, Panel, useNodeLabel } from './page-kit';

const RUN_STATUSES: Array<RunStatus | 'active'> = ['active', 'running', 'waiting', 'paused', 'completed', 'failed', 'cancelled', 'skipped'];

export function RunsTable({ runs, showWorkflow = true }: { runs: WorkflowRun[]; showWorkflow?: boolean }) {
  const { t, locale } = useLanguage();
  const router = useRouter();
  const nodeLabel = useNodeLabel();
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b dark:border-white/10">
              <th className="px-5 py-2.5 text-start font-medium">{t('workflowPages.executions.colLead', 'Contact')}</th>
              {showWorkflow && <th className="px-3 py-2.5 text-start font-medium">{t('workflowPages.executions.colWorkflow', 'Workflow')}</th>}
              <th className="px-3 py-2.5 text-start font-medium">{t('workflowPages.common.status', 'Status')}</th>
              <th className="px-3 py-2.5 text-start font-medium">{t('workflowPages.executions.colStep', 'Current step')}</th>
              <th className="px-3 py-2.5 text-start font-medium">{t('workflowPages.executions.colNext', 'Next action')}</th>
              <th className="px-3 py-2.5 text-start font-medium">{t('workflowPages.executions.colOutcome', 'Outcome')}</th>
              <th className="px-3 py-2.5 text-start font-medium">{t('workflowPages.executions.colUpdated', 'Updated')}</th>
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-white/10">
            {runs.map((r) => (
              <tr key={r._id} data-testid="run-row" className="group cursor-pointer transition-colors hover:bg-muted/40" onClick={() => router.push(`/automation/executions/${r._id}`)}>
                <td className="max-w-[220px] px-5 py-3"><p className="truncate font-medium group-hover:text-primary">{leadName(r.leadId, t('workflow.common.unknownLead', 'Unknown lead'))}</p>
                  <p className="truncate text-xs text-muted-foreground">{typeof r.leadId === 'object' ? r.leadId?.leadNumber : ''}</p></td>
                {showWorkflow && <td className="max-w-[220px] px-3 py-3"><p className="truncate">{refName(r.workflowId)}</p><p className="text-xs text-muted-foreground">{t('workflow.common.version', 'v{version}', { version: r.version })}</p></td>}
                <td className="px-3 py-3"><RunStatusBadge status={r.status} /></td>
                <td className="max-w-[200px] px-3 py-3"><p className="truncate">{r.currentStep ? (r.currentStep.label || nodeLabel(r.currentStep.type)) : '—'}</p>
                  {r.stepTotal ? <p className="text-xs text-muted-foreground">{t('workflowPages.executions.stepsDone', '{count} steps', { count: r.stepTotal })}</p> : null}</td>
                <td className="px-3 py-3 text-xs text-muted-foreground">
                  {r.status === 'waiting' && r.wait?.kind ? <><span className="block text-foreground">{t(`workflow.wait.${r.wait.kind}`, r.wait.kind)}</span><span>{r.nextRunAt ? formatDateTime(r.nextRunAt, locale) : '—'}</span></> : '—'}
                </td>
                <td className="px-3 py-3">{r.outcome ? <OutcomeBadge outcome={r.outcome} /> : r.error?.code ? <span className="text-xs text-rose-600 dark:text-rose-400">{r.error.code}</span> : '—'}</td>
                <td className="px-3 py-3 text-xs text-muted-foreground">{formatRelative(r.updatedAt, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y md:hidden dark:divide-white/10">
        {runs.map((r) => (
          <li key={r._id}>
            <button type="button" onClick={() => router.push(`/automation/executions/${r._id}`)} className="flex w-full items-start gap-3 p-4 text-start">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{leadName(r.leadId, t('workflow.common.unknownLead', 'Unknown lead'))}</span>
                <span className="block truncate text-xs text-muted-foreground">{showWorkflow ? `${refName(r.workflowId)} · ` : ''}{r.currentStep ? (r.currentStep.label || nodeLabel(r.currentStep.type)) : '—'}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{formatRelative(r.updatedAt, locale)}</span>
              </span>
              <RunStatusBadge status={r.status} />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

export function ExecutionsPage() {
  const { t } = useLanguage();
  const params = useSearchParams();
  const [filters, setFilters] = useState<RunFilters>({ status: (params.get('status') as RunStatus) || '', workflowId: params.get('workflowId') || '', page: 1, limit: 25 });
  const workflows = useWorkflows({ limit: 100, sortBy: 'name', sortOrder: 'asc' });
  const query = useWorkflowRuns(filters);
  const set = (patch: Partial<RunFilters>) => setFilters((f) => ({ ...f, page: 1, ...patch }));

  return (
    <div className="space-y-6">
      <PageHeader title={t('workflow.nav.executions', 'Executions')} description={t('workflowPages.executions.description', 'Every contact moving through a workflow — where it is, what it waits for and how it ended.')} icon={ListChecks} count={query.data?.pagination.total} />
      <Panel bodyClassName="p-0">
        <div className="flex flex-col gap-2 border-b p-3 sm:flex-row sm:p-4 dark:border-white/10">
          <Select value={filters.status || 'all'} onValueChange={(v) => set({ status: v === 'all' ? '' : (v as RunStatus) })}>
            <SelectTrigger className="sm:w-48" aria-label={t('workflowPages.common.status', 'Status')}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('workflowPages.list.allStatuses', 'All statuses')}</SelectItem>
              {RUN_STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`workflow.runStatus.${s}`, s)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.workflowId || 'all'} onValueChange={(v) => set({ workflowId: v === 'all' ? '' : v })}>
            <SelectTrigger className="sm:w-72" aria-label={t('workflowPages.executions.colWorkflow', 'Workflow')}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('workflowPages.executions.allWorkflows', 'All workflows')}</SelectItem>
              {(workflows.data?.data || []).map((w) => <SelectItem key={w._id} value={w._id}>{w.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {query.isLoading ? <div className="space-y-2 p-4">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
          : query.isError ? <div className="p-4"><ErrorBlock onRetry={() => query.refetch()} /></div>
          : !query.data?.data.length ? <div className="p-4"><EmptyBlock icon={ListChecks} title={filters.status || filters.workflowId ? t('workflowPages.executions.noMatch', 'No executions match these filters') : t('workflowPages.executions.emptyTitle', 'No executions yet')} description={t('workflowPages.executions.emptyHint', 'Executions appear here as soon as a published workflow enrolls a contact.')} /></div>
          : <RunsTable runs={query.data.data} />}
        <div className="px-4 pb-4 sm:px-5"><Pager pagination={query.data?.pagination} onPage={(page) => setFilters((f) => ({ ...f, page }))} /></div>
      </Panel>
    </div>
  );
}
