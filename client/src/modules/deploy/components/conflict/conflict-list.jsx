'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Filter,
  ListFilter,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useConflictList, useConflictMutations } from '../../hooks/use-conflict-mutations';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { CONFLICT_TYPE_META, CONFLICT_SEVERITY_META, translateMetaLabel } from '../../constants/deploy-constants';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/ui/form-field';
import { Skeleton } from '@/components/ui/skeleton';
import { DeployEmptyState } from '../shared/deploy-empty-state';
import { useDebounce } from '@/shared/hooks/use-debounce';

const FILTER_ALL = 'ALL';
const MIN_REASON_LENGTH = 10;

const SEVERITY_TONES = {
  HARD: {
    icon: AlertCircle,
    card: 'border-red-500/25 bg-red-500/[0.06]',
    chip: 'border-red-500/25 bg-red-500/10 text-red-300',
    text: 'text-red-300',
    ring: 'bg-red-400',
  },
  SOFT: {
    icon: AlertTriangle,
    card: 'border-amber-500/25 bg-amber-500/[0.06]',
    chip: 'border-amber-500/25 bg-amber-500/10 text-amber-300',
    text: 'text-amber-300',
    ring: 'bg-amber-400',
  },
};

function normalizeConflicts(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function getReferenceId(value) {
  if (!value) return '';
  if (typeof value === 'object') return value._id || value.id || '';
  return String(value);
}

function getConflictId(conflict) {
  return getReferenceId(conflict);
}

function formatDetectedAt(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return format(date, 'dd.MM.yyyy HH:mm');
}

function getConflictLabels(conflict, t) {
  const typeMeta = CONFLICT_TYPE_META[conflict.conflictType];
  const severityMeta = CONFLICT_SEVERITY_META[conflict.severity];
  return {
    typeMeta,
    severityMeta,
    typeLabel: translateMetaLabel(t, typeMeta, conflict.conflictType || 'Conflict'),
    severityLabel: translateMetaLabel(t, severityMeta, conflict.severity || 'Active'),
  };
}

function getSearchText(conflict, labels) {
  return [
    labels.typeLabel,
    labels.severityLabel,
    conflict.conflictType,
    conflict.severity,
    conflict.description,
    getReferenceId(conflict.assignmentId),
    getReferenceId(conflict.conflictingWithId),
  ].filter(Boolean).join(' ').toLowerCase();
}

function MetricCard({ icon: Icon, label, value, detail, tone = 'default' }) {
  const toneClass = {
    default: 'border-border/70 bg-card/70 text-foreground',
    hard: 'border-red-500/20 bg-red-500/[0.07] text-red-200',
    soft: 'border-amber-500/20 bg-amber-500/[0.07] text-amber-200',
    clear: 'border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-200',
  }[tone];

  return (
    <div className={cn('rounded-lg border p-4 shadow-sm', toneClass)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-background/45">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      {detail && <p className="mt-3 truncate text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

function ConflictSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((item) => (
        <div key={item} className="rounded-lg border border-border/70 bg-card/55 p-4">
          <div className="flex items-start gap-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-3 w-full max-w-xl" />
              <Skeleton className="h-3 w-64" />
            </div>
            <Skeleton className="h-9 w-24 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ResolvePanel({ conflict, onResolve, onCancel, isResolving, t }) {
  const [reason, setReason] = useState('');
  const conflictId = getConflictId(conflict);
  const validationError = reason.length > 0 && reason.trim().length < MIN_REASON_LENGTH
    ? t('deploy.conflicts.reasonRequired', 'At least 10 characters required')
    : '';
  const canSubmit = reason.trim().length >= MIN_REASON_LENGTH && !isResolving;

  return (
    <div className="mt-4 rounded-lg border border-border/70 bg-background/55 p-3">
      <FormField
        label={t('deploy.conflicts.overrideReason', 'Resolution reason')}
        required
        error={validationError}
      >
        <Textarea
          className="min-h-[88px] rounded-lg bg-background/80 text-sm"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={t('deploy.conflicts.resolvePlaceholder', 'Why is the conflict being resolved?')}
        />
      </FormField>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isResolving}>
          {t('deploy.common.cancel', 'Cancel')}
        </Button>
        <Button
          type="button"
          size="sm"
          className="gap-2"
          disabled={!canSubmit || !conflictId}
          onClick={() => onResolve(conflictId, reason.trim())}
        >
          {isResolving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          {t('deploy.common.confirm', 'Confirm')}
        </Button>
      </div>
    </div>
  );
}

function ConflictCard({ conflict, onResolve, isResolving, t }) {
  const [showResolve, setShowResolve] = useState(false);
  const labels = getConflictLabels(conflict, t);
  const tone = SEVERITY_TONES[conflict.severity] || SEVERITY_TONES.SOFT;
  const SeverityIcon = tone.icon;
  const TypeIcon = labels.typeMeta?.icon || AlertTriangle;
  const conflictId = getConflictId(conflict);
  const assignmentId = getReferenceId(conflict.assignmentId);
  const relatedId = getReferenceId(conflict.conflictingWithId);

  return (
    <article className={cn('rounded-lg border p-4 shadow-sm transition-colors', tone.card)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-background/55">
              <span className={cn('absolute -right-1 -top-1 h-3 w-3 rounded-full ring-2 ring-background', tone.ring)} />
              <TypeIcon className={cn('h-5 w-5', labels.typeMeta?.color || tone.text)} />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={cn('gap-1.5 rounded-md', tone.chip)}>
                  <SeverityIcon className="h-3.5 w-3.5" />
                  {labels.severityLabel}
                </Badge>
                <Badge variant="secondary" className="rounded-md">
                  {labels.typeLabel}
                </Badge>
                {conflict.overridden && !conflict.resolved && (
                  <Badge variant="outline" className="gap-1.5 rounded-md border-amber-400/50 text-amber-600 dark:text-amber-400">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    {t('deploy.conflicts.overridden', 'Übersteuert')}
                  </Badge>
                )}
              </div>

              <p className="mt-3 text-sm font-medium leading-6 text-foreground">
                {conflict.description || t('deploy.conflicts.detected', 'Scheduling conflict detected')}
              </p>

              {conflict.overridden && !conflict.resolved && conflict.overrideReason && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {t('deploy.conflicts.overrideReasonLabel', 'Übersteuerung')}: {conflict.overrideReason}
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-background/45 px-2 py-1">
                  <Clock3 className="h-3.5 w-3.5" />
                  {t('deploy.conflicts.detectedAt', 'Detected')}: {formatDetectedAt(conflict.detectedAt || conflict.createdAt)}
                </span>
                {assignmentId && (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-background/45 px-2 py-1">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {t('deploy.common.assignment', 'Assignment')}: {assignmentId.slice(-8)}
                  </span>
                )}
                {relatedId && (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-background/45 px-2 py-1">
                    <ListFilter className="h-3.5 w-3.5" />
                    {t('deploy.conflicts.related', 'Related')}: {relatedId.slice(-8)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
          {assignmentId && (
            <Button asChild variant="outline" size="sm" className="gap-2">
              <Link href={`/scheduling?assignmentId=${assignmentId}`}>
                {t('deploy.conflicts.openCalendar', 'Open calendar')}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          )}
          {!showResolve && (
            <Button type="button" size="sm" className="gap-2" onClick={() => setShowResolve(true)} disabled={!conflictId}>
              <ShieldCheck className="h-4 w-4" />
              {t('deploy.common.resolve', 'Resolve')}
            </Button>
          )}
        </div>
      </div>

      {showResolve && (
        <ResolvePanel
          conflict={conflict}
          onResolve={onResolve}
          onCancel={() => setShowResolve(false)}
          isResolving={isResolving}
          t={t}
        />
      )}
    </article>
  );
}

export function ConflictList() {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 200);
  const [severityFilter, setSeverityFilter] = useState(FILTER_ALL);
  const [typeFilter, setTypeFilter] = useState(FILTER_ALL);
  const {
    data: conflictsData,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
    dataUpdatedAt,
  } = useConflictList();
  const { resolve } = useConflictMutations();

  const conflicts = useMemo(() => normalizeConflicts(conflictsData), [conflictsData]);
  const stats = useMemo(() => {
    const hard = conflicts.filter((conflict) => conflict.severity === 'HARD').length;
    const soft = conflicts.filter((conflict) => conflict.severity === 'SOFT').length;
    const types = new Set(conflicts.map((conflict) => conflict.conflictType).filter(Boolean));
    return { total: conflicts.length, hard, soft, typeCount: types.size };
  }, [conflicts]);

  const typeOptions = useMemo(() => {
    const seen = new Set([...Object.keys(CONFLICT_TYPE_META), ...conflicts.map((conflict) => conflict.conflictType).filter(Boolean)]);
    return Array.from(seen).map((type) => ({
      value: type,
      label: translateMetaLabel(t, CONFLICT_TYPE_META[type], type),
    }));
  }, [conflicts, t]);

  const filteredConflicts = useMemo(() => {
    const needle = debouncedSearch.trim().toLowerCase();
    return conflicts.filter((conflict) => {
      if (severityFilter !== FILTER_ALL && conflict.severity !== severityFilter) return false;
      if (typeFilter !== FILTER_ALL && conflict.conflictType !== typeFilter) return false;
      if (!needle) return true;
      return getSearchText(conflict, getConflictLabels(conflict, t)).includes(needle);
    });
  }, [conflicts, debouncedSearch, severityFilter, t, typeFilter]);

  const lastUpdated = dataUpdatedAt ? format(new Date(dataUpdatedAt), 'HH:mm:ss') : '-';
  const hasFilters = search.trim() || severityFilter !== FILTER_ALL || typeFilter !== FILTER_ALL;
  const resolvingId = resolve.variables?.id;

  const clearFilters = () => {
    setSearch('');
    setSeverityFilter(FILTER_ALL);
    setTypeFilter(FILTER_ALL);
  };

  const handleResolve = (id, reason) => {
    resolve.mutate({ id, data: { overrideReason: reason } });
  };

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <section className="overflow-hidden rounded-lg border border-border/70 bg-card/70 shadow-sm">
        <div className="border-b border-border/70 bg-background/30 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-md border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                <ShieldCheck className="h-3.5 w-3.5" />
                {stats.total === 0
                  ? t('deploy.conflicts.noActive', 'No active conflicts')
                  : t('deploy.conflicts.activeQueue', 'Active conflict queue')}
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight">
                {t('deploy.conflicts.title', 'Conflicts')}
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                {t(
                  'deploy.conflicts.workspaceDescription',
                  'Review scheduling risks, triage hard blockers, and resolve soft planning conflicts with an audit-ready reason.',
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex h-9 items-center gap-2 rounded-md border border-border/70 bg-background/50 px-3 text-xs text-muted-foreground">
                <span className={cn('h-2 w-2 rounded-full', isFetching ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400')} />
                {isFetching ? t('common.refreshing', 'Refreshing...') : `${t('deploy.common.updated', 'Updated')} ${lastUpdated}`}
              </div>
              <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
                {t('common.refresh', 'Refresh')}
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-3 p-5 md:grid-cols-4">
          <MetricCard icon={ShieldCheck} label={t('deploy.conflicts.active', 'Active')} value={stats.total} detail={t('deploy.conflicts.requiresReview', 'Requires dispatch review')} tone={stats.total === 0 ? 'clear' : 'default'} />
          <MetricCard icon={AlertCircle} label={t('deploy.conflictSeverity.hard', 'Hard')} value={stats.hard} detail={t('deploy.conflicts.blocksSchedule', 'Cannot be overridden')} tone="hard" />
          <MetricCard icon={AlertTriangle} label={t('deploy.conflictSeverity.soft', 'Soft')} value={stats.soft} detail={t('deploy.conflicts.canResolve', 'Can be resolved with reason')} tone="soft" />
          <MetricCard icon={Filter} label={t('deploy.conflicts.types', 'Types')} value={stats.typeCount} detail={t('deploy.conflicts.detectedCategories', 'Detected categories')} />
        </div>
      </section>

      <section className="rounded-lg border border-border/70 bg-card/70 p-3 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_220px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-10 rounded-lg bg-background/70 pl-9"
              placeholder={t('deploy.conflicts.searchPlaceholder', 'Search by description, type, severity, or assignment...')}
            />
          </div>

          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="h-10 rounded-lg bg-background/70">
              <SelectValue placeholder={t('deploy.conflicts.severity', 'Severity')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTER_ALL}>{t('common.all', 'All')}</SelectItem>
              <SelectItem value="HARD">{t('deploy.conflictSeverity.hard', 'Hard')}</SelectItem>
              <SelectItem value="SOFT">{t('deploy.conflictSeverity.soft', 'Soft')}</SelectItem>
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-10 rounded-lg bg-background/70">
              <SelectValue placeholder={t('deploy.conflicts.type', 'Type')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTER_ALL}>{t('common.all', 'All')}</SelectItem>
              {typeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button type="button" variant="ghost" className="h-10 gap-2 rounded-lg" onClick={clearFilters} disabled={!hasFilters}>
            <X className="h-4 w-4" />
            {t('common.clear', 'Clear')}
          </Button>
        </div>
      </section>

      {isLoading ? (
        <ConflictSkeleton />
      ) : isError ? (
        <section className="rounded-lg border border-destructive/30 bg-destructive/10 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 text-destructive" />
              <div>
                <h2 className="font-semibold">{t('deploy.conflicts.loadFailed', 'Could not load conflicts')}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{error?.message || t('common.tryAgain', 'Please try again.')}</p>
              </div>
            </div>
            <Button type="button" variant="outline" className="gap-2" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
              {t('common.retry', 'Retry')}
            </Button>
          </div>
        </section>
      ) : filteredConflicts.length === 0 ? (
        <section className="rounded-lg border border-border/70 bg-card/70">
          <DeployEmptyState
            icon={hasFilters ? Search : CheckCircle2}
            title={hasFilters ? t('deploy.conflicts.noMatches', 'No matching conflicts') : t('deploy.empty.conflictsTitle', 'All clear')}
            description={hasFilters ? t('deploy.conflicts.noMatchesDesc', 'Adjust filters or clear search to see other active conflicts.') : t('deploy.empty.conflictsDesc', 'There are no active scheduling conflicts right now.')}
            actionLabel={hasFilters ? t('common.clear', 'Clear') : undefined}
            onAction={hasFilters ? clearFilters : undefined}
          />
        </section>
      ) : (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3 px-1">
            <p className="text-sm text-muted-foreground">
              {t('deploy.conflicts.showing', 'Showing')} <span className="font-medium text-foreground">{filteredConflicts.length}</span> / {conflicts.length}
            </p>
            <Badge variant="outline" className="gap-1.5 rounded-md">
              <ListFilter className="h-3.5 w-3.5" />
              {severityFilter === FILTER_ALL ? t('common.all', 'All') : severityFilter}
            </Badge>
          </div>

          {filteredConflicts.map((conflict) => (
            <ConflictCard
              key={getConflictId(conflict)}
              conflict={conflict}
              onResolve={handleResolve}
              isResolving={resolve.isPending && resolvingId === getConflictId(conflict)}
              t={t}
            />
          ))}
        </section>
      )}
    </div>
  );
}
