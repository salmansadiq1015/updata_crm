'use client';

import { useMemo, useState } from 'react';
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { useLanguage } from '@/lib/i18n/language-context';
import { showError, showSuccess } from '@/lib/toast';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Download,
  FileWarning,
  Gauge,
  History,
  Info,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  SearchX,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  TestTube2,
} from 'lucide-react';
import {
  ERROR_TYPES,
  ISSUE_SEVERITIES,
  MIGRATION_DOMAINS,
  RUN_STATUSES,
  STATUS_STYLES,
} from '../constants/migration-constants';
import { useMigrationDashboard } from '../hooks/use-migration-dashboard';

const today = () => new Date().toISOString().slice(0, 10);
const DEFAULT_SCOPE_FILTER = '{}';

function createInitialForm() {
  return {
    runType: 'dry_run',
    environment: 'staging',
    sourceDataDate: today(),
    domains: MIGRATION_DOMAINS.map((domain) => domain.value),
    batchSize: 500,
    errorThresholdPercent: 5,
    sourceDataRef: '',
    rollbackBackupRef: '',
    scopeFilterJson: DEFAULT_SCOPE_FILTER,
    notes: '',
  };
}

const INITIAL_ERROR_FILTERS = {
  domain: 'all',
  severity: 'all',
  errorType: 'all',
};

function localeForIntl(language) {
  if (language === 'en') return 'en-US';
  if (language === 'it') return 'it-CH';
  if (language === 'fr') return 'fr-CH';
  return 'de-CH';
}

function formatDate(value, language) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat(localeForIntl(language), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function metric(value, suffix = '') {
  const num = Number(value || 0);
  return `${num.toLocaleString('de-CH', { maximumFractionDigits: 2 })}${suffix}`;
}

function domainLabel(domain, t) {
  return t(MIGRATION_DOMAINS.find((item) => item.value === domain)?.labelKey || `migration.domain.${domain}`);
}

function statusBadge(status, t) {
  const normalized = status || 'pending';
  return (
    <Badge variant="outline" className={cn('capitalize', STATUS_STYLES[normalized] || STATUS_STYLES.pending)}>
      {t(`migration.status.${normalized}`)}
    </Badge>
  );
}

function parseScopeFilter(raw, t) {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === DEFAULT_SCOPE_FILTER) return {};
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new Error('scope-filter-object');
    }
    return parsed;
  } catch {
    throw new Error(t('migration.validation.scopeFilterJson'));
  }
}

