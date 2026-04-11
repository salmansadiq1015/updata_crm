'use client';

import { useQuery } from '@tanstack/react-query';
import { healthService } from '@/services/health-service';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Activity, Database, HardDrive, Radio, CheckCircle2,
  AlertTriangle, XCircle, RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const statusIcon = {
  healthy: { icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10', label: 'Gesund' },
  degraded: { icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10', label: 'Eingeschraenkt' },
  unhealthy: { icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10', label: 'Nicht verfuegbar' },
};

const dependencies = [
  { key: 'database', label: 'Datenbank', icon: Database, desc: 'MongoDB Atlas' },
  { key: 'redis', label: 'Cache', icon: HardDrive, desc: 'Redis' },
  { key: 'queue', label: 'Job Queue', icon: Radio, desc: 'BullMQ' },
];

export default function SystemPage() {
  const { data: health, isLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['health', 'status'],
    queryFn: healthService.getStatus,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const overallStatus = health?.status || 'unhealthy';
  const config = statusIcon[overallStatus] || statusIcon.unhealthy;
  const StatusIcon = config.icon;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Systemstatus"
        description="Ueberwachung der Systemkomponenten und Abhaengigkeiten."
      >
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" />
          Aktualisieren
        </Button>
      </PageHeader>

      {/* Overall Status Banner */}
      {isLoading ? (
        <Skeleton className="h-20 rounded-xl" />
      ) : (
        <Card className={`border-l-4 ${overallStatus === 'healthy' ? 'border-l-success' : overallStatus === 'degraded' ? 'border-l-warning' : 'border-l-destructive'}`}>
          <CardContent className="flex items-center gap-4 p-5">
            <div className={`h-12 w-12 rounded-xl ${config.bg} flex items-center justify-center`}>
              <StatusIcon className={`h-6 w-6 ${config.color}`} />
            </div>
            <div>
              <p className={`text-lg font-bold ${config.color}`}>{config.label}</p>
              <p className="text-sm text-muted-foreground">
                Zuletzt geprueft: {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('de-CH') : '—'}
              </p>
            </div>
            <Badge variant="outline" className="ml-auto">
              Auto-Refresh: 15s
            </Badge>
          </CardContent>
        </Card>
      )}

      {/* Dependencies */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {dependencies.map((dep) => {
          const depStatus = health?.dependencies?.[dep.key]?.status || (health?.status === 'healthy' ? 'healthy' : 'unhealthy');
          const depConfig = statusIcon[depStatus] || statusIcon.unhealthy;
          const DepStatusIcon = depConfig.icon;
          const DepIcon = dep.icon;

          return (
            <Card key={dep.key} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <DepIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold text-sm">{dep.label}</span>
                  </div>
                  <DepStatusIcon className={`h-4 w-4 ${depConfig.color}`} />
                </div>
                <p className="text-xs text-muted-foreground">{dep.desc}</p>
                <div className={`mt-3 rounded-lg px-2.5 py-1.5 text-xs font-medium ${depConfig.bg} ${depConfig.color}`}>
                  {depConfig.label}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
