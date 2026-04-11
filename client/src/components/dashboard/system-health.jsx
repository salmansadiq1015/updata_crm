'use client';

import { useQuery } from '@tanstack/react-query';
import { healthService } from '@/services/health-service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

const statusIcons = {
  healthy: { icon: CheckCircle2, color: 'text-success', label: 'Gesund', bg: 'bg-success/10' },
  degraded: { icon: AlertTriangle, color: 'text-warning', label: 'Eingeschraenkt', bg: 'bg-warning/10' },
  unhealthy: { icon: XCircle, color: 'text-destructive', label: 'Nicht verfuegbar', bg: 'bg-destructive/10' },
};

export function SystemHealth() {
  const { data: health, isLoading } = useQuery({
    queryKey: ['health', 'status'],
    queryFn: healthService.getStatus,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const status = health?.status || 'unhealthy';
  const config = statusIcons[status] || statusIcons.unhealthy;
  const Icon = config.icon;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          Systemstatus
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-12 w-full rounded-lg" />
        ) : (
          <div className={`flex items-center gap-3 rounded-xl p-3 ${config.bg}`}>
            <Icon className={`h-5 w-5 ${config.color}`} />
            <div>
              <p className={`text-sm font-semibold ${config.color}`}>{config.label}</p>
              <p className="text-xs text-muted-foreground">
                Zuletzt geprueft: {new Date().toLocaleTimeString('de-CH')}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
