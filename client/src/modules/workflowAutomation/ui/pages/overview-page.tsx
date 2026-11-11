'use client';
import Link from 'next/link';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import {
  Activity, AlertTriangle, ArrowRight, CheckCircle2, GitBranch, Hourglass, LayoutTemplate, Megaphone, Plus, Users, Workflow as WorkflowIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { HeroStat } from '@/shared/components/hero-art';
import { HeroPill, PageHero, heroButton } from '@/shared/components/page-hero';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useLanguage } from '@/lib/i18n/language-context';
import { useWorkflowAnalytics, useWorkflowCampaigns, useWorkflowRuns, useWorkflowTemplates, useWorkflows } from '../../hooks/use-workflows';
import { formatNumber, formatPercent, formatRelative, leadName, refName } from '../../lib/format';
import { CampaignStatusBadge, RunStatusBadge, WorkflowStatusBadge } from '../shared/status-badge';
import { EmptyBlock, ErrorBlock, Panel, RUN_SEGMENT_CLASSES, SegmentBar, useNodeLabel } from './page-kit';

export function OverviewPage() {
  const { t, locale } = useLanguage();
  const { hasPermission } = usePermissions();
  const nodeLabel = useNodeLabel();
  const analytics = useWorkflowAnalytics({ days: 30 });
  const workflows = useWorkflows({ limit: 5, sortBy: 'updatedAt', sortOrder: 'desc' });
  const runs = useWorkflowRuns({ limit: 8 });
  const campaigns = useWorkflowCampaigns({ status: 'running', limit: 5 });
  const templates = useWorkflowTemplates();
  const a = analytics.data;
  const canWrite = hasPermission('workflow:write');

  return (
    <div className="space-y-6">
      <PageHero
        id="automation-title"
        art="/hero/automation"
        icon={WorkflowIcon}
        eyebrow={t('workflowPages.overview.title', 'Workflow Automation')}
        title={t('hero.automation.title', 'Your best process, running on its own.')}
        subtitle={t('workflowPages.overview.description', 'Automate AI calls, messages, follow-ups and CRM updates — and see exactly what every workflow is doing.')}
        status={a ? (
          <HeroPill tone={a.executions.running + a.executions.waiting > 0 ? 'ok' : 'off'}>
            {t('workflowPages.kpi.runningWaiting', '{running} running · {waiting} waiting', { running: a.executions.running, waiting: a.executions.waiting })}
          </HeroPill>
        ) : null}
        actions={<>
          <Link href="/automation/templates" className={heroButton.ghost}><LayoutTemplate aria-hidden="true" />{t('hero.automation.templates', 'Browse templates')}</Link>
          {canWrite && <Link href="/automation/new" className={heroButton.primary}><Plus aria-hidden="true" />{t('workflow.nav.create', 'Create workflow')}</Link>}
        </>}
        stats={analytics.isError ? (
          <div className="col-span-2 rounded-2xl border border-rose-300/20 bg-rose-500/10 p-4 text-sm text-rose-100 lg:col-span-1">
            {t('hero.loadError', 'Figures could not be loaded.')}{' '}
            <button type="button" className="font-semibold underline underline-offset-2" onClick={() => void analytics.refetch()}>{t('common.retry', 'Retry')}</button>
          </div>
        ) : <>
          <HeroStat icon={GitBranch} label={t('workflowPages.kpi.activeWorkflows', 'Active workflows')} value={a ? formatNumber(a.workflows.published, locale) : '—'} hint={a ? t('workflowPages.kpi.ofTotal', 'of {total} total', { total: a.workflows.total }) : undefined} loading={!a} />
          <HeroStat icon={Activity} tone="text-cyan-300" label={t('workflowPages.kpi.executions30', 'Executions (30 days)')} value={a ? formatNumber(a.executions.total, locale) : '—'} hint={a ? t('workflowPages.kpi.runningWaiting', '{running} running · {waiting} waiting', { running: a.executions.running, waiting: a.executions.waiting }) : undefined} loading={!a} />
          <HeroStat icon={CheckCircle2} tone="text-emerald-300" label={t('workflowPages.kpi.successRate', 'Success rate')} value={a ? formatPercent(a.executions.successRate, locale) : '—'} hint={a ? t('workflowPages.kpi.completedFailed', '{completed} completed · {failed} failed', { completed: a.executions.completed, failed: a.executions.failed }) : undefined} loading={!a} />
          <HeroStat icon={Users} tone="text-amber-300" label={t('workflowPages.kpi.qualified', 'Qualified leads')} value={a ? formatNumber(a.qualified, locale) : '—'} hint={a ? t('workflowPages.kpi.conversion', 'Conversion {rate}', { rate: formatPercent(a.conversionRate, locale) }) : undefined} loading={!a} />
        </>}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2" icon={Activity} title={t('workflowPages.overview.activity', 'Execution activity')} description={t('workflowPages.overview.activityHint', 'Contacts entering workflows per day, last 30 days')}
          action={<Button variant="ghost" size="sm" asChild><Link href="/automation/analytics" className="gap-1">{t('workflowPages.common.viewAll', 'View all')}<ArrowRight className="size-3.5 rtl:rotate-180" /></Link></Button>}>
          {!a ? <Skeleton className="h-48 w-full rounded-xl" /> : (
            <div className="h-48" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={a.timeline} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="wfStarted" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.35} /><stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} /></linearGradient>
                  </defs>
                  <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
                  <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} labelFormatter={(d) => String(d)} />
                  <Area type="monotone" dataKey="started" name={t('workflowPages.chart.started', 'Started')} stroke="var(--chart-2)" strokeWidth={2} fill="url(#wfStarted)" />
                  <Area type="monotone" dataKey="completed" name={t('workflowPages.chart.completed', 'Completed')} stroke="var(--chart-3)" strokeWidth={2} fill="transparent" />
                  <Area type="monotone" dataKey="failed" name={t('workflowPages.chart.failed', 'Failed')} stroke="#f43f5e" strokeWidth={1.5} fill="transparent" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel icon={AlertTriangle} title={t('workflowPages.overview.failures', 'Failed executions')} description={t('workflowPages.overview.failuresHint', 'Need a person to investigate')}>
          {!a ? <Skeleton className="h-40 rounded-xl" /> : a.recentFailures.length === 0 ? (
            <EmptyBlock icon={CheckCircle2} title={t('workflowPages.overview.noFailures', 'No failures')} description={t('workflowPages.overview.noFailuresHint', 'Every execution in the last 30 days ran without errors.')} />
          ) : (
            <ul className="divide-y dark:divide-white/10">
              {a.recentFailures.map((f) => (
                <li key={f._id}>
                  <Link href={`/automation/executions/${f._id}`} className="flex items-start gap-3 py-2.5 transition-colors hover:text-primary">
                    <span className="mt-1 size-2 shrink-0 rounded-full bg-rose-500" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{leadName(f.leadId, t('workflow.common.unknownLead', 'Unknown lead'))}</span>
                      <span className="block truncate text-xs text-muted-foreground">{refName(f.workflowId)} · {f.error?.message || f.error?.code || '—'}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatRelative(f.completedAt, locale)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel icon={GitBranch} title={t('workflowPages.overview.recentWorkflows', 'Recent workflows')} bodyClassName="p-0"
          action={<Button variant="ghost" size="sm" asChild><Link href="/automation/workflows" className="gap-1">{t('workflowPages.common.viewAll', 'View all')}<ArrowRight className="size-3.5 rtl:rotate-180" /></Link></Button>}>
          {workflows.isLoading ? <div className="space-y-2 p-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
            : workflows.isError ? <div className="p-4"><ErrorBlock onRetry={() => workflows.refetch()} /></div>
            : !workflows.data?.data.length ? (
              <div className="p-4"><EmptyBlock icon={WorkflowIcon} title={t('workflowPages.list.emptyTitle', 'No workflows yet')} description={t('workflowPages.list.emptyHint', 'Start from a template or build your own automation on a blank canvas.')}
                action={canWrite ? <Button size="sm" asChild><Link href="/automation/new">{t('workflow.nav.create', 'Create workflow')}</Link></Button> : undefined} /></div>
            ) : (
              <ul className="divide-y dark:divide-white/10">
                {workflows.data.data.map((w) => (
                  <li key={w._id}>
                    <Link href={`/automation/workflows/${w._id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 sm:px-5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{w.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{nodeLabel(w.triggerType)} · {formatRelative(w.updatedAt, locale)}</span>
                      </span>
                      <span className="hidden text-xs tabular-nums text-muted-foreground sm:block">{t('workflowPages.list.runsCount', '{count} runs', { count: w.stats?.total || 0 })}</span>
                      <WorkflowStatusBadge status={w.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
        </Panel>

        <Panel icon={Activity} title={t('workflowPages.overview.recentExecutions', 'Recent executions')} bodyClassName="p-0"
          action={<Button variant="ghost" size="sm" asChild><Link href="/automation/executions" className="gap-1">{t('workflowPages.common.viewAll', 'View all')}<ArrowRight className="size-3.5 rtl:rotate-180" /></Link></Button>}>
          {runs.isLoading ? <div className="space-y-2 p-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
            : runs.isError ? <div className="p-4"><ErrorBlock onRetry={() => runs.refetch()} /></div>
            : !runs.data?.data.length ? <div className="p-4"><EmptyBlock icon={Hourglass} title={t('workflowPages.executions.emptyTitle', 'No executions yet')} description={t('workflowPages.executions.emptyHint', 'Executions appear here as soon as a published workflow enrolls a contact.')} /></div>
            : (
              <ul className="divide-y dark:divide-white/10">
                {runs.data.data.map((r) => (
                  <li key={r._id}>
                    <Link href={`/automation/executions/${r._id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 sm:px-5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{leadName(r.leadId, t('workflow.common.unknownLead', 'Unknown lead'))}</span>
                        <span className="block truncate text-xs text-muted-foreground">{refName(r.workflowId)} · {r.currentStep ? (r.currentStep.label || nodeLabel(r.currentStep.type)) : '—'}</span>
                      </span>
                      <span className="hidden text-xs text-muted-foreground sm:block">{formatRelative(r.updatedAt, locale)}</span>
                      <RunStatusBadge status={r.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel icon={Megaphone} title={t('workflowPages.overview.activeCampaigns', 'Active campaigns')} className="xl:col-span-1"
          action={<Button variant="ghost" size="sm" asChild><Link href="/automation/campaigns" className="gap-1">{t('workflowPages.common.viewAll', 'View all')}<ArrowRight className="size-3.5 rtl:rotate-180" /></Link></Button>}>
          {campaigns.isLoading ? <Skeleton className="h-28 rounded-xl" /> : !campaigns.data?.data.length ? (
            <EmptyBlock icon={Megaphone} title={t('workflowPages.campaigns.noneRunning', 'No campaign running')} description={t('workflowPages.campaigns.noneRunningHint', 'Enroll a list of leads into a published workflow to start one.')} />
          ) : (
            <ul className="space-y-3">
              {campaigns.data.data.map((c) => (
                <li key={c._id}>
                  <Link href={`/automation/campaigns/${c._id}`} className="block rounded-xl border p-3 transition-colors hover:border-primary/40 dark:border-white/10">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{c.name}</span>
                      <CampaignStatusBadge status={c.status} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{refName(c.workflowId)} · {t('workflowPages.campaigns.contactsCount', '{count} contacts', { count: c.progress?.total || 0 })}</p>
                    <SegmentBar className="mt-2" total={c.progress?.total || 0} segments={Object.entries(c.progress?.byStatus || {}).map(([k, v]) => ({ key: k, value: v || 0, className: RUN_SEGMENT_CLASSES[k] || 'bg-slate-400', label: t(`workflow.runStatus.${k}`, k) }))} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel icon={LayoutTemplate} title={t('workflowPages.overview.templates', 'Start from a template')} className="xl:col-span-2"
          action={<Button variant="ghost" size="sm" asChild><Link href="/automation/templates" className="gap-1">{t('workflowPages.common.viewAll', 'View all')}<ArrowRight className="size-3.5 rtl:rotate-180" /></Link></Button>}>
          {!templates.data ? <div className="grid gap-3 sm:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div> : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {templates.data.slice(0, 6).map((tpl) => (
                <Link key={tpl.key} href={canWrite ? `/automation/new?template=${tpl.key}` : '/automation/templates'} className="group rounded-xl border p-3.5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md dark:border-white/10">
                  <p className="text-sm font-semibold group-hover:text-primary">{t(`workflowPages.template.${tpl.key}.title`, tpl.key)}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t(`workflowPages.template.${tpl.key}.desc`, '')}</p>
                  <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t('workflowPages.templates.steps', '{count} steps', { count: tpl.nodes })}</p>
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
