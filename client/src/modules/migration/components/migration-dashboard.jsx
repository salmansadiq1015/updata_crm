'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { downloadBlob } from '@/lib/api/download';
import { showError, showSuccess } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { AlertTriangle, CheckCircle2, Download, Pause, Play, RotateCcw, ShieldCheck, Square, TestTube2 } from 'lucide-react';
import { MIGRATION_DOMAINS, RUN_STATUSES, STATUS_STYLES } from '../constants/migration-constants';
import { migrationService } from '../services/migration-service';

const today = () => new Date().toISOString().slice(0, 10);

const initialForm = {
  runType: 'dry_run',
  environment: 'staging',
  sourceDataDate: today(),
  domains: MIGRATION_DOMAINS.map((domain) => domain.value),
  batchSize: 500,
  errorThresholdPercent: 5,
  sourceDataRef: '',
  rollbackBackupRef: '',
  notes: '',
};

function normalizeData(response) {
  return response?.data ?? response ?? null;
}

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('de-CH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function statusBadge(status) {
  return (
    <Badge variant="outline" className={cn('capitalize', STATUS_STYLES[status] || STATUS_STYLES.pending)}>
      {status?.replace('_', ' ') || 'pending'}
    </Badge>
  );
}

function metric(value, suffix = '') {
  const num = Number(value || 0);
  return `${num.toLocaleString('de-CH', { maximumFractionDigits: 2 })}${suffix}`;
}

