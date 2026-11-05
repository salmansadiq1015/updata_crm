'use client';

import Link from 'next/link';
import { Activity, ArrowUpRight, Bot, CheckCircle2, Clock, PhoneCall, PhoneIncoming, Users, Target, TrendingUp, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TrendAreaPanel, BarPanel, StatTiles } from './dashboard-chart-panels';
import { GlassPanel, PanelHeader, DashboardChartSkeleton } from './dashboard-primitives';
import { formatDashboardNumber } from '../utils/dashboard-formatters';

const CONFIG = {
  assistant: { icon: Bot, href: '/ai', scope: 'personal', metrics: ['total', 'completed', 'successRate', 'awaiting'], series: ['total', 'completed', 'failed'], details: ['active', 'failed', 'awaiting'] },
  calling: { icon: PhoneCall, href: '/ai-calling', scope: 'owner', metrics: ['total', 'answered', 'answerRate', 'qualified'], series: ['total', 'answered', 'qualified'], inventory: ['agents', 'activeAgents', 'activeCampaigns'], details: ['completed', 'failed'] },
  incoming: { icon: PhoneIncoming, href: '/incoming-calls', scope: 'personalIncoming', metrics: ['total', 'answered', 'missed', 'aiHandled'], series: ['total', 'answered', 'missed'], inventory: ['live'], details: ['transferred', 'qualified'] },
  leads: { icon: Users, href: '/leads', scope: 'personal', metrics: ['total', 'qualified', 'converted', 'overdueFollowUps'], series: ['total', 'qualified', 'converted'], inventory: ['leadInventory', 'overdueFollowUps'] },
};
const COLORS = ['#0ea5e9', '#34d399', '#fbbf24'];
const METRIC_ICONS = { total: Activity, completed: CheckCircle2, qualified: Target, answered: PhoneCall, missed: PhoneIncoming, awaiting: Clock, answerRate: TrendingUp, successRate: TrendingUp };

export function IntelligenceTab({ name, query, t, locale }) {
  const config = CONFIG[name];
  const section = query.data?.[name];
  const tr = key => t(`dashboard.intelligence.${key}`);
  if (query.isLoading) return <DashboardChartSkeleton />;
  if (!section?.available) return <GlassPanel><div className="flex min-h-64 flex-col items-center justify-center gap-3 p-6 text-center"><AlertCircle className="size-7 text-primary" /><h2 className="text-base font-semibold">{tr(query.isError || section?.error ? 'unavailable' : 'notAvailable')}</h2><p className="max-w-md text-sm text-muted-foreground">{tr('unavailableDesc')}</p><div className="mt-2 flex gap-2"><Button variant="outline" onClick={() => query.refetch()}><RefreshCw className="size-4" />{t('common.retry')}</Button><Button asChild><Link href={config.href}>{tr('open')}<ArrowUpRight className="size-4" /></Link></Button></div></div></GlassPanel>;
  const metrics = section.metrics;
  const rate = numerator => metrics.total > 0 && Number.isFinite(numerator) ? Math.round(numerator / metrics.total * 1000) / 10 : null;
  const values = { ...section.inventory, ...metrics, leadInventory: section.inventory?.total, successRate: rate(metrics.completed), answerRate: rate(metrics.answered) };
  const breakdown = section.breakdown.map(item => ({ ...item, label: tr(`state.${item.id.toLowerCase()}`) }));
  return <div className="space-y-4" data-testid={`dashboard-${name}`}>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="mb-1 flex items-center gap-2 text-xs text-primary"><config.icon className="size-3.5" />{tr(section.scope === 'team' ? 'team' : config.scope)}</div><h2 className="text-xl font-semibold tracking-tight">{tr(name)}</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">{tr(`${name}Desc`)}</p></div><Button asChild variant="outline"><Link href={config.href}>{tr('open')}<ArrowUpRight className="size-4" /></Link></Button></div>
    <StatTiles locale={locale} items={config.metrics.map(key => ({ label: tr(key === 'total' ? `${name}Total` : key), value: values[key], displayValue: values[key] == null ? '—' : undefined, suffix: key.endsWith('Rate') ? '%' : '', icon: METRIC_ICONS[key] || Activity }))} />
    <div className="grid gap-4 xl:grid-cols-12">
      <TrendAreaPanel title={tr('activityTrend')} description={tr('period')} data={section.trend} metrics={config.series.map((key, index) => ({ key, name: tr(key === 'total' ? `${name}Total` : key), color: COLORS[index] }))} locale={locale} t={t} icon={config.icon} />
      <BarPanel title={tr('outcomes')} icon={Activity} data={breakdown} locale={locale} t={t} color="#0ea5e9" />
    </div>
    <div className="grid gap-4 xl:grid-cols-2">
      {config.inventory?.length > 0 && <GlassPanel><PanelHeader icon={config.icon} title={tr('inventory')} description={tr('inventoryDesc')} /><dl className="divide-y divide-border px-5">{config.inventory.map(key => <div className="flex items-center justify-between gap-4 py-4" key={key}><dt className="text-sm text-muted-foreground">{tr(key)}</dt><dd className="text-lg font-semibold tabular-nums">{formatDashboardNumber(values[key], locale)}</dd></div>)}</dl></GlassPanel>}
      {config.details && <GlassPanel><PanelHeader icon={Clock} title={tr(name === 'assistant' ? 'attention' : 'outcomeDetails')} description={tr('period')} /><dl className="divide-y divide-border px-5">{config.details.map(key => <div className="flex items-center justify-between gap-4 py-4" key={key}><dt className="text-sm text-muted-foreground">{tr(key)}</dt><dd className="text-lg font-semibold tabular-nums">{formatDashboardNumber(values[key], locale)}</dd></div>)}</dl></GlassPanel>}
      {name === 'leads' && <div className="grid xl:grid-cols-4"><BarPanel title={tr('pipeline')} description={tr('pipelineDesc')} icon={Target} data={section.pipeline.map(item => ({ ...item, label: tr(`state.${item.id.toLowerCase()}`) }))} locale={locale} t={t} color="#0ea5e9" /></div>}
    </div>
  </div>;
}