export function MigrationDashboard() {
  const { t, language } = useLanguage();
  const [statusFilter, setStatusFilter] = useState('all');
  const [errorFilters, setErrorFilters] = useState(INITIAL_ERROR_FILTERS);
  const [form, setForm] = useState(createInitialForm);
  const [confirmAction, setConfirmAction] = useState(null);

  const dashboard = useMigrationDashboard({ statusFilter, errorFilters });
  const {
    runs,
    selectedRun,
    selectedRunId,
    setSelectedRunId,
    progress,
    report,
    errors,
    errorsPagination,
    summary,
    isInitialLoading,
    isRefreshing,
    isError,
    error,
    busy,
    refreshAll,
    createRun,
    runAction,
    exportErrors,
  } = dashboard;

  const selectedStatus = selectedRun?.status;
  const totals = progress?.totals || {};
  const domains = progress?.domains?.length ? progress.domains : selectedRun?.domainStatuses || [];
  const canStart = selectedStatus === 'pending';
  const canPause = selectedStatus === 'running';
  const canResume = selectedStatus === 'paused';
  const canCancel = ['pending', 'running', 'paused'].includes(selectedStatus);
  const canRollback = selectedRun?.runType === 'production' && ['completed', 'failed'].includes(selectedStatus);
  const canSpotCheck = !!selectedRun && ['completed', 'failed'].includes(selectedStatus);

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const setErrorFilter = (field, value) => setErrorFilters((current) => ({ ...current, [field]: value }));

  const selectedDomainLabels = useMemo(
    () => form.domains.map((domain) => domainLabel(domain, t)).join(', '),
    [form.domains, t],
  );

  const toggleDomain = (domain, checked) => {
    setForm((current) => {
      const next = checked
        ? [...new Set([...current.domains, domain])]
        : current.domains.filter((item) => item !== domain);
      return { ...current, domains: next };
    });
  };

  const handleCreateRun = async (event) => {
    event.preventDefault();
    if (!form.domains.length) {
      showError(t('migration.validation.domainsRequired'));
      return;
    }
    if (!form.sourceDataDate) {
      showError(t('migration.validation.sourceDateRequired'));
      return;
    }

    const batchSize = Number(form.batchSize);
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 5000) {
      showError(t('migration.validation.batchSize'));
      return;
    }

    const errorThresholdPercent = Number(form.errorThresholdPercent);
    if (!Number.isFinite(errorThresholdPercent) || errorThresholdPercent < 0 || errorThresholdPercent > 100) {
      showError(t('migration.validation.errorThreshold'));
      return;
    }

    let scopeFilter = {};
    try {
      scopeFilter = parseScopeFilter(form.scopeFilterJson, t);
    } catch (parseError) {
      showError(parseError.message);
      return;
    }

    try {
      await createRun({
        runType: form.runType,
        environment: form.environment,
        sourceDataDate: new Date(form.sourceDataDate).toISOString(),
        domains: form.domains,
        batchSize,
        errorThresholdPercent,
        sourceDataRef: form.sourceDataRef,
        rollbackBackupRef: form.rollbackBackupRef,
        scopeFilter,
        notes: form.notes,
        sourceData: {},
      });
      setForm(createInitialForm());
      showSuccess(t('migration.toast.created'));
    } catch (createError) {
      showError(createError);
    }
  };

  const executeAction = async (type, successKey, payload) => {
    try {
      await runAction({ type, payload });
      showSuccess(t(successKey));
    } catch (actionError) {
      showError(actionError);
    }
  };

  const handleExportErrors = async () => {
    try {
      await exportErrors();
      showSuccess(t('migration.toast.errorsExported'));
    } catch (exportError) {
      showError(exportError);
    }
  };

  const handleRefresh = async () => {
    try {
      await refreshAll();
      showSuccess(t('migration.toast.refreshed'));
    } catch (refreshError) {
      showError(refreshError);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    await executeAction(confirmAction.type, confirmAction.successKey, confirmAction.payload);
    setConfirmAction(null);
  };

  if (isInitialLoading) return <MigrationSkeleton />;

  if (isError && runs.length === 0) {
    return (
      <Alert variant="destructive" className="rounded-xl border-destructive/20">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>{t('migration.error.loadTitle')}</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>{error?.message || t('migration.error.loadDescription')}</span>
          <Button size="sm" variant="outline" onClick={handleRefresh}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {t('migration.action.retry')}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Database} label={t('migration.summary.totalRuns')} value={metric(summary.total)} meta={t('migration.summary.totalMeta')} />
        <MetricCard icon={Gauge} label={t('migration.summary.running')} value={metric(summary.running)} meta={isRefreshing ? t('migration.summary.liveRefresh') : t('migration.summary.polling')} tone="blue" />
        <MetricCard icon={CheckCircle2} label={t('migration.summary.completed')} value={metric(summary.completed)} meta={t('migration.summary.completedMeta')} tone="emerald" />
        <MetricCard icon={AlertTriangle} label={t('migration.summary.attention')} value={metric(summary.attention)} meta={t('migration.summary.attentionMeta')} tone={summary.attention > 0 ? 'amber' : 'slate'} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card className="overflow-hidden border-border/70 shadow-theme-sm">
            <CardHeader className="border-b border-border bg-muted/20">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <SlidersHorizontal className="h-4 w-4 text-primary" />
                    {t('migration.newRun.title')}
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">{t('migration.newRun.description')}</p>
                </div>
                <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary">
                  {t(`migration.runType.${form.runType}`)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <form className="space-y-4" onSubmit={handleCreateRun}>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('migration.field.runType')}>
                    <Select value={form.runType} onValueChange={(value) => setField('runType', value)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dry_run">{t('migration.runType.dry_run')}</SelectItem>
                        <SelectItem value="production">{t('migration.runType.production')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label={t('migration.field.environment')}>
                    <Select value={form.environment} onValueChange={(value) => setField('environment', value)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="staging">{t('migration.environment.staging')}</SelectItem>
                        <SelectItem value="production">{t('migration.environment.production')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <Field label={t('migration.field.sourceDataDate')}>
                  <Input type="date" value={form.sourceDataDate} onChange={(event) => setField('sourceDataDate', event.target.value)} />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('migration.field.batchSize')}>
                    <Input type="number" min="1" max="5000" value={form.batchSize} onChange={(event) => setField('batchSize', event.target.value)} />
                  </Field>
                  <Field label={t('migration.field.errorThreshold')}>
                    <Input type="number" min="0" max="100" step="0.1" value={form.errorThresholdPercent} onChange={(event) => setField('errorThresholdPercent', event.target.value)} />
                  </Field>
                </div>

                <Field label={t('migration.field.domains')} hint={selectedDomainLabels || t('migration.field.noDomains')}>
                  <div className="grid gap-2 rounded-lg border border-border bg-muted/20 p-3">
                    {MIGRATION_DOMAINS.map((domain) => (
                      <label key={domain.value} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-1 text-sm text-foreground transition-colors hover:bg-background">
                        <Checkbox
                          checked={form.domains.includes(domain.value)}
                          onCheckedChange={(checked) => toggleDomain(domain.value, checked === true)}
                        />
                        <span className="min-w-0 truncate">{t(domain.labelKey)}</span>
                      </label>
                    ))}
                  </div>
                </Field>

                <Field label={t('migration.field.sourceRef')}>
                  <Input value={form.sourceDataRef} onChange={(event) => setField('sourceDataRef', event.target.value)} placeholder={t('migration.placeholder.sourceRef')} />
                </Field>

                <Field label={t('migration.field.rollbackRef')}>
                  <Input value={form.rollbackBackupRef} onChange={(event) => setField('rollbackBackupRef', event.target.value)} placeholder={t('migration.placeholder.rollbackRef')} />
                </Field>

                <Field label={t('migration.field.scopeFilter')} hint={t('migration.hint.scopeFilter')}>
                  <Textarea
                    value={form.scopeFilterJson}
                    onChange={(event) => setField('scopeFilterJson', event.target.value)}
                    rows={3}
                    spellCheck={false}
                    className="font-mono text-xs"
                  />
                </Field>

                <Field label={t('migration.field.notes')}>
                  <Textarea value={form.notes} onChange={(event) => setField('notes', event.target.value)} rows={3} />
                </Field>

                <Button type="submit" className="h-10 w-full gap-2" disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                  {t('migration.action.createRun')}
                </Button>
              </form>
            </CardContent>
          </Card>

          <RunHistoryPanel
            runs={runs}
            selectedRunId={selectedRunId}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            onSelect={setSelectedRunId}
            t={t}
            language={language}
          />
        </div>

        <div className="space-y-5">
          <CurrentRunPanel
            run={selectedRun}
            progress={progress}
            report={report}
            totals={totals}
            domains={domains}
            busy={busy}
            canStart={canStart}
            canPause={canPause}
            canResume={canResume}
            canCancel={canCancel}
            canRollback={canRollback}
            canSpotCheck={canSpotCheck}
            onRefresh={handleRefresh}
            onAction={executeAction}
            onConfirm={setConfirmAction}
            t={t}
            language={language}
          />

          {selectedRun && (
            <Tabs defaultValue="domains" className="space-y-4">
              <TabsList className="h-10 rounded-xl bg-muted/60 p-1">
                <TabsTrigger value="domains" className="px-3">{t('migration.tabs.domains')}</TabsTrigger>
                <TabsTrigger value="validation" className="px-3">{t('migration.tabs.validation')}</TabsTrigger>
                <TabsTrigger value="errors" className="px-3">{t('migration.tabs.errors')}</TabsTrigger>
              </TabsList>
              <TabsContent value="domains">
                <DomainStatusPanel domains={domains} t={t} />
              </TabsContent>
              <TabsContent value="validation">
                <ValidationPanel report={report} t={t} />
              </TabsContent>
              <TabsContent value="errors">
                <ErrorsPanel
                  errors={errors}
                  pagination={errorsPagination}
                  filters={errorFilters}
                  onFilterChange={setErrorFilter}
                  onExport={handleExportErrors}
                  busy={busy}
                  t={t}
                />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmAction}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title={confirmAction?.title || ''}
        description={confirmAction?.description || ''}
        confirmText={confirmAction?.confirmText || t('common.confirm')}
        cancelText={t('common.cancel')}
        loading={busy}
        variant={confirmAction?.variant || 'destructive'}
        onConfirm={handleConfirmAction}
      />
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, meta, tone = 'slate' }) {
  const toneClass = {
    slate: 'bg-slate-500/10 text-slate-700 dark:text-slate-300',
    blue: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
    emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  }[tone];

  return (
    <Card className="border-border/70 shadow-theme-sm">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', toneClass)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums text-foreground">{value}</span>
            <span className="truncate text-xs text-muted-foreground">{meta}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RunHistoryPanel({ runs, selectedRunId, statusFilter, onStatusFilterChange, onSelect, t, language }) {
  return (
    <Card className="overflow-hidden border-border/70 shadow-theme-sm">
      <CardHeader className="border-b border-border bg-muted/20">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-primary" />
            {t('migration.runs.title')}
          </CardTitle>
          <Select value={statusFilter} onValueChange={onStatusFilterChange}>
            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('migration.filter.allStatuses')}</SelectItem>
              {RUN_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>{t(`migration.status.${status}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-2">
        {runs.length === 0 ? (
          <div className="flex min-h-44 flex-col items-center justify-center rounded-lg border border-dashed border-border p-6 text-center">
            <SearchX className="h-8 w-8 text-muted-foreground/45" />
            <p className="mt-3 text-sm font-medium text-foreground">{t('migration.runs.emptyTitle')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('migration.runs.emptyDescription')}</p>
          </div>
        ) : (
          <div className="max-h-[520px] space-y-1 overflow-y-auto pr-1">
            {runs.map((run) => {
              const selected = selectedRunId === run._id;
              return (
                <button
                  key={run._id}
                  type="button"
                  onClick={() => onSelect(run._id)}
                  className={cn(
                    'w-full rounded-lg border px-3 py-3 text-left transition-colors hover:border-primary/30 hover:bg-primary/[0.03]',
                    selected ? 'border-primary/40 bg-primary/[0.05]' : 'border-transparent',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {t(`migration.runType.${run.runType}`)} · {t(`migration.environment.${run.environment}`)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{formatDate(run.createdAt, language)}</p>
                    </div>
                    {statusBadge(run.status, t)}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(run.domains || []).slice(0, 3).map((domain) => (
                      <Badge key={domain} variant="outline" className="bg-background text-[10px] text-muted-foreground">
                        {domainLabel(domain, t)}
                      </Badge>
                    ))}
                    {(run.domains || []).length > 3 && (
                      <Badge variant="outline" className="bg-background text-[10px] text-muted-foreground">
                        +{(run.domains || []).length - 3}
                      </Badge>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CurrentRunPanel({
  run,
  progress,
  report,
  totals,
  domains,
  busy,
  canStart,
  canPause,
  canResume,
  canCancel,
  canRollback,
  canSpotCheck,
  onRefresh,
  onAction,
  onConfirm,
  t,
  language,
}) {
  if (!run) {
    return (
      <Card className="border-border/70 shadow-theme-sm">
        <CardContent className="flex min-h-80 flex-col items-center justify-center p-8 text-center">
          <Database className="h-10 w-10 text-muted-foreground/45" />
          <p className="mt-4 text-base font-semibold text-foreground">{t('migration.current.emptyTitle')}</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">{t('migration.current.emptyDescription')}</p>
        </CardContent>
      </Card>
    );
  }

  const progressValue = Number(totals.progressPercent || 0);
  const healthText = report?.signOff?.requiresRollback
    ? t('migration.health.rollback')
    : report?.signOff?.readyForSpotCheck
      ? t('migration.health.ready')
      : t('migration.health.review');

  return (
    <Card className="overflow-hidden border-border/70 shadow-theme-sm">
      <CardHeader className="border-b border-border bg-muted/20">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">{t('migration.current.title')}</CardTitle>
              {statusBadge(run.status, t)}
              <Badge variant="outline" className="bg-background text-muted-foreground">
                {healthText}
              </Badge>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">{run._id}</p>
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={onRefresh} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {t('migration.action.refresh')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 p-5">
        <div className="grid gap-3 md:grid-cols-4">
          <MiniMetric label={t('migration.metric.progress')} value={metric(progressValue, '%')} icon={Gauge} />
          <MiniMetric label={t('migration.metric.processed')} value={`${metric(totals.processed)} / ${metric(totals.totalSource)}`} icon={Database} />
          <MiniMetric label={t('migration.metric.migrated')} value={metric(totals.migratedOk)} icon={CheckCircle2} />
          <MiniMetric label={t('migration.metric.errorRate')} value={metric(totals.errorRate, '%')} icon={FileWarning} danger={Number(totals.errorRate || 0) > Number(run.config?.errorThresholdPercent || 5)} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t('migration.current.progress')}</span>
            <span className="tabular-nums">{metric(progressValue, '%')}</span>
          </div>
          <Progress value={progressValue} className="h-2" />
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <RunFact icon={CalendarDays} label={t('migration.current.createdAt')} value={formatDate(run.createdAt, language)} />
          <RunFact icon={ClipboardCheck} label={t('migration.current.sourceDate')} value={formatDate(run.sourceDataDate, language)} />
          <RunFact icon={ShieldCheck} label={t('migration.current.threshold')} value={`${metric(run.config?.errorThresholdPercent, '%')} · ${metric(run.config?.batchSize)} ${t('migration.current.batchUnits')}`} />
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <RunFact icon={Info} label={t('migration.current.sourceRef')} value={run.config?.sourceDataRef || '-'} />
          <RunFact icon={RotateCcw} label={t('migration.current.rollbackRef')} value={run.config?.rollbackBackupRef || '-'} />
        </div>

        {run.failureReason && (
          <Alert variant="destructive" className="rounded-xl border-destructive/20">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{t('migration.current.failureReason')}</AlertTitle>
            <AlertDescription>{run.failureReason}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="gap-2" disabled={!canStart || busy} onClick={() => onAction('start', 'migration.toast.started')}>
            <Play className="h-4 w-4" />
            {t('migration.action.start')}
          </Button>
          <Button size="sm" variant="outline" className="gap-2" disabled={!canPause || busy} onClick={() => onAction('pause', 'migration.toast.paused')}>
            <Pause className="h-4 w-4" />
            {t('migration.action.pause')}
          </Button>
          <Button size="sm" variant="outline" className="gap-2" disabled={!canResume || busy} onClick={() => onAction('resume', 'migration.toast.resumed')}>
            <Play className="h-4 w-4" />
            {t('migration.action.resume')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            disabled={!canCancel || busy}
            onClick={() => onConfirm({
              type: 'cancel',
              successKey: 'migration.toast.cancelled',
              title: t('migration.confirm.cancelTitle'),
              description: t('migration.confirm.cancelDescription'),
              confirmText: t('migration.action.cancel'),
              variant: 'destructive',
            })}
          >
            <Square className="h-4 w-4" />
            {t('migration.action.cancel')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            disabled={!canSpotCheck || busy}
            onClick={() => onAction('spotCheck', 'migration.toast.spotCheck', { sampleSizePerDomain: 10, domains: run.domains })}
          >
            <TestTube2 className="h-4 w-4" />
            {t('migration.action.spotCheck')}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="gap-2"
            disabled={!canRollback || busy}
            onClick={() => onConfirm({
              type: 'rollback',
              successKey: 'migration.toast.rolledBack',
              payload: { rollbackType: 'full', rollbackBackupRef: run.config?.rollbackBackupRef || '' },
              title: t('migration.confirm.rollbackTitle'),
              description: t('migration.confirm.rollbackDescription'),
              confirmText: t('migration.action.rollback'),
              variant: 'destructive',
            })}
          >
            <RotateCcw className="h-4 w-4" />
            {t('migration.action.rollback')}
          </Button>
        </div>

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {domains.map((domain) => (
            <div key={domain.domain} className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium text-foreground">{domainLabel(domain.domain, t)}</span>
                {statusBadge(domain.status, t)}
              </div>
              <Progress value={Number(domain.processingRate || 0)} className="mt-3 h-1.5" />
              <p className="mt-2 text-xs text-muted-foreground">
                {metric(domain.processed)} / {metric(domain.totalSource)} · {metric(domain.failed)} {t('migration.domain.failedShort')}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function MiniMetric({ label, value, icon: Icon, danger }) {
  return (
    <div className={cn('rounded-lg border bg-background p-3', danger ? 'border-destructive/30' : 'border-border')}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className={cn('h-3.5 w-3.5', danger && 'text-destructive')} />
        {label}
      </div>
      <p className={cn('mt-2 text-xl font-semibold tabular-nums text-foreground', danger && 'text-destructive')}>{value}</p>
    </div>
  );
}

function RunFact({ icon: Icon, label, value }) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-lg border border-border bg-background p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 truncate text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}

function DomainStatusPanel({ domains, t }) {
  return (
    <Card className="overflow-hidden border-border/70 shadow-theme-sm">
      <CardHeader className="border-b border-border bg-muted/20">
        <CardTitle className="text-base">{t('migration.domains.title')}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('migration.table.domain')}</TableHead>
              <TableHead>{t('migration.table.status')}</TableHead>
              <TableHead className="text-right">{t('migration.table.processed')}</TableHead>
              <TableHead className="text-right">{t('migration.table.ok')}</TableHead>
              <TableHead className="text-right">{t('migration.table.warnings')}</TableHead>
              <TableHead className="text-right">{t('migration.table.failed')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {domains.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">{t('migration.domains.empty')}</TableCell>
              </TableRow>
            )}
            {domains.map((domain) => (
              <TableRow key={domain.domain}>
                <TableCell className="font-medium">{domainLabel(domain.domain, t)}</TableCell>
                <TableCell>{statusBadge(domain.status, t)}</TableCell>
                <TableCell className="text-right tabular-nums">{metric(domain.processed)} / {metric(domain.totalSource)}</TableCell>
                <TableCell className="text-right tabular-nums">{metric(domain.migratedOk)}</TableCell>
                <TableCell className="text-right tabular-nums">{metric(domain.migratedWarning)}</TableCell>
                <TableCell className="text-right tabular-nums">{metric(domain.failed)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ValidationPanel({ report, t }) {
  const severityItems = report?.errors?.bySeverity || [];
  const typeItems = report?.errors?.byType || [];
  const ready = !!report?.signOff?.readyForSpotCheck;
  const rollback = !!report?.signOff?.requiresRollback;

  return (
    <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Card className="border-border/70 shadow-theme-sm">
        <CardHeader className="border-b border-border bg-muted/20">
          <CardTitle className="flex items-center gap-2 text-base">
            {ready ? <ShieldCheck className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
            {t('migration.validation.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-4">
          <ChecklistRow checked={ready} label={t('migration.validation.spotCheckReady')} />
          <ChecklistRow checked={!rollback} label={t('migration.validation.rollbackNotRequired')} />
          <ChecklistRow checked={!severityItems.some((item) => item._id === 'error' && item.count > 0)} label={t('migration.validation.noBlockingErrors')} />
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-theme-sm">
        <CardHeader className="border-b border-border bg-muted/20">
          <CardTitle className="text-base">{t('migration.validation.errorProfile')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 md:grid-cols-2">
          <AggregationList title={t('migration.validation.bySeverity')} items={severityItems} labelPrefix="migration.severity" t={t} />
          <AggregationList title={t('migration.validation.byType')} items={typeItems} labelPrefix="migration.errorType" t={t} />
        </CardContent>
      </Card>
    </div>
  );
}

function ChecklistRow({ checked, label }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
      {checked ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
      <span className="text-foreground">{label}</span>
    </div>
  );
}

function AggregationList({ title, items, labelPrefix, t }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-xs font-medium uppercase text-muted-foreground">{title}</p>
      <div className="mt-3 space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('migration.validation.noIssues')}</p>
        ) : (
          items.map((item) => (
            <div key={item._id} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-foreground">{t(`${labelPrefix}.${item._id}`)}</span>
              <Badge variant="outline" className="bg-muted tabular-nums">{metric(item.count)}</Badge>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ErrorsPanel({ errors, pagination, filters, onFilterChange, onExport, busy, t }) {
  return (
    <Card className="overflow-hidden border-border/70 shadow-theme-sm">
      <CardHeader className="border-b border-border bg-muted/20">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileWarning className="h-4 w-4 text-primary" />
            {t('migration.errors.title')}
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Select value={filters.domain} onValueChange={(value) => onFilterChange('domain', value)}>
              <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('migration.filter.allDomains')}</SelectItem>
                {MIGRATION_DOMAINS.map((domain) => (
                  <SelectItem key={domain.value} value={domain.value}>{t(domain.labelKey)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filters.severity} onValueChange={(value) => onFilterChange('severity', value)}>
              <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('migration.filter.allSeverities')}</SelectItem>
                {ISSUE_SEVERITIES.map((severity) => (
                  <SelectItem key={severity} value={severity}>{t(`migration.severity.${severity}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filters.errorType} onValueChange={(value) => onFilterChange('errorType', value)}>
              <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('migration.filter.allErrorTypes')}</SelectItem>
                {ERROR_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>{t(`migration.errorType.${type}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="h-9 gap-2" disabled={busy} onClick={onExport}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {t('migration.action.exportErrors')}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('migration.table.domain')}</TableHead>
              <TableHead>{t('migration.table.severity')}</TableHead>
              <TableHead>{t('migration.table.type')}</TableHead>
              <TableHead>{t('migration.table.message')}</TableHead>
              <TableHead>{t('migration.table.fix')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {errors.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">{t('migration.errors.empty')}</TableCell>
              </TableRow>
            )}
            {errors.map((item) => (
              <TableRow key={item._id}>
                <TableCell>{domainLabel(item.domain, t)}</TableCell>
                <TableCell>{t(`migration.severity.${item.severity}`)}</TableCell>
                <TableCell>{t(`migration.errorType.${item.errorType}`)}</TableCell>
                <TableCell className="max-w-[420px] whitespace-normal">{item.errorMessage}</TableCell>
                <TableCell className="max-w-[280px] whitespace-normal text-muted-foreground">{item.suggestedFix || '-'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {pagination && (
          <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
            {t('migration.errors.pagination', null, { count: pagination.total })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MigrationSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="border-border/70">
            <CardContent className="flex items-center gap-3 p-4">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-6 w-20" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <Skeleton className="h-[720px] rounded-xl" />
        <Skeleton className="h-[520px] rounded-xl" />
      </div>
    </div>
  );
}
