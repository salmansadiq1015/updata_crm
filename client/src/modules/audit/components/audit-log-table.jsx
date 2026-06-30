'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  FileText,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { authService } from '@/modules/auth/services/auth-service';
import { useLanguage } from '@/lib/i18n/language-context';
import { queryKeys } from '@/lib/query/keys';
import { showError } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ALL_AUDIT_EVENTS,
  buildAuditMessage,
  buildAuditQueryParams,
  getAuditActor,
  getAuditDetailsHighlights,
  getAuditEventLabel,
  getAuditEventType,
  humanizeAuditToken,
} from '../utils/audit-log-utils';

const ALL_MARKER = '__all__';
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const DEFAULT_LIMIT = 25;

function useDebouncedValue(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);

  return debounced;
}

function formatDateTime(value, locale) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat(locale === 'de' ? 'de-CH' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function PremiumMetric({ icon: Icon, label, value, tone = 'default' }) {
  const toneClass = {
    default: 'text-foreground',
    success: 'text-emerald-500',
    danger: 'text-red-500',
    info: 'text-sky-500',
  }[tone];

  return (
    <div className="relative overflow-hidden rounded-xl border border-border/60 bg-card/85 px-4 py-3 shadow-sm">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgb(139_92_246_/_0.15),transparent_58%)]" />
      <div className="relative flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase text-muted-foreground">{label}</p>
          <p className={cn('mt-1 text-2xl font-bold tabular-nums', toneClass)}>{value}</p>
        </div>
        <div className="rounded-lg border border-border/60 bg-background/55 p-2 text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function DetailsCell({ details }) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const highlights = getAuditDetailsHighlights(details);

  if (!details || (typeof details === 'object' && Object.keys(details).length === 0)) {
    return <span className="text-sm text-muted-foreground">-</span>;
  }

  if (expanded) {
    return (
      <div className="space-y-2">
        <pre className="max-h-44 max-w-md overflow-auto rounded-lg border border-border/60 bg-muted/35 p-3 text-xs leading-relaxed whitespace-pre-wrap">
          {JSON.stringify(details, null, 2)}
        </pre>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          {t('common.less', 'Less')} <ChevronUp className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex max-w-md flex-wrap gap-1.5">
        {highlights.length ? highlights.map((item) => (
          <span key={item.key} className="rounded-full border border-border/60 bg-muted/25 px-2 py-1 text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground/80">{item.label}:</span> {item.value}
          </span>
        )) : <span className="text-sm text-muted-foreground">{String(details)}</span>}
      </div>
      {typeof details === 'object' && Object.keys(details).length > highlights.length && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          {t('common.more', 'More')} <ChevronDown className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function AuditEmptyState({ t }) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <div className="relative">
        <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
        <div className="relative rounded-2xl border border-primary/20 bg-primary/10 p-4 text-primary">
          <ShieldCheck className="h-8 w-8" />
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold">{t('audit.emptyTitle', 'No audit events found')}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('audit.emptyDescription', 'Adjust the filters or search term to review more activity.')}
        </p>
      </div>
    </div>
  );
}

function AuditLoadingRows() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, index) => (
        <TableRow key={index}>
          <TableCell colSpan={6} className="py-4">
            <div className="h-12 animate-pulse rounded-lg bg-muted/45" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

export function AuditLogTable() {
  const { t, locale } = useLanguage();
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    eventType: '',
    result: '',
    email: '',
    module: '',
    search: '',
    limit: DEFAULT_LIMIT,
  });
  const [cursor, setCursor] = useState(null);
  const [cursorStack, setCursorStack] = useState([]);
  const [isExporting, setIsExporting] = useState(false);

  const debouncedFilters = useDebouncedValue(filters);
  const params = useMemo(
    () => buildAuditQueryParams(debouncedFilters, cursor),
    [cursor, debouncedFilters],
  );

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: queryKeys.audit.list(params),
    queryFn: () => authService.getAuditLog(params),
    placeholderData: (prev) => prev,
  });

  const entries = useMemo(() => data?.data || [], [data]);
  const pagination = data?.pagination || {};
  const nextCursor = pagination.nextCursor || data?.nextCursor || null;
  const hasNext = Boolean(pagination.hasNext || nextCursor);
  const hasPrev = cursorStack.length > 0;

  const summary = useMemo(() => {
    const successful = entries.filter((entry) => entry.result === 'success').length;
    return {
      total: entries.length,
      successful,
      failed: entries.length - successful,
      modules: new Set(entries.map((entry) => entry.module).filter(Boolean)).size,
    };
  }, [entries]);

  const resetPaging = useCallback(() => {
    setCursor(null);
    setCursorStack([]);
  }, []);

  const updateFilter = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    resetPaging();
  }, [resetPaging]);

  const resetFilters = () => {
    setFilters({
      startDate: '',
      endDate: '',
      eventType: '',
      result: '',
      email: '',
      module: '',
      search: '',
      limit: DEFAULT_LIMIT,
    });
    resetPaging();
  };

  const handleNext = () => {
    if (!nextCursor) return;
    setCursorStack((prev) => [...prev, cursor]);
    setCursor(nextCursor);
  };

  const handlePrev = () => {
    setCursorStack((prev) => {
      const next = [...prev];
      const previousCursor = next.pop() ?? null;
      setCursor(previousCursor);
      return next;
    });
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const exportParams = buildAuditQueryParams(debouncedFilters, null);
      delete exportParams.limit;
      delete exportParams.cursor;
      const blob = await authService.exportAuditLog({ ...exportParams, format: 'csv' });
      const url = window.URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      showError(err.message || t('audit.exportFailed', 'Export failed'));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-xl border border-border/60 bg-card/85 shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgb(139_92_246_/_0.14),transparent_34%,rgb(14_165_233_/_0.10)_70%,rgb(16_185_129_/_0.08))]" />
        <div className="relative grid gap-4 p-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Activity className="h-3.5 w-3.5" />
              {t('audit.commandLabel', 'Security activity center')}
            </div>
            <h2 className="mt-3 text-xl font-bold tracking-tight">{t('audit.activityTitle', 'Who did what, when')}</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {t('audit.activityDescription', 'Readable audit messages with technical proof available when needed.')}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="h-10 gap-2" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {t('common.refresh', 'Refresh')}
            </Button>
            <Button className="h-10 gap-2 bg-gradient-to-r from-violet-500 via-sky-500 to-emerald-500 text-white shadow-[0_0_28px_rgba(14,165,233,0.28)]" onClick={handleExport} disabled={isExporting}>
              {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {isExporting ? t('audit.exporting', 'Exporting...') : t('audit.csvExport', 'CSV Export')}
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <PremiumMetric icon={FileText} label={t('audit.metrics.visible', 'Visible events')} value={summary.total} />
        <PremiumMetric icon={ShieldCheck} label={t('audit.metrics.success', 'Successful')} value={summary.successful} tone="success" />
        <PremiumMetric icon={AlertTriangle} label={t('audit.metrics.failed', 'Failed')} value={summary.failed} tone="danger" />
        <PremiumMetric icon={Filter} label={t('audit.metrics.modules', 'Modules')} value={summary.modules} tone="info" />
      </div>

      <Card className="relative overflow-hidden border-border/60 bg-card/85 shadow-sm">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgb(139_92_246_/_0.08),transparent_45%)]" />
        <CardContent className="relative p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-7">
            <div className="space-y-1.5 xl:col-span-2">
              <Label htmlFor="audit-search">{t('common.search', 'Search')}</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="audit-search"
                  className="h-11 pl-9"
                  placeholder={t('audit.searchPlaceholder', 'Search person, action, module, IP...')}
                  value={filters.search}
                  onChange={(event) => updateFilter('search', event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="audit-start">{t('audit.from', 'From')}</Label>
              <Input id="audit-start" className="h-11" type="date" value={filters.startDate} onChange={(event) => updateFilter('startDate', event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="audit-end">{t('audit.to', 'To')}</Label>
              <Input id="audit-end" className="h-11" type="date" value={filters.endDate} onChange={(event) => updateFilter('endDate', event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('audit.eventType', 'Event type')}</Label>
              <Select value={filters.eventType || ALL_MARKER} onValueChange={(value) => updateFilter('eventType', value === ALL_MARKER ? '' : value)}>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue placeholder={t('audit.allEvents', 'All events')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_MARKER}>{t('audit.allEvents', 'All events')}</SelectItem>
                  {ALL_AUDIT_EVENTS.map((type) => (
                    <SelectItem key={type} value={type}>
                      {t(`audit.event.${type}`, humanizeAuditToken(type))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('audit.result', 'Result')}</Label>
              <Select value={filters.result || ALL_MARKER} onValueChange={(value) => updateFilter('result', value === ALL_MARKER ? '' : value)}>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue placeholder={t('common.all', 'All')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_MARKER}>{t('common.all', 'All')}</SelectItem>
                  <SelectItem value="success">{t('audit.successful', 'Successful')}</SelectItem>
                  <SelectItem value="failure">{t('audit.failed', 'Failed')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="audit-module">{t('audit.module', 'Module')}</Label>
              <Input id="audit-module" className="h-11" placeholder={t('audit.filterModule', 'Filter module...')} value={filters.module} onChange={(event) => updateFilter('module', event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="audit-user">{t('audit.userEmail', 'User email')}</Label>
              <Input id="audit-user" className="h-11" placeholder={t('audit.searchEmail', 'Search email...')} value={filters.email} onChange={(event) => updateFilter('email', event.target.value)} />
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-3 border-t border-border/50 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              {isFetching && !isLoading ? (
                <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{t('common.loading', 'Loading...')}</span>
              ) : (
                t('audit.filterSummary', 'Filters apply to server-side audit data.')
              )}
            </div>
            <Button variant="outline" size="sm" onClick={resetFilters}>
              {t('common.reset', 'Reset')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/60 bg-card/85 shadow-sm">
        <CardContent className="p-0">
          {isError && (
            <div className="m-4 rounded-xl border border-destructive/25 bg-destructive/10 p-4 text-sm text-destructive">
              {error?.message || t('audit.loadFailed', 'Audit log could not be loaded.')}
            </div>
          )}

          <Table>
            <TableHeader className="bg-muted/35">
              <TableRow>
                <TableHead className="w-[190px] px-4">{t('audit.timestamp', 'Timestamp')}</TableHead>
                <TableHead className="min-w-[320px]">{t('audit.activity', 'Activity')}</TableHead>
                <TableHead className="min-w-[220px]">{t('audit.user', 'Person')}</TableHead>
                <TableHead>{t('audit.result', 'Result')}</TableHead>
                <TableHead className="min-w-[180px]">{t('audit.source', 'Source')}</TableHead>
                <TableHead className="min-w-[280px]">{t('audit.details', 'Details')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && !entries.length ? (
                <AuditLoadingRows />
              ) : entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <AuditEmptyState t={t} />
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((entry, index) => {
                  const eventType = getAuditEventType(entry);
                  const actor = getAuditActor(entry, t);
                  const message = buildAuditMessage(entry, t);
                  return (
                    <TableRow key={entry._id || entry.id || `${entry.timestamp}-${eventType}-${index}`} className="align-top">
                      <TableCell className="px-4 py-4 text-xs font-medium text-muted-foreground">
                        {formatDateTime(entry.timestamp || entry.createdAt, locale)}
                      </TableCell>
                      <TableCell className="whitespace-normal py-4">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold leading-snug text-foreground">{message}</p>
                          <p className="text-xs text-muted-foreground">{getAuditEventLabel(entry, t)}</p>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-normal py-4">
                        <div className="flex items-start gap-2">
                          <div className="mt-0.5 rounded-lg border border-border/60 bg-muted/30 p-1.5 text-muted-foreground">
                            <UserRound className="h-3.5 w-3.5" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">{actor}</p>
                            {entry.userId && <p className="text-xs text-muted-foreground">{String(entry.userId)}</p>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <Badge
                          variant={entry.result === 'success' ? 'outline' : 'destructive'}
                          className={entry.result === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600' : ''}
                        >
                          {entry.result === 'success' ? t('audit.success', 'Success') : t('audit.error', 'Error')}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-normal py-4">
                        <div className="space-y-1 text-xs text-muted-foreground">
                          <p><span className="font-semibold text-foreground/80">{t('audit.module', 'Module')}:</span> {entry.module || '-'}</p>
                          <p><span className="font-semibold text-foreground/80">{t('audit.ipAddress', 'IP address')}:</span> {entry.ipAddress || entry.ip || '-'}</p>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-normal py-4">
                        <DetailsCell details={entry.details || entry.metadata} />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/20 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span>{t('common.page', 'Page')} {cursorStack.length + 1}</span>
              <Select value={String(filters.limit)} onValueChange={(value) => updateFilter('limit', Number(value))}>
                <SelectTrigger className="h-9 w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <SelectItem key={size} value={String(size)}>{size} / {t('common.page', 'page')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isFetching && !isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handlePrev} disabled={!hasPrev || isFetching}>
                <ChevronLeft className="h-4 w-4" />
                {t('common.back', 'Back')}
              </Button>
              <Button variant="outline" size="sm" onClick={handleNext} disabled={!hasNext || isFetching}>
                {t('common.next', 'Next')}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
