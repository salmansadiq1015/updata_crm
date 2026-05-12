'use client';

import { useSystemHealth } from '../hooks/use-platform-queries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, Database, HardDrive, Radio, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { useLanguage } from '@/lib/i18n/language-context';
import type { ComponentHealth } from '../types/platform.types';

const statusColor: Record<string, string> = {
  healthy: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  up: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  degraded: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  unhealthy: 'bg-red-500/10 text-red-600 border-red-500/20',
  down: 'bg-red-500/10 text-red-600 border-red-500/20',
};

const statusLabel: Record<string, string> = {
  healthy: 'Gesund',
  up: 'Online',
  degraded: 'Eingeschränkt',
  unhealthy: 'Nicht erreichbar',
  down: 'Offline',
};

function ComponentCard({
  name,
  icon: Icon,
  health,
}: {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  health?: ComponentHealth;
}) {
  const { t } = useLanguage();
  const status = health?.status ?? 'down';
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-muted/50 p-2.5">
              <Icon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">{name}</p>
              {health?.latency != null && (
                <p className="text-xs text-muted-foreground">
                  {t('platform.latency', { value: health.latency })}
                </p>
              )}
            </div>
          </div>
          <Badge variant="outline" className={statusColor[status]}>
            {t(`platform.health.${status}`)}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

export function HealthDashboard() {
  const { t } = useLanguage();
  const { data, isLoading } = useSystemHealth();
  const queryClient = useQueryClient();

  const handleRefresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.platform.health() });
  };

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-14 w-full rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const overallStatus = data?.status ?? 'unhealthy';
  const checks = data?.checks ?? {};

  return (
    <div className="space-y-6">
      {/* Overall status */}
      <Card>
        <CardHeader className="flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">{t('platform.systemStatus')}</CardTitle>
          <Button variant="ghost" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('common.refresh')}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div
              className={`h-3 w-3 rounded-full ${
                overallStatus === 'healthy'
                  ? 'bg-emerald-500'
                  : overallStatus === 'degraded'
                  ? 'bg-amber-500'
                  : 'bg-red-500'
              }`}
            />
            <span className="text-lg font-semibold">
              {t(`platform.health.${overallStatus}`)}
            </span>
            {data?.uptime != null && (
              <span className="text-sm text-muted-foreground">
                {t('platform.uptime', { value: formatUptime(data.uptime) })}
              </span>
            )}
            {data?.version && (
              <Badge variant="secondary" className="ml-auto">
                v{data.version}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Component health */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ComponentCard
          name={t('platform.database')}
          icon={Database}
          health={checks.database}
        />
        <ComponentCard
          name={t('platform.redisCache')}
          icon={HardDrive}
          health={checks.redis}
        />
        <ComponentCard
          name={t('platform.jobQueue')}
          icon={Activity}
          health={checks.queue}
        />
        <ComponentCard
          name={t('platform.storage')}
          icon={Radio}
          health={checks.storage}
        />
      </div>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
