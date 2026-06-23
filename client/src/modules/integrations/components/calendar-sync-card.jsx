'use client';

import { useMemo } from 'react';
import { useCalendarSyncMutations, useCalendarSyncStatus } from '@/modules/integrations/hooks/use-calendar-sync';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Unplug,
} from 'lucide-react';

const PROVIDERS = [
  { key: 'google', label: 'Google Calendar' },
  { key: 'outlook', label: 'Outlook / Exchange' },
];

function formatDateTime(value) {
  if (!value) return null;
  return new Intl.DateTimeFormat('de-CH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function providerTone(status) {
  if (status?.isConnected) {
    return {
      badge: 'Connected',
      badgeClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
      iconClass: 'text-emerald-500',
    };
  }
  if (status?.status === 'expired' || status?.lastErrorMessage) {
    return {
      badge: 'Needs auth',
      badgeClass: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
      iconClass: 'text-amber-500',
    };
  }
  return {
    badge: 'Disconnected',
    badgeClass: 'border-border bg-muted/50 text-muted-foreground',
    iconClass: 'text-muted-foreground',
  };
}

export function CalendarSyncCard() {
  const { data: status = {}, isLoading, isError, refetch, isFetching } = useCalendarSyncStatus();
  const { connect, disconnect } = useCalendarSyncMutations();

  const providers = useMemo(() => (
    PROVIDERS.map((provider) => ({
      ...provider,
      status: status[provider.key] || { status: 'disconnected', isConnected: false },
    }))
  ), [status]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-44" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            Kalender-Integration
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-4 w-4 mt-0.5 text-destructive" />
            <div>
              <p className="text-sm font-medium">Status konnte nicht geladen werden.</p>
              <p className="text-xs text-muted-foreground">Pruefen Sie Berechtigungen oder versuchen Sie es erneut.</p>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            Kalender-Integration
          </CardTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Status aktualisieren"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {providers.map((provider) => {
          const tone = providerTone(provider.status);
          const lastSync = formatDateTime(provider.status.lastSyncAt);
          const expiresAt = formatDateTime(provider.status.tokenExpiresAt);
          const isProviderConnecting = connect.isPending && connect.variables === provider.key;
          const isProviderDisconnecting = disconnect.isPending && disconnect.variables === provider.key;

          return (
            <div
              key={provider.key}
              className="flex flex-col gap-4 rounded-lg border border-border/70 bg-background p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CheckCircle2 className={cn('h-4 w-4', tone.iconClass)} />
                  <p className="text-sm font-medium">{provider.label}</p>
                  <Badge variant="outline" className={cn('text-[11px]', tone.badgeClass)}>
                    {tone.badge}
                  </Badge>
                </div>
                <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                  <span>Letzte Synchronisierung: {lastSync || 'Noch nie'}</span>
                  <span>Token gueltig bis: {expiresAt || 'Nicht verbunden'}</span>
                </div>
                {provider.status.lastErrorMessage && (
                  <p className="text-xs text-amber-600 dark:text-amber-300">
                    {provider.status.lastErrorMessage}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                {provider.status.isConnected ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => disconnect.mutate(provider.key)}
                    disabled={disconnect.isPending || connect.isPending}
                  >
                    {isProviderDisconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />}
                    Trennen
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => connect.mutate(provider.key)}
                    disabled={connect.isPending || disconnect.isPending}
                  >
                    {isProviderConnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarDays className="h-3.5 w-3.5" />}
                    Verbinden
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
