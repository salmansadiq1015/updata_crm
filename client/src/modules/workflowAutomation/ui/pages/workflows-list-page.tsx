'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Archive, Copy, GitBranch, MoreHorizontal, Pause, PencilRuler, Play, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PageHeader } from '@/shared/components/page-header';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useLanguage } from '@/lib/i18n/language-context';
import { useWorkflowMutations, useWorkflows } from '../../hooks/use-workflows';
import { formatNumber, formatPercent, formatRelative, personName } from '../../lib/format';
import type { ListFilters, WorkflowListItem, WorkflowStatus } from '../../types/workflow-types';
import { WorkflowStatusBadge } from '../shared/status-badge';
import { EmptyBlock, ErrorBlock, Pager, Panel, useNodeLabel } from './page-kit';

const STATUSES: WorkflowStatus[] = ['draft', 'published', 'paused', 'archived'];

export function WorkflowsListPage() {
  const { t, locale } = useLanguage();
  const router = useRouter();
  const nodeLabel = useNodeLabel();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission('workflow:write');
  const canPublish = hasPermission('workflow:publish');
  const [filters, setFilters] = useState<ListFilters>({ search: '', status: '', sortBy: 'updatedAt', sortOrder: 'desc', page: 1, limit: 20 });
  const [archiveTarget, setArchiveTarget] = useState<WorkflowListItem | null>(null);
  const query = useWorkflows(filters);
  const m = useWorkflowMutations();
  const set = (patch: Partial<ListFilters>) => setFilters((f) => ({ ...f, page: 1, ...patch }));
  const rows = query.data?.data || [];

  const duplicate = (w: WorkflowListItem) => m.duplicate.mutate(w._id, { onSuccess: (copy) => router.push(`/automation/workflows/${copy._id}`) });

  return (
    <div className="space-y-6">
      <PageHeader title={t('workflow.nav.workflows', 'Workflows')} description={t('workflowPages.list.description', 'Every automation, its live version and how it performs.')} icon={GitBranch} count={query.data?.pagination.total}>
        {canWrite && <Button asChild className="gap-2"><Link href="/automation/new"><Plus className="size-4" />{t('workflow.nav.create', 'Create workflow')}</Link></Button>}
      </PageHeader>

      <Panel bodyClassName="p-0">
        <div className="flex flex-col gap-2 border-b p-3 sm:flex-row sm:items-center sm:p-4 dark:border-white/10">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={filters.search} onChange={(e) => set({ search: e.target.value })} placeholder={t('workflowPages.list.search', 'Search workflows…')} className="ps-9" aria-label={t('workflowPages.list.search', 'Search workflows…')} />
          </div>
          <Select value={filters.status || 'all'} onValueChange={(v) => set({ status: v === 'all' ? '' : (v as WorkflowStatus) })}>
            <SelectTrigger className="sm:w-44" aria-label={t('workflowPages.common.status', 'Status')}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('workflowPages.list.allStatuses', 'All statuses')}</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`workflow.status.${s}`, s)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={`${filters.sortBy}:${filters.sortOrder}`} onValueChange={(v) => { const [sortBy, sortOrder] = v.split(':'); set({ sortBy: sortBy as ListFilters['sortBy'], sortOrder: sortOrder as 'asc' | 'desc' }); }}>
            <SelectTrigger className="sm:w-52" aria-label={t('workflowPages.list.sort', 'Sort')}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="updatedAt:desc">{t('workflowPages.list.sortRecent', 'Recently modified')}</SelectItem>
              <SelectItem value="createdAt:desc">{t('workflowPages.list.sortNewest', 'Newest first')}</SelectItem>
              <SelectItem value="name:asc">{t('workflowPages.list.sortName', 'Name A–Z')}</SelectItem>
              <SelectItem value="publishedAt:desc">{t('workflowPages.list.sortPublished', 'Recently published')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {query.isLoading ? <div className="space-y-2 p-4">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
          : query.isError ? <div className="p-4"><ErrorBlock onRetry={() => query.refetch()} /></div>
          : rows.length === 0 ? (
            <div className="p-4"><EmptyBlock icon={GitBranch}
              title={filters.search || filters.status ? t('workflowPages.list.noMatch', 'No workflows match these filters') : t('workflowPages.list.emptyTitle', 'No workflows yet')}
              description={filters.search || filters.status ? undefined : t('workflowPages.list.emptyHint', 'Start from a template or build your own automation on a blank canvas.')}
              action={canWrite && !filters.search && !filters.status ? <Button size="sm" asChild><Link href="/automation/new">{t('workflow.nav.create', 'Create workflow')}</Link></Button> : undefined} /></div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead className="text-start text-xs text-muted-foreground">
                    <tr className="border-b dark:border-white/10">
                      <th className="px-5 py-2.5 text-start font-medium">{t('workflowPages.list.colName', 'Workflow')}</th>
                      <th className="px-3 py-2.5 text-start font-medium">{t('workflowPages.common.status', 'Status')}</th>
                      <th className="px-3 py-2.5 text-start font-medium">{t('workflowPages.list.colTrigger', 'Trigger')}</th>
                      <th className="px-3 py-2.5 text-end font-medium">{t('workflowPages.list.colExecutions', 'Executions')}</th>
                      <th className="px-3 py-2.5 text-end font-medium">{t('workflowPages.list.colSuccess', 'Success')}</th>
                      <th className="px-3 py-2.5 text-start font-medium">{t('workflowPages.list.colModified', 'Last modified')}</th>
                      <th className="px-3 py-2.5"><span className="sr-only">{t('workflowPages.common.actions', 'Actions')}</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y dark:divide-white/10">
                    {rows.map((w) => (
                      <tr key={w._id} data-testid="workflow-row" className="group cursor-pointer transition-colors hover:bg-muted/40" onClick={() => router.push(`/automation/workflows/${w._id}`)}>
                        <td className="max-w-[320px] px-5 py-3">
                          <p className="truncate font-medium group-hover:text-primary">{w.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{w.description || (w.publishedVersion ? t('workflow.common.version', 'v{version}', { version: w.publishedVersion }) : t('workflowPages.list.neverPublished', 'Not published yet'))}</p>
                        </td>
                        <td className="px-3 py-3"><div className="flex items-center gap-1.5"><WorkflowStatusBadge status={w.status} />{w.publishedVersion ? <span className="text-xs text-muted-foreground">{t('workflow.common.version', 'v{version}', { version: w.publishedVersion })}</span> : null}</div></td>
                        <td className="px-3 py-3 text-muted-foreground">{nodeLabel(w.triggerType)}</td>
                        <td className="px-3 py-3 text-end tabular-nums">
                          {formatNumber(w.stats?.total || 0, locale)}
                          {(w.stats?.active || 0) > 0 && <span className="ms-1 text-xs text-cyan-600 dark:text-cyan-400">({t('workflowPages.list.activeCount', '{count} active', { count: w.stats.active })})</span>}
                        </td>
                        <td className="px-3 py-3 text-end tabular-nums">{formatPercent(w.stats?.successRate ?? null, locale)}</td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">
                          <span className="block">{formatRelative(w.updatedAt, locale)}</span>
                          <span className="block truncate">{personName(w.updatedBy) || personName(w.createdBy)}</span>
                        </td>
                        <td className="px-3 py-3 text-end" onClick={(e) => e.stopPropagation()}>
                          <RowActions w={w} canWrite={canWrite} canPublish={canPublish} onDuplicate={duplicate} onArchive={setArchiveTarget} onStatus={(status) => m.setStatus.mutate({ id: w._id, status })} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="divide-y md:hidden dark:divide-white/10">
                {rows.map((w) => (
                  <li key={w._id} data-testid="workflow-card" className="flex items-start gap-3 p-4">
                    <Link href={`/automation/workflows/${w._id}`} className="min-w-0 flex-1">
                      <p className="truncate font-medium">{w.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{nodeLabel(w.triggerType)} · {formatRelative(w.updatedAt, locale)}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <WorkflowStatusBadge status={w.status} />
                        <span>{t('workflowPages.list.runsCount', '{count} runs', { count: w.stats?.total || 0 })}</span>
                        <span>{formatPercent(w.stats?.successRate ?? null, locale)}</span>
                      </div>
                    </Link>
                    <RowActions w={w} canWrite={canWrite} canPublish={canPublish} onDuplicate={duplicate} onArchive={setArchiveTarget} onStatus={(status) => m.setStatus.mutate({ id: w._id, status })} />
                  </li>
                ))}
              </ul>
            </>
          )}
        <div className="px-4 pb-4 sm:px-5"><Pager pagination={query.data?.pagination} onPage={(page) => setFilters((f) => ({ ...f, page }))} /></div>
      </Panel>

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open: boolean) => !open && setArchiveTarget(null)}
        title={t('workflowPages.list.archiveTitle', 'Archive “{name}”?', { name: archiveTarget?.name || '' })}
        description={t('workflowPages.list.archiveHint', 'No new contacts will enter it. Running executions finish normally and the history stays available.')}
        confirmText={t('workflowPages.list.archive', 'Archive')}
        cancelText={t('workflowPages.common.cancel', 'Cancel')}
        loading={m.setStatus.isPending}
        onConfirm={() => archiveTarget && m.setStatus.mutate({ id: archiveTarget._id, status: 'archived' }, { onSettled: () => setArchiveTarget(null) })}
      />
    </div>
  );
}

function RowActions({ w, canWrite, canPublish, onDuplicate, onArchive, onStatus }: {
  w: WorkflowListItem; canWrite: boolean; canPublish: boolean;
  onDuplicate: (w: WorkflowListItem) => void; onArchive: (w: WorkflowListItem) => void; onStatus: (s: 'published' | 'paused') => void;
}) {
  const { t } = useLanguage();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" aria-label={t('workflowPages.common.actions', 'Actions')}><MoreHorizontal className="size-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem asChild><Link href={`/automation/workflows/${w._id}`} className="gap-2"><PencilRuler className="size-4" />{t('workflowPages.list.openBuilder', 'Open builder')}</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href={`/automation/executions?workflowId=${w._id}`} className="gap-2"><Play className="size-4" />{t('workflowPages.list.viewExecutions', 'View executions')}</Link></DropdownMenuItem>
        {canWrite && <DropdownMenuItem className="gap-2" onSelect={() => onDuplicate(w)}><Copy className="size-4" />{t('workflowPages.list.duplicate', 'Duplicate')}</DropdownMenuItem>}
        {canPublish && w.status === 'published' && <DropdownMenuItem className="gap-2" onSelect={() => onStatus('paused')}><Pause className="size-4" />{t('workflowPages.list.pause', 'Pause new enrollments')}</DropdownMenuItem>}
        {canPublish && w.status === 'paused' && w.publishedVersion && <DropdownMenuItem className="gap-2" onSelect={() => onStatus('published')}><Play className="size-4" />{t('workflowPages.list.reactivate', 'Reactivate')}</DropdownMenuItem>}
        {canPublish && w.status !== 'archived' && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive" onSelect={() => onArchive(w)}><Archive className="size-4" />{t('workflowPages.list.archive', 'Archive')}</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
