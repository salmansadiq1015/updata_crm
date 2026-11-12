'use client';

import Link from 'next/link';
import { HeroStat } from '@/shared/components/hero-art';
import { ArrowUpRight, Bot, PhoneCall, PhoneIncoming, UserPlus, Users, FolderKanban, FileText, ClipboardList, CalendarClock, WalletCards, Radar, MessageSquare, ChevronDown } from 'lucide-react';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { navSectionDefs } from '@/layout/navigation';
import { formatDashboardNumber } from '../utils/dashboard-formatters';

const INTELLIGENCE = [
  { id: 'assistant', permission: 'ai:sessions', icon: Bot, metric: 'completed', hint: 'completed', href: '/ai' },
  { id: 'calling', permission: 'ai-calling:read', icon: PhoneCall, metric: 'total', hint: 'callingTotal', href: '/ai-calling' },
  { id: 'incoming', permission: 'inbound-calls:read', icon: PhoneIncoming, metric: 'total', hint: 'incomingTotal', href: '/incoming-calls' },
  { id: 'leads', permission: 'lead:read', icon: UserPlus, metric: 'total', hint: 'leadsTotal', href: '/leads' },
];

export function IntelligenceSummary({ query, t, locale, onSelect }) {
  const { hasPermission } = usePermissions();
  const items = INTELLIGENCE.filter(item => hasPermission(item.permission));
  if (!items.length) return null;
  return <section aria-label={t('dashboard.intelligence.aiOverview')} className="dashboard-intelligence-summary">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-sm font-semibold">{t('dashboard.intelligence.aiOverview')}</h2>
      <span className="text-xs text-muted-foreground">{t('dashboard.intelligence.period')}</span>
    </div>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {items.map(({ id, icon: Icon, metric, hint }) => {
        const section = query.data?.[id];
        const value = section?.available ? section.metrics?.[metric] : null;
        return <button type="button" key={id} onClick={() => onSelect(id)} className="dashboard-intelligence-card group min-w-0 text-start" aria-label={`${t('dashboard.intelligence.viewAnalytics')}: ${t(`dashboard.intelligence.${id}`)}`}>
          <div className="flex items-center justify-between gap-3"><span className="dashboard-icon"><Icon className="size-4" /></span><ArrowUpRight className="size-4 text-muted-foreground transition group-hover:text-primary" /></div>
          <p className="mt-4 text-sm font-medium">{t(`dashboard.intelligence.${id}`)}</p>
          <div className="mt-2 flex flex-wrap items-baseline gap-2"><strong className="text-2xl font-semibold tracking-tight tabular-nums">{value == null ? '—' : formatDashboardNumber(value, locale)}</strong><span className="text-xs text-muted-foreground">{section?.error || query.isError ? t('dashboard.intelligence.unavailable') : t(`dashboard.intelligence.${hint}`)}</span></div>
        </button>;
      })}
    </div>
  </section>;
}

/** The same four AI & growth figures as glass tiles for the page header (PageHero stats). */
export function IntelligenceHeroStats({ query, t, locale, onSelect }) {
  const { hasPermission } = usePermissions();
  const items = INTELLIGENCE.filter(item => hasPermission(item.permission));
  return items.map(({ id, icon, metric, hint }) => {
    const section = query.data?.[id];
    const value = section?.available ? section.metrics?.[metric] : null;
    return <button type="button" key={id} onClick={() => onSelect(id)} className="rounded-2xl text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/50" aria-label={`${t('dashboard.intelligence.viewAnalytics')}: ${t(`dashboard.intelligence.${id}`)}`}>
      <HeroStat icon={icon} label={t(`dashboard.intelligence.${id}`)} value={value == null ? '—' : formatDashboardNumber(value, locale)} hint={section?.error || query.isError ? t('dashboard.intelligence.unavailable') : t(`dashboard.intelligence.${hint}`)} loading={query.isLoading} />
    </button>;
  });
}

export function FeatureOverview({ data, intelligence, t, locale }) {
  const { hasPermission } = usePermissions();
  const features = [
    ...INTELLIGENCE.map(item => ({ ...item, label: t(`dashboard.intelligence.${item.id}`), value: intelligence?.[item.id]?.available ? intelligence[item.id].metrics.total : undefined })),
    { href: '/crm/customers', icon: Users, permission: 'crm:read', label: t('dashboard.analytics.tabs.crm'), value: data?.crm?.total },
    { href: '/projects', icon: FolderKanban, permission: 'projects:read', label: t('dashboard.analytics.tabs.projects'), value: data?.projects?.active },
    { href: '/quotes', icon: FileText, permission: 'qop:read', label: t('dashboard.analytics.tabs.sales'), value: data?.sales?.quotations?.open },
    { href: '/tasks', icon: ClipboardList, permission: 'tasks:read', label: t('dashboard.analytics.tabs.tasks'), value: data?.tasks?.open },
    { href: '/scheduling/calendar', icon: CalendarClock, permission: 'scheduling:read', label: t('dashboard.analytics.tabs.scheduling'), value: data?.scheduling?.today },
    { href: '/accounting', icon: WalletCards, permission: 'accounting:read', label: t('dashboard.analytics.tabs.accounting') },
    { href: '/lead-generation', icon: Radar, permission: 'discovery:read', label: t('dashboard.intelligence.discovery') },
    { href: '/leads/outreach', icon: MessageSquare, permission: 'lead:read', label: t('dashboard.intelligence.messaging') },
  ].filter(item => hasPermission(item.permission));
  const covered = new Set(['/dashboard', ...features.map(item => item.href)]);
  const seen = new Set();
  const remaining = navSectionDefs.flatMap(section => section.items.flatMap(item => item.type === 'group' ? item.children : [item])).filter(item => {
    if (item.disabled || covered.has(item.href) || seen.has(item.href) || (item.permission && !hasPermission(item.permission))) return false;
    seen.add(item.href); return true;
  });
  return <section className="dashboard-feature-overview" aria-label={t('dashboard.intelligence.features')}>
    <div className="mb-4"><h2 className="text-base font-semibold tracking-tight">{t('dashboard.intelligence.features')}</h2><p className="mt-1 text-xs text-muted-foreground">{t('dashboard.intelligence.featuresDesc')}</p></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {features.map(({ href, icon: Icon, label, value }) => <Link key={href} href={href} className="dashboard-workspace-link group flex min-w-0 items-center gap-3 rounded-xl border border-border p-3.5">
        <span className="dashboard-icon shrink-0"><Icon className="size-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{label}</span><span className="mt-1 block text-xs text-muted-foreground">{t('dashboard.intelligence.open')}</span></span>
        {value != null && <span className="text-lg font-semibold tabular-nums">{formatDashboardNumber(value, locale)}</span>}<ArrowUpRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
      </Link>)}
    </div>
    {remaining.length > 0 && <details className="mt-4 border-t border-border pt-3"><summary className="flex list-none items-center justify-between rounded-lg py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">{t('dashboard.intelligence.moreWorkspaces', 'More workspaces')}<ChevronDown className="size-4 text-muted-foreground" /></summary><div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{remaining.map(({ href, icon: Icon, labelKey }) => <Link key={href} href={href} className="flex min-w-0 items-center gap-2.5 rounded-lg p-2.5 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"><Icon className="size-4 shrink-0" /><span className="truncate">{t(labelKey)}</span><ArrowUpRight className="ms-auto size-3.5 shrink-0" /></Link>)}</div></details>}
  </section>;
}
