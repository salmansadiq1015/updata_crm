'use client';

import Link from 'next/link';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { SidebarSettings } from './sidebar-settings';
import {
  ArrowRight,
  LockKeyhole,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useSettingsHubController } from '../hooks/use-settings-hub-controller';
import {
  SETTINGS_HUB_CATEGORIES,
  SETTINGS_HUB_DEFAULT_CATEGORY,
  SETTINGS_HUB_STATS,
} from '../constants/settings-hub';
import { getSettingsHealthMeta } from '../utils/settings-hub-utils';

const ACCENT_CLASS = {
  amber: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30',
  cyan: 'bg-cyan-50 text-cyan-700 ring-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-300 dark:ring-cyan-500/30',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/30',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30',
  slate: 'bg-slate-50 text-slate-700 ring-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:ring-slate-500/30',
  violet: 'bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-500/30',
};

function HealthBadge({ stats, t }) {
  const meta = getSettingsHealthMeta(stats.healthStatus);
  return (
    <Badge variant="outline" className={cn('gap-1.5 rounded-md px-2.5 py-1 text-xs', meta.badgeClassName)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {t(meta.labelKey)}
    </Badge>
  );
}

function Hero({ controller }) {
  const { t, data, state, actions } = controller;
  return (
    <div className="grid gap-5 border-b pb-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
      <div className="min-w-0">
        <Badge variant="outline" className="mb-3 rounded-md bg-background/80 px-2.5 py-1 text-xs">
          {t('settingsHub.kicker')}
        </Badge>
        <h1 className="text-2xl font-semibold tracking-normal text-foreground sm:text-3xl">
          {t('settingsHub.title')}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          {t('settingsHub.description')}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-md border bg-background/70 px-2.5 py-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            {t('settingsHub.availableCount', null, { count: data.stats.available })}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md border bg-background/70 px-2.5 py-1">
            <LockKeyhole className="h-3.5 w-3.5" />
            {t('settingsHub.securedCount', null, { count: data.stats.protected })}
          </span>
          <HealthBadge stats={data.stats} t={t} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild className="gap-2 shadow-sm">
          <Link href="/settings/system">
            <Settings className="h-4 w-4" />
            {t('settingsHub.viewSystem')}
          </Link>
        </Button>
        <Button asChild variant="outline" className="gap-2 bg-background/80">
          <Link href="/admin/integrations">
            <ArrowRight className="h-4 w-4" />
            {t('settingsHub.manageIntegrations')}
          </Link>
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label={t('settingsHub.refreshHealth')}
          title={t('settingsHub.refreshHealth')}
          onClick={actions.refreshHealth}
          disabled={state.isHealthFetching}
        >
          <RefreshCw className={cn('h-4 w-4', state.isHealthFetching && 'animate-spin')} />
        </Button>
      </div>
    </div>
  );
}

function StatCards({ controller }) {
  const { t, data, state } = controller;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {SETTINGS_HUB_STATS.map((stat) => {
        const Icon = stat.icon;
        const value = stat.isLabel ? t(data.stats[stat.valueKey]) : data.stats[stat.valueKey];
        return (
          <Card key={stat.id} className="rounded-lg bg-card/95 shadow-sm">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">{t(stat.labelKey)}</p>
                  {state.isHealthLoading && stat.id === 'health' ? (
                    <Skeleton className="mt-2 h-7 w-24" />
                  ) : (
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
                  )}
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/70 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t(stat.descriptionKey)}</p>
              {stat.id === 'health' && (
                <Progress value={data.stats.healthProgress} className="h-1.5" aria-label={t(stat.labelKey)} />
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function Toolbar({ controller }) {
  const { t, filters, data } = controller;
  return (
    <div className="space-y-4 rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label={t('settingsHub.search')}
            value={filters.search}
            onChange={(event) => filters.setSearch(event.target.value)}
            placeholder={t('settingsHub.searchPlaceholder')}
            className="h-10 pl-9"
          />
        </div>
        {filters.search && (
          <Button variant="outline" className="h-10" onClick={filters.clearSearch}>
            {t('settingsHub.clearSearch')}
          </Button>
        )}
      </div>
      <Tabs value={filters.category} onValueChange={filters.setCategory}>
        <TabsList className="h-auto w-full justify-start overflow-x-auto bg-muted/60 p-1 md:w-fit">
          {data.categories.map((category) => {
            const Icon = category.icon;
            return (
              <TabsTrigger key={category.id} value={category.id} className="h-8 gap-1.5 px-3">
                <Icon className="h-3.5 w-3.5" />
                {t(category.labelKey)}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
    </div>
  );
}

function SettingsCard({ item, t }) {
  const Icon = item.icon;
  return (
    <Card className="group rounded-lg shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
      <CardContent className="flex h-full flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1', ACCENT_CLASS[item.accent] || ACCENT_CLASS.slate)}>
            <Icon className="h-5 w-5" />
          </div>
          <Badge variant="outline" className="rounded-md text-xs">{t(item.badgeKey)}</Badge>
        </div>
        <div className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">{t(item.titleKey)}</h2>
          <p className="min-h-10 text-sm leading-5 text-muted-foreground">{t(item.descriptionKey)}</p>
        </div>
        <div className="mt-auto space-y-3 border-t pt-4">
          <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{t('settingsHub.permission')}</span>
            <span className="truncate font-medium text-foreground">{item.permission || '-'}</span>
            <span>{t('settingsHub.route')}</span>
            <span className="truncate font-medium text-foreground">{item.href}</span>
          </div>
          <Button asChild variant="outline" className="w-full gap-2">
            <Link href={item.href} aria-label={t('settingsHub.openItem', null, { title: t(item.titleKey) })}>
              {t('settingsHub.open')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CategorySection({ category, items, t }) {
  const CategoryIcon = category.icon;
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border bg-background text-primary">
          <CategoryIcon className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t(category.labelKey)}</h2>
          <p className="text-xs text-muted-foreground">{t(category.descriptionKey)}</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {items.map((item) => (
          <SettingsCard key={item.id} item={item} t={t} />
        ))}
      </div>
    </section>
  );
}

function SettingsResults({ controller }) {
  const { t, filters, data, state } = controller;
  if (!state.hasAccess) {
    return (
      <Card className="rounded-lg border-dashed shadow-sm">
        <EmptyState
          icon={LockKeyhole}
          title={t('settingsHub.noAccessTitle')}
          description={t('settingsHub.noAccessDescription')}
        />
      </Card>
    );
  }

  if (!state.hasResults) {
    return (
      <Card className="rounded-lg border-dashed shadow-sm">
        <EmptyState
          icon={Search}
          title={t('settingsHub.noResultsTitle')}
          description={t('settingsHub.noResultsDescription')}
          action={<Button variant="outline" size="sm" onClick={filters.clearSearch}>{t('settingsHub.clearSearch')}</Button>}
        />
      </Card>
    );
  }

  if (filters.category !== SETTINGS_HUB_DEFAULT_CATEGORY) {
    const category = data.categories.find((item) => item.id === filters.category) || SETTINGS_HUB_CATEGORIES[0];
    return <CategorySection category={category} items={data.filteredItems} t={t} />;
  }

  return (
    <div className="space-y-8">
      {data.categories
        .filter((category) => category.id !== SETTINGS_HUB_DEFAULT_CATEGORY)
        .map((category) => {
          const items = data.groupedItems[category.id] || [];
          if (!items.length) return null;
          return <CategorySection key={category.id} category={category} items={items} t={t} />;
        })}
    </div>
  );
}

export function SettingsHubPage() {
  const controller = useSettingsHubController();
  const { hasPermission } = usePermissions();

  return (
    <div className="min-h-full bg-[linear-gradient(180deg,hsl(var(--muted)/0.45),transparent_360px)]">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-6 py-6">
        <Hero controller={controller} />
        <StatCards controller={controller} />
        <Tabs defaultValue="general" className="space-y-6">
          <TabsList>
            <TabsTrigger value="general">{controller.t('sidebarSettings.general')}</TabsTrigger>
            {hasPermission('settings:admin') && <TabsTrigger value="sidebar">{controller.t('sidebarSettings.tab')}</TabsTrigger>}
          </TabsList>
          <TabsContent value="general" className="space-y-6">
            <Toolbar controller={controller} />
            <SettingsResults controller={controller} />
          </TabsContent>
          {hasPermission('settings:admin') && <TabsContent value="sidebar"><SidebarSettings /></TabsContent>}
        </Tabs>
      </div>
    </div>
  );
}
