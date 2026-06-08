'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { showError, showSuccess } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { Activity, CheckCircle2, Play, Power, PowerOff, RefreshCw, XCircle } from 'lucide-react';
import { integrationService } from '../services/integration-service';

const STATUS_STYLES = {
  healthy: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
  degraded: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
  down: 'bg-red-500/10 text-red-700 border-red-500/20',
  disabled: 'bg-muted text-muted-foreground border-border',
  unknown: 'bg-slate-500/10 text-slate-700 border-slate-500/20',
};

function normalizeData(response) {
  return response?.data ?? response ?? [];
}

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('de-CH', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function statusBadge(status) {
  return (
    <Badge variant="outline" className={cn('capitalize', STATUS_STYLES[status] || STATUS_STYLES.unknown)}>
      {status || 'unknown'}
    </Badge>
  );
}

function enabledBadge(enabled) {
  return enabled ? (
    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20">
      <CheckCircle2 className="mr-1 h-3 w-3" /> Aktiv
    </Badge>
  ) : (
    <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
      <XCircle className="mr-1 h-3 w-3" /> Inaktiv
    </Badge>
  );
}

export function IntegrationsDashboard() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState(null);

  const summary = useMemo(() => {
    const enabled = items.filter((item) => item.isEnabled).length;
    const healthy = items.filter((item) => item.status === 'healthy').length;
    const down = items.filter((item) => item.status === 'down' || item.status === 'degraded').length;
    return { total: items.length, enabled, healthy, down };
  }, [items]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await integrationService.dashboard();
      const data = normalizeData(response);
      setItems(Array.isArray(data) ? data : []);
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const runAction = async (integrationKey, action, successMessage) => {
    setBusyKey(integrationKey);
    try {
      await action(integrationKey);
      await refresh();
      showSuccess(successMessage);
    } catch (error) {
      showError(error);
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Integrationen</div>
            <div className="mt-1 text-2xl font-semibold">{summary.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Aktiv</div>
            <div className="mt-1 text-2xl font-semibold">{summary.enabled}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Healthy</div>
            <div className="mt-1 text-2xl font-semibold">{summary.healthy}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Probleme</div>
            <div className="mt-1 text-2xl font-semibold">{summary.down}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4" /> Provider Status
          </CardTitle>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" /> Aktualisieren
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Integration</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Aktiv</TableHead>
                <TableHead>Letzter Check</TableHead>
                <TableHead>Fehler</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={7} className="h-24 text-muted-foreground">Wird geladen...</TableCell></TableRow>
              )}
              {!loading && items.length === 0 && (
                <TableRow><TableCell colSpan={7} className="h-24 text-muted-foreground">Keine Integrationskonfigurationen gefunden.</TableCell></TableRow>
              )}
              {items.map((item) => (
                <TableRow key={item.integrationKey}>
                  <TableCell>
                    <div className="font-medium">{item.displayName || item.integrationKey}</div>
                    <div className="text-xs text-muted-foreground">{item.integrationKey}</div>
                  </TableCell>
                  <TableCell>{item.provider || '-'}</TableCell>
                  <TableCell>{statusBadge(item.status)}</TableCell>
                  <TableCell>{enabledBadge(item.isEnabled)}</TableCell>
                  <TableCell>{formatDate(item.lastHealthCheckAt)}</TableCell>
                  <TableCell className="max-w-[280px] whitespace-normal text-xs text-muted-foreground">
                    {item.lastErrorMessage || '-'}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        size="icon-sm"
                        variant="outline"
                        disabled={busyKey === item.integrationKey}
                        onClick={() => runAction(item.integrationKey, integrationService.healthCheck, 'Health Check abgeschlossen.')}
                        title="Health Check ausführen"
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                      {item.isEnabled ? (
                        <Button
                          size="icon-sm"
                          variant="outline"
                          disabled={busyKey === item.integrationKey}
                          onClick={() => runAction(item.integrationKey, integrationService.disable, 'Integration deaktiviert.')}
                          title="Deaktivieren"
                        >
                          <PowerOff className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          size="icon-sm"
                          variant="outline"
                          disabled={busyKey === item.integrationKey}
                          onClick={() => runAction(item.integrationKey, integrationService.enable, 'Integration aktiviert.')}
                          title="Aktivieren"
                        >
                          <Power className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