export function MigrationDashboard() {
  const [runs, setRuns] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [selectedRun, setSelectedRun] = useState(null);
  const [progress, setProgress] = useState(null);
  const [report, setReport] = useState(null);
  const [errors, setErrors] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [form, setForm] = useState(initialForm);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const selectedStatus = selectedRun?.status;
  const canStart = ['pending', 'paused'].includes(selectedStatus);
  const canPause = selectedStatus === 'running';
  const canCancel = ['pending', 'running', 'paused'].includes(selectedStatus);
  const canRollback = selectedRun?.runType === 'production' && ['completed', 'failed'].includes(selectedStatus);

  const filteredRuns = useMemo(() => (
    statusFilter === 'all' ? runs : runs.filter((run) => run.status === statusFilter)
  ), [runs, statusFilter]);

  const refreshRuns = useCallback(async () => {
    const response = await migrationService.listRuns({ limit: 50 });
    const data = normalizeData(response);
    const list = Array.isArray(data) ? data : [];
    setRuns(list);
    setSelectedRunId((current) => current || list[0]?._id || null);
  }, []);

  const refreshSelected = useCallback(async (runId = selectedRunId) => {
    if (!runId) {
      setSelectedRun(null);
      setProgress(null);
      setReport(null);
      setErrors([]);
      return;
    }

    const [runResponse, progressResponse, reportResponse, errorResponse] = await Promise.all([
      migrationService.getRun(runId),
      migrationService.progress(runId),
      migrationService.validationReport(runId),
      migrationService.errors(runId, { pageSize: 8 }),
    ]);

    setSelectedRun(normalizeData(runResponse));
    setProgress(normalizeData(progressResponse));
    setReport(normalizeData(reportResponse));
    setErrors(normalizeData(errorResponse)?.data || []);
  }, [selectedRunId]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      await refreshRuns();
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  }, [refreshRuns]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshSelected().catch(showError);
  }, [refreshSelected]);

  useEffect(() => {
    if (!selectedRunId || selectedStatus !== 'running') return undefined;
    const timer = setInterval(() => {
      refreshRuns().catch(showError);
      refreshSelected(selectedRunId).catch(showError);
    }, 5000);
    return () => clearInterval(timer);
  }, [refreshRuns, refreshSelected, selectedRunId, selectedStatus]);

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const toggleDomain = (domain, checked) => {
    setForm((current) => {
      const next = checked
        ? [...new Set([...current.domains, domain])]
        : current.domains.filter((item) => item !== domain);
      return { ...current, domains: next };
    });
  };

  const runAction = async (label, action) => {
    if (!selectedRunId) return;
    setBusy(true);
    try {
      await action(selectedRunId);
      await refreshRuns();
      await refreshSelected(selectedRunId);
      showSuccess(label);
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  const createRun = async (event) => {
    event.preventDefault();
    if (!form.domains.length) {
      showError('Bitte mindestens einen Bereich auswählen.');
      return;
    }

    setBusy(true);
    try {
      const response = await migrationService.createRun({
        ...form,
        batchSize: Number(form.batchSize),
        errorThresholdPercent: Number(form.errorThresholdPercent),
        sourceDataDate: new Date(form.sourceDataDate).toISOString(),
        sourceData: {},
      });
      const run = normalizeData(response);
      setSelectedRunId(run?._id || null);
      setForm(initialForm);
      await refreshRuns();
      showSuccess('Migrationslauf erstellt.');
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  const exportErrors = async () => {
    if (!selectedRunId) return;
    setBusy(true);
    try {
      const response = await migrationService.exportErrors(selectedRunId);
      downloadBlob(response.data, `migration-errors-${selectedRunId}.csv`, 'text/csv;charset=utf-8');
      showSuccess('Fehlerexport heruntergeladen.');
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  const totals = progress?.totals || {};

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Neuer Lauf</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={createRun}>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Typ</Label>
                  <Select value={form.runType} onValueChange={(value) => setField('runType', value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dry_run">Dry run</SelectItem>
                      <SelectItem value="production">Production</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Umgebung</Label>
                  <Select value={form.environment} onValueChange={(value) => setField('environment', value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="staging">Staging</SelectItem>
                      <SelectItem value="production">Production</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Quelldaten-Datum</Label>
                <Input type="date" value={form.sourceDataDate} onChange={(event) => setField('sourceDataDate', event.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Batch</Label>
                  <Input type="number" min="1" max="5000" value={form.batchSize} onChange={(event) => setField('batchSize', event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Fehler %</Label>
                  <Input type="number" min="0" max="100" step="0.1" value={form.errorThresholdPercent} onChange={(event) => setField('errorThresholdPercent', event.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Bereiche</Label>
                <div className="grid gap-2 rounded-md border border-border p-3">
                  {MIGRATION_DOMAINS.map((domain) => (
                    <label key={domain.value} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.domains.includes(domain.value)}
                        onCheckedChange={(checked) => toggleDomain(domain.value, checked === true)}
                      />
                      {domain.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Quellen-Referenz</Label>
                <Input value={form.sourceDataRef} onChange={(event) => setField('sourceDataRef', event.target.value)} placeholder="Exportdatei, Ticket oder Ablageort" />
              </div>

              <div className="space-y-2">
                <Label>Notizen</Label>
                <Textarea value={form.notes} onChange={(event) => setField('notes', event.target.value)} rows={3} />
              </div>

              <Button type="submit" className="w-full" disabled={busy}>
                Lauf erstellen
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Läufe</CardTitle>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle</SelectItem>
                {RUN_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>{status.replace('_', ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableBody>
                {loading && (
                  <TableRow><TableCell className="h-20 text-muted-foreground">Wird geladen...</TableCell></TableRow>
                )}
                {!loading && filteredRuns.length === 0 && (
                  <TableRow><TableCell className="h-20 text-muted-foreground">Keine Migrationsläufe gefunden.</TableCell></TableRow>
                )}
                {filteredRuns.map((run) => (
                  <TableRow
                    key={run._id}
                    className={cn('cursor-pointer', selectedRunId === run._id && 'bg-muted/70')}
                    onClick={() => setSelectedRunId(run._id)}
                  >
                    <TableCell>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium">{run.runType} · {run.environment}</div>
                          <div className="text-xs text-muted-foreground">{formatDate(run.createdAt)}</div>
                        </div>
                        {statusBadge(run.status)}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base">Aktueller Lauf</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{selectedRun?._id || 'Kein Lauf ausgewählt'}</p>
            </div>
            {selectedRun && statusBadge(selectedRun.status)}
          </CardHeader>
          <CardContent className="space-y-5">
            {!selectedRun ? (
              <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                Erstelle oder wähle einen Migrationslauf.
              </div>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">Fortschritt</div>
                    <div className="text-lg font-semibold">{metric(totals.progressPercent, '%')}</div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">Verarbeitet</div>
                    <div className="text-lg font-semibold">{metric(totals.processed)} / {metric(totals.totalSource)}</div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">Migriert</div>
                    <div className="text-lg font-semibold">{metric(totals.migratedOk)}</div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">Fehlerrate</div>
                    <div className="text-lg font-semibold">{metric(totals.errorRate, '%')}</div>
                  </div>
                </div>

                <Progress value={Number(totals.progressPercent || 0)} />

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={!canStart || busy} onClick={() => runAction('Migration gestartet.', migrationService.start)}>
                    <Play className="mr-2 h-4 w-4" /> Start
                  </Button>
                  <Button size="sm" variant="outline" disabled={!canPause || busy} onClick={() => runAction('Migration pausiert.', migrationService.pause)}>
                    <Pause className="mr-2 h-4 w-4" /> Pause
                  </Button>
                  <Button size="sm" variant="outline" disabled={!canStart || selectedStatus !== 'paused' || busy} onClick={() => runAction('Migration fortgesetzt.', migrationService.resume)}>
                    <Play className="mr-2 h-4 w-4" /> Fortsetzen
                  </Button>
                  <Button size="sm" variant="outline" disabled={!canCancel || busy} onClick={() => runAction('Migration abgebrochen.', migrationService.cancel)}>
                    <Square className="mr-2 h-4 w-4" /> Abbrechen
                  </Button>
                  <Button size="sm" variant="outline" disabled={!selectedRunId || busy} onClick={() => runAction('Spotcheck erstellt.', (id) => migrationService.generateSpotCheck(id, { sampleSizePerDomain: 10, domains: selectedRun.domains }))}>
                    <TestTube2 className="mr-2 h-4 w-4" /> Spotcheck
                  </Button>
                  <Button size="sm" variant="outline" disabled={!selectedRunId || busy} onClick={exportErrors}>
                    <Download className="mr-2 h-4 w-4" /> Fehler CSV
                  </Button>
                  <Button size="sm" variant="destructive" disabled={!canRollback || busy} onClick={() => runAction('Rollback ausgeführt.', (id) => migrationService.rollback(id, { rollbackType: 'full' }))}>
                    <RotateCcw className="mr-2 h-4 w-4" /> Rollback
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {selectedRun && (
          <div className="grid gap-6 2xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Bereichsstatus</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bereich</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">OK</TableHead>
                      <TableHead className="text-right">Fehler</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(progress?.domains || selectedRun.domainStatuses || []).map((domain) => (
                      <TableRow key={domain.domain}>
                        <TableCell className="font-medium">{domain.domain}</TableCell>
                        <TableCell>{statusBadge(domain.status)}</TableCell>
                        <TableCell className="text-right">{metric(domain.migratedOk)}</TableCell>
                        <TableCell className="text-right">{metric(domain.failed)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  {report?.signOff?.readyForSpotCheck ? <ShieldCheck className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
                  Validierung
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className={cn('h-4 w-4', report?.signOff?.readyForSpotCheck ? 'text-emerald-600' : 'text-muted-foreground')} />
                  Spotcheck bereit: {report?.signOff?.readyForSpotCheck ? 'Ja' : 'Nein'}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <AlertTriangle className={cn('h-4 w-4', report?.signOff?.requiresRollback ? 'text-red-600' : 'text-muted-foreground')} />
                  Rollback empfohlen: {report?.signOff?.requiresRollback ? 'Ja' : 'Nein'}
                </div>
                <div className="grid grid-cols-3 gap-2 pt-2">
                  {(report?.errors?.bySeverity || []).map((item) => (
                    <div key={item._id} className="rounded-md border p-3">
                      <div className="text-xs text-muted-foreground">{item._id}</div>
                      <div className="text-lg font-semibold">{metric(item.count)}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {selectedRun && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Letzte Fehler</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bereich</TableHead>
                    <TableHead>Schwere</TableHead>
                    <TableHead>Typ</TableHead>
                    <TableHead>Meldung</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {errors.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="h-20 text-muted-foreground">Keine Fehler protokolliert.</TableCell></TableRow>
                  )}
                  {errors.map((error) => (
                    <TableRow key={error._id}>
                      <TableCell>{error.domain}</TableCell>
                      <TableCell>{error.severity}</TableCell>
                      <TableCell>{error.errorType}</TableCell>
                      <TableCell className="max-w-[420px] whitespace-normal">{error.errorMessage}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
