'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Activity, BarChart3, CheckCircle2, GitBranch, Hourglass, Mail, MousePointerClick, PhoneCall, PhoneIncoming, Send, ShieldCheck, Target, Users, XCircle,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/shared/components/page-header';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { useWorkflowAnalytics } from '../../hooks/use-workflows';
import { formatNumber, formatPercent, formatRelative, leadName, refName } from '../../lib/format';
import type { EndOutcome } from '../../types/workflow-types';
import { WorkflowStatusBadge } from '../shared/status-badge';
import { EmptyBlock, ErrorBlock, Kpi, KpiSkeleton, Panel } from './page-kit';

const RANGES = [7, 14, 30, 90] as const;
const OUTCOME_COLORS: Partial<Record<EndOutcome, string>> = {
  qualified: '#10b981', converted: '#059669', callback_scheduled: '#0ea5e9', follow_up_required: '#06b6d4', not_interested: '#94a3b8',
  unreachable: '#f59e0b', opted_out: '#d97706', completed: '#64748b', failed: '#f43f5e', stopped: '#cbd5e1',
};

export function AnalyticsPage() {
  const { t, locale } = useLanguage();
  const [days, setDays] = useState<number>(30);
  const query = useWorkflowAnalytics({ days });
  const a = query.data;
  const n = (v: number) => formatNumber(v, locale);
  const outcomes = a ? Object.entries(a.outcomes).map(([k, v]) => ({ key: k as EndOutcome, name: t(`workflow.outcome.${k}`, k), value: v || 0 })).sort((x, y) => y.value - x.value) : [];

  return (
    <div className="space-y-6">
      <PageHeader title={t('workflow.nav.analytics', 'Analytics')} description={t('workflowPages.analytics.description', 'How your automations perform — executions, calls, messages, clicks and conversions.')} icon={BarChart3}>
        <div role="radiogroup" aria-label={t('workflowPages.analytics.range', 'Time range')} className="inline-flex rounded-xl border bg-card p-1 dark:border-white/10">
          {RANGES.map((r) => (
            <button key={r} type="button" role="radio" aria-checked={days === r} onClick={() => setDays(r)}
              className={cn('rounded-lg px-3 py-1.5 text-xs font-medium transition-colors', days === r ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              {t('workflowPages.analytics.days', '{days} days', { days: r })}
            </button>
          ))}
        </div>
      </PageHeader>

      {query.isError ? <ErrorBlock onRetry={() => query.refetch()} /> : (
        <>
          <section aria-label={t('workflowPages.analytics.kpis', 'Key figures')} className="space-y-3" data-testid="analytics-kpis">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {!a ? <KpiSkeleton count={6} /> : (
                <>
                  <Kpi icon={GitBranch} label={t('workflowPages.kpi.totalWorkflows', 'Workflows')} value={n(a.workflows.total)} hint={t('workflowPages.kpi.publishedCount', '{count} published', { count: a.workflows.published })} />
                  <Kpi icon={Activity} tone="cyan" label={t('workflowPages.kpi.executions', 'Executions')} value={n(a.executions.total)} />
                  <Kpi icon={CheckCircle2} tone="emerald" label={t('workflowPages.kpi.successful', 'Successful')} value={n(a.executions.completed)} hint={formatPercent(a.executions.successRate, locale)} />
                  <Kpi icon={XCircle} tone="rose" label={t('workflowPages.kpi.failed', 'Failed')} value={n(a.executions.failed)} />
                  <Kpi icon={Hourglass} tone="blue" label={t('workflowPages.kpi.inFlight', 'Running / waiting')} value={`${n(a.executions.running)} / ${n(a.executions.waiting)}`} />
                  <Kpi icon={Users} tone="slate" label={t('workflowPages.kpi.contacts', 'Contacts processed')} value={n(a.contacts)} />
                </>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {!a ? <KpiSkeleton count={6} /> : (
                <>
                  <Kpi icon={PhoneCall} tone="blue" label={t('workflowPages.kpi.calls', 'AI calls')} value={n(a.calls.initiated)} />
                  <Kpi icon={PhoneIncoming} tone="emerald" label={t('workflowPages.kpi.answered', 'Calls answered')} value={n(a.calls.answered)} hint={t('workflowPages.kpi.answerRate', 'Answer rate {rate}', { rate: formatPercent(a.calls.answerRate, locale) })} />
                  <Kpi icon={Target} tone="amber" label={t('workflowPages.kpi.qualified', 'Qualified leads')} value={n(a.qualified)} hint={t('workflowPages.kpi.conversion', 'Conversion {rate}', { rate: formatPercent(a.conversionRate, locale) })} />
                  <Kpi icon={Send} tone="cyan" label={t('workflowPages.kpi.messagesSent', 'Messages sent')} value={n(a.messages.sent)} hint={t('workflowPages.kpi.blocked', '{count} blocked by consent/opt-out', { count: a.messages.blocked })} />
                  <Kpi icon={Mail} tone="emerald" label={t('workflowPages.kpi.delivered', 'Delivered')} value={n(a.messages.delivered)} hint={a.messages.sent ? formatPercent((a.messages.delivered / a.messages.sent) * 100, locale) : undefined} />
                  <Kpi icon={MousePointerClick} tone="blue" label={t('workflowPages.kpi.clicks', 'Link clicks')} value={n(a.links.humanClicks)} hint={t('workflowPages.kpi.scanner', '{count} scanner hits filtered', { count: a.links.scannerHits })} />
                </>
              )}
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-3">
            <Panel className="xl:col-span-2" icon={Activity} title={t('workflowPages.analytics.trend', 'Executions over time')}>
              {!a ? <Skeleton className="h-72 rounded-xl" /> : (
                <div className="h-72" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={a.timeline} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                      <defs>
                        <linearGradient id="wfA1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.3} /><stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} /></linearGradient>
                        <linearGradient id="wfA2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.25} /><stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0} /></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={20} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                      <Area type="monotone" dataKey="started" name={t('workflowPages.chart.started', 'Started')} stroke="var(--chart-2)" strokeWidth={2} fill="url(#wfA1)" />
                      <Area type="monotone" dataKey="completed" name={t('workflowPages.chart.completed', 'Completed')} stroke="var(--chart-3)" strokeWidth={2} fill="url(#wfA2)" />
                      <Area type="monotone" dataKey="failed" name={t('workflowPages.chart.failed', 'Failed')} stroke="#f43f5e" strokeWidth={1.5} fill="transparent" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>
            <Panel icon={ShieldCheck} title={t('workflowPages.analytics.outcomes', 'Outcomes')}>
              {!a ? <Skeleton className="h-72 rounded-xl" /> : outcomes.length === 0 ? <EmptyBlock title={t('workflowPages.campaigns.noOutcomes', 'No finished contacts yet.')} /> : (
                <div className="h-72" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={outcomes} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                      <XAxis type="number" hide allowDecimals={false} />
                      <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} cursor={{ fill: 'var(--muted)' }} />
                      <Bar dataKey="value" name={t('workflowPages.analytics.contacts', 'Contacts')} radius={[0, 6, 6, 0]} barSize={16}>
                        {outcomes.map((o) => <Cell key={o.key} fill={OUTCOME_COLORS[o.key] || 'var(--chart-1)'} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title={t('workflowPages.analytics.topWorkflows', 'Top workflows')} bodyClassName="p-0">
              {!a ? <div className="p-4"><Skeleton className="h-48" /></div> : a.topWorkflows.length === 0 ? <div className="p-4"><EmptyBlock title={t('workflowPages.executions.emptyTitle', 'No executions yet')} /></div> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground"><tr className="border-b dark:border-white/10">
                      <th className="px-5 py-2.5 text-start font-medium">{t('workflowPages.list.colName', 'Workflow')}</th>
                      <th className="px-3 py-2.5 text-end font-medium">{t('workflowPages.list.colExecutions', 'Executions')}</th>
                      <th className="px-3 py-2.5 text-end font-medium">{t('workflowPages.kpi.failed', 'Failed')}</th>
                      <th className="px-5 py-2.5 text-end font-medium">{t('workflowPages.list.colSuccess', 'Success')}</th>
                    </tr></thead>
                    <tbody className="divide-y dark:divide-white/10">
                      {a.topWorkflows.map((w) => (
                        <tr key={w.workflowId}>
                          <td className="px-5 py-2.5"><Link href={`/automation/workflows/${w.workflowId}`} className="font-medium hover:text-primary">{w.name}</Link>{w.status && <WorkflowStatusBadge status={w.status} className="ms-2" />}</td>
                          <td className="px-3 py-2.5 text-end tabular-nums">{n(w.runs)}</td>
                          <td className="px-3 py-2.5 text-end tabular-nums text-rose-600 dark:text-rose-400">{n(w.failed)}</td>
                          <td className="px-5 py-2.5 text-end tabular-nums">{formatPercent(w.successRate, locale)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
            <Panel title={t('workflowPages.overview.failures', 'Failed executions')} bodyClassName="p-0">
              {!a ? <div className="p-4"><Skeleton className="h-48" /></div> : a.recentFailures.length === 0 ? <div className="p-4"><EmptyBlock icon={CheckCircle2} title={t('workflowPages.overview.noFailures', 'No failures')} /></div> : (
                <ul className="divide-y dark:divide-white/10">
                  {a.recentFailures.map((f) => (
                    <li key={f._id}><Link href={`/automation/executions/${f._id}`} className="flex items-start gap-3 px-5 py-3 hover:bg-muted/40">
                      <XCircle className="mt-0.5 size-4 shrink-0 text-rose-500" />
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{leadName(f.leadId, t('workflow.common.unknownLead', 'Unknown lead'))} · {refName(f.workflowId)}</span>
                        <span className="block truncate text-xs text-muted-foreground">{f.error?.code ? `${f.error.code}: ` : ''}{f.error?.message}</span></span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatRelative(f.completedAt, locale)}</span>
                    </Link></li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
