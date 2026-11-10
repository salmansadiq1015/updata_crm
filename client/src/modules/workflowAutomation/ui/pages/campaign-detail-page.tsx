'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CircleSlash, Megaphone, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/shared/components/page-header';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useLanguage } from '@/lib/i18n/language-context';
import { useWorkflowCampaign, useWorkflowRuns } from '../../hooks/use-workflows';
import { formatDateTime, formatNumber, refId, refName } from '../../lib/format';
import type { EndOutcome, RunStatus } from '../../types/workflow-types';
import { CampaignStatusBadge, OutcomeBadge } from '../shared/status-badge';
import { CampaignActions, useCampaignActionConfirm } from './campaigns-page';
import { RunsTable } from './executions-page';
import { EmptyBlock, ErrorBlock, Kpi, Pager, Panel, RUN_SEGMENT_CLASSES, SegmentBar } from './page-kit';

export function CampaignDetailPage({ id }: { id: string }) {
  const { t, locale } = useLanguage();
  const { hasPermission } = usePermissions();
  const query = useWorkflowCampaign(id);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<RunStatus | ''>('');
  const runs = useWorkflowRuns({ campaignId: id, page, limit: 20, status });
  const confirm = useCampaignActionConfirm();
  const c = query.data;

  if (query.isError) return <ErrorBlock onRetry={() => query.refetch()} />;
  if (!c) return <div className="space-y-4"><Skeleton className="h-16 rounded-xl" /><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div><Skeleton className="h-72 rounded-2xl" /></div>;

  const by = c.progress?.byStatus || {};
  const total = c.progress?.total || 0;
  const active = (by.queued || 0) + (by.running || 0) + (by.waiting || 0) + (by.pending || 0) + (by.paused || 0);

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ms-2 gap-1"><Link href="/automation/campaigns"><ArrowLeft className="size-4 rtl:rotate-180" />{t('workflow.nav.campaigns', 'Campaigns')}</Link></Button>
      <PageHeader title={c.name} icon={Megaphone} description={c.description || undefined}>
        <div className="flex items-center gap-2">
          <CampaignStatusBadge status={c.status} />
          {hasPermission('workflow:execute') && <CampaignActions campaign={c} onAsk={confirm.ask} size="default" />}
        </div>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Users} label={t('workflowPages.campaigns.selected', 'Selected')} value={formatNumber(c.counts?.selected || 0, locale)} hint={t('workflowPages.campaigns.enrolledHint', '{count} enrolled', { count: c.counts?.enrolled || 0 })} />
        <Kpi icon={Megaphone} tone="cyan" label={t('workflowPages.campaigns.inProgress', 'In progress')} value={formatNumber(active, locale)} />
        <Kpi icon={Users} tone="emerald" label={t('workflow.runStatus.completed', 'Completed')} value={formatNumber(by.completed || 0, locale)} hint={t('workflowPages.campaigns.failedHint', '{count} failed', { count: by.failed || 0 })} />
        <Kpi icon={CircleSlash} tone="amber" label={t('workflowPages.campaigns.skipped', 'Skipped')} value={formatNumber((c.counts?.skipped || 0) + (by.skipped || 0), locale)} hint={t('workflowPages.campaigns.skippedHint', 'Not enrolled or not allowed to be contacted')} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title={t('workflowPages.campaigns.progressTitle', 'Progress')}>
          <SegmentBar className="h-3" total={total} segments={Object.entries(by).map(([k, v]) => ({ key: k, value: v || 0, className: RUN_SEGMENT_CLASSES[k] || 'bg-slate-400', label: t(`workflow.runStatus.${k}`, k) }))} />
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
            {Object.entries(by).map(([k, v]) => (
              <button key={k} type="button" onClick={() => { setStatus(status === k ? '' : (k as RunStatus)); setPage(1); }} className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 ${status === k ? 'bg-muted font-semibold' : ''}`}>
                <span className={`size-2 rounded-full ${RUN_SEGMENT_CLASSES[k] || 'bg-slate-400'}`} />{t(`workflow.runStatus.${k}`, k)} <span className="tabular-nums text-muted-foreground">{v}</span>
              </button>
            ))}
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <div><dt className="text-muted-foreground">{t('workflowPages.campaigns.workflow', 'Published workflow')}</dt><dd className="mt-0.5 font-medium"><Link className="hover:text-primary" href={`/automation/workflows/${refId(c.workflowId)}`}>{refName(c.workflowId)}</Link> {c.version ? t('workflow.common.version', 'v{version}', { version: c.version }) : ''}</dd></div>
            <div><dt className="text-muted-foreground">{t('workflowPages.campaigns.started', 'Started')}</dt><dd className="mt-0.5">{formatDateTime(c.startedAt, locale)}</dd></div>
            <div><dt className="text-muted-foreground">{t('workflowPages.campaigns.finished', 'Finished')}</dt><dd className="mt-0.5">{formatDateTime(c.completedAt || c.stoppedAt, locale)}</dd></div>
            <div><dt className="text-muted-foreground">{t('workflowPages.campaigns.selection', 'Selection')}</dt><dd className="mt-0.5">{t(`workflowPages.campaigns.mode.${c.selection?.mode || 'explicit'}`, c.selection?.mode || '')}</dd></div>
          </dl>
        </Panel>
        <Panel title={t('workflowPages.campaigns.outcomes', 'Outcomes')}>
          {Object.keys(c.progress?.byOutcome || {}).length === 0 ? <p className="text-sm text-muted-foreground">{t('workflowPages.campaigns.noOutcomes', 'No finished contacts yet.')}</p> : (
            <ul className="space-y-2">
              {Object.entries(c.progress.byOutcome).sort((a, b) => (b[1] || 0) - (a[1] || 0)).map(([o, n]) => (
                <li key={o} className="flex items-center justify-between gap-2"><OutcomeBadge outcome={o as EndOutcome} /><span className="text-sm font-semibold tabular-nums">{formatNumber(n || 0, locale)}</span></li>
              ))}
            </ul>
          )}
          {(c.skipped?.length || 0) > 0 && (
            <div className="mt-5 border-t pt-4 dark:border-white/10">
              <p className="text-xs font-semibold">{t('workflowPages.campaigns.skippedReasons', 'Why contacts were skipped')}</p>
              <ul className="mt-2 space-y-1 text-xs">
                {Object.entries((c.skipped || []).reduce<Record<string, number>>((acc, s) => { acc[s.reason] = (acc[s.reason] || 0) + 1; return acc; }, {})).map(([reason, n]) => (
                  <li key={reason} className="flex justify-between gap-2"><span className="text-muted-foreground">{t(`workflowPages.skipReason.${reason}`, reason)}</span><span className="tabular-nums">{n}</span></li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      </div>

      <Panel bodyClassName="p-0" title={t('workflowPages.campaigns.contactsTitle', 'Contacts in this campaign')}>
        {runs.isLoading ? <div className="space-y-2 p-4">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>
          : !runs.data?.data.length ? <div className="p-4"><EmptyBlock icon={Users} title={t('workflowPages.campaigns.noContacts', 'No contacts enrolled yet')} description={c.status === 'draft' ? t('workflowPages.campaigns.noContactsDraft', 'Start the campaign to enroll the selected contacts.') : undefined} /></div>
          : <RunsTable runs={runs.data.data} showWorkflow={false} />}
        <div className="px-4 pb-4 sm:px-5"><Pager pagination={runs.data?.pagination} onPage={setPage} /></div>
      </Panel>
      {confirm.dialog}
    </div>
  );
}
