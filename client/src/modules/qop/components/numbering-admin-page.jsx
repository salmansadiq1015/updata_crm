'use client';

import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Copy,
  Hash,
  LockKeyhole,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  ToggleRight,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Switch } from '@/components/ui/switch';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { showError, showSuccess } from '@/lib/toast';
import {
  NUMBERING_ACCENTS,
  NUMBERING_LIMITS,
  NUMBERING_TYPES,
  YEAR_FORMAT_OPTIONS,
} from '@/modules/qop/data/numbering-config';
import { useNumberingSequences } from '@/modules/qop/hooks/use-numbering-sequences';
import {
  buildSequencePreview,
  getNumberingSummary,
  getNumberingTypeConfig,
  getSequenceCapacity,
  getSequencePreviewParts,
  getSequenceUsagePercent,
  isSequenceFormDirty,
  normalizeSequenceForm,
  sanitizeSequenceForm,
  validateSequenceForm,
} from '@/modules/qop/utils/numbering-formatters';

function formatNumber(value, locale) {
  return new Intl.NumberFormat(locale || 'en').format(Number(value) || 0);
}

function getLocaleCode(locale) {
  if (locale === 'de') return 'de-CH';
  if (locale === 'fr') return 'fr-CH';
  if (locale === 'it') return 'it-CH';
  return 'en-US';
}

function getFieldErrorMessage(field, code, t) {
  if (!code) return '';

  const messages = {
    prefix: {
      required: t('numbering.validation.prefixRequired', 'Prefix is required.'),
      maxLength: t('numbering.validation.prefixMax', 'Prefix can use up to 10 characters.'),
    },
    separator: {
      maxLength: t('numbering.validation.separatorMax', 'Separator can use up to 3 characters.'),
    },
    paddingLength: {
      integer: t('numbering.validation.paddingInteger', 'Padding must be a whole number.'),
      range: t('numbering.validation.paddingRange', 'Padding must be between 1 and 8.'),
    },
    yearFormat: {
      invalid: t('numbering.validation.yearFormat', 'Choose a valid year format.'),
    },
  };

  return messages[field]?.[code] || t('numbering.validation.invalid', 'Check this field.');
}

function PageShell({ children }) {
  return (
    <section className="relative -m-4 min-h-[calc(100dvh-4rem)] overflow-hidden bg-background text-foreground sm:-m-6">
      <div className="relative z-10 mx-auto flex max-w-[1540px] flex-col gap-5 p-4 sm:p-6 xl:p-8">
        {children}
      </div>
    </section>
  );
}

function GlassSurface({ children, className }) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg border border-border bg-card shadow-sm',
        className,
      )}
    >
      <div className="relative z-10">{children}</div>
    </div>
  );
}

function MetricTile({ icon: Icon, label, value, description, tone = 'cyan' }) {
  const accent = NUMBERING_ACCENTS[tone] || NUMBERING_ACCENTS.cyan;

  return (
    <GlassSurface className="min-h-28">
      <div className="flex h-full items-center justify-between gap-4 p-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-foreground tabular-nums">{value}</p>
          {description && <p className="mt-1 truncate text-xs text-muted-foreground">{description}</p>}
        </div>
        <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border', accent.icon)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </GlassSurface>
  );
}

function NumberingHero({ summary, t, localeCode }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_28rem]">
      <div className="min-w-0 space-y-4">
        <div className="inline-flex min-h-8 items-center gap-2 rounded-lg border border-violet-300/20 bg-violet-300/10 px-3 text-xs font-semibold uppercase tracking-normal text-violet-700 dark:text-violet-200 shadow-[0_0_32px_rgba(139,92,246,0.12)]">
          <Sparkles className="h-3.5 w-3.5" />
          {t('numbering.badge', 'Premium document control')}
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-normal text-foreground sm:text-4xl">
            {t('numbering.title', 'Document Numbering')}
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
            {t(
              'numbering.subtitle',
              'Configure compliant, readable number sequences for quotations, orders, and invoices with live previews and safe validation.',
            )}
          </p>
        </div>
      </div>

      <GlassSurface>
        <div className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-cyan-300/20 bg-cyan-300/10 text-cyan-700 dark:text-cyan-200 shadow-[0_0_32px_rgba(34,211,238,0.14)]">
              <LockKeyhole className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {t('numbering.controlPanel', 'Controlled issuance')}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('numbering.controlPanelDesc', 'Inactive sequences remain saved but are not used for new document generation.')}
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md border border-border bg-card p-3">
              <p className="text-xl font-semibold text-foreground tabular-nums">{formatNumber(summary.total, localeCode)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('numbering.metric.types', 'Types')}</p>
            </div>
            <div className="rounded-md border border-emerald-300/15 bg-emerald-300/10 p-3">
              <p className="text-xl font-semibold text-emerald-700 dark:text-emerald-200 tabular-nums">{formatNumber(summary.activeCount, localeCode)}</p>
              <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-200/70">{t('numbering.metric.active', 'Active')}</p>
            </div>
            <div className="rounded-md border border-violet-300/15 bg-violet-300/10 p-3">
              <p className="text-xl font-semibold text-violet-700 dark:text-violet-200 tabular-nums">{formatNumber(summary.annualResetCount, localeCode)}</p>
              <p className="mt-1 text-xs text-violet-700 dark:text-violet-200/70">{t('numbering.metric.reset', 'Reset')}</p>
            </div>
          </div>
        </div>
      </GlassSurface>
    </div>
  );
}

function FormField({ label, error, helper, children }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label className="text-xs font-semibold text-muted-foreground">{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-rose-200" role="alert">{error}</p>
      ) : helper ? (
        <p className="text-xs text-muted-foreground">{helper}</p>
      ) : null}
    </div>
  );
}

function PreviewSegment({ label, value }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-card px-3 py-2">
      <p className="text-[11px] font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-mono text-sm text-foreground">{value || '-'}</p>
    </div>
  );
}

function SequenceCard({ sequence, t, localeCode, onSave, isSaving }) {
  const [form, setForm] = useState(() => normalizeSequenceForm(sequence));
  const typeConfig = getNumberingTypeConfig(sequence.documentType);
  const accent = NUMBERING_ACCENTS[typeConfig.accent] || NUMBERING_ACCENTS.violet;
  const Icon = typeConfig.icon || Hash;
  const errors = useMemo(() => validateSequenceForm(form), [form]);
  const hasErrors = Object.keys(errors).length > 0;
  const isDirty = isSequenceFormDirty(sequence, form);
  const preview = useMemo(
    () => buildSequencePreview(form, sequence.currentValue),
    [form, sequence.currentValue],
  );
  const savedPreview = useMemo(
    () => buildSequencePreview(normalizeSequenceForm(sequence), sequence.currentValue),
    [sequence],
  );
  const previewParts = useMemo(
    () => getSequencePreviewParts(form, sequence.currentValue),
    [form, sequence.currentValue],
  );
  const usagePercent = getSequenceUsagePercent(sequence.currentValue, form.paddingLength);
  const capacity = getSequenceCapacity(form.paddingLength);

  const setField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSave = () => {
    if (hasErrors || !isDirty || isSaving) return;
    onSave(sequence._id, sanitizeSequenceForm(form));
  };

  const handleRevert = () => {
    setForm(normalizeSequenceForm(sequence));
  };

  const handleCopy = async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      showError(t('numbering.copyUnavailable', 'Clipboard access is not available.'));
      return;
    }

    try {
      await navigator.clipboard.writeText(preview);
      showSuccess(t('numbering.copySuccess', 'Preview copied.'));
    } catch (error) {
      showError(error);
    }
  };

  return (
    <GlassSurface className={cn('group min-w-0 transition-all duration-300 hover:-translate-y-0.5', accent.glow)}>
      <div className={cn('absolute inset-x-0 top-0 h-px bg-gradient-to-r', accent.line)} />

      <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_20rem] xl:p-5">
        <div className="min-w-0 space-y-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 gap-3">
              <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border', accent.icon)}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-foreground">
                    {t(typeConfig.labelKey, typeConfig.fallback)}
                  </h2>
                  <Badge
                    className={cn(
                      'rounded-md border px-2 py-1',
                      form.isActive
                        ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-700 dark:text-emerald-200'
                        : 'border-slate-500/20 bg-slate-500/10 text-muted-foreground',
                    )}
                  >
                    {form.isActive ? t('numbering.active', 'Active') : t('numbering.inactive', 'Inactive')}
                  </Badge>
                  {isDirty && (
                    <Badge className="rounded-md border border-amber-300/20 bg-amber-300/10 px-2 py-1 text-amber-700 dark:text-amber-200">
                      {t('numbering.unsaved', 'Unsaved')}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">
                  {t(typeConfig.descriptionKey, typeConfig.description)}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
              <Hash className="h-4 w-4 text-muted-foreground" />
              <span className="font-mono text-sm font-semibold text-foreground tabular-nums">
                {formatNumber(sequence.currentValue, localeCode)}
              </span>
              <span className="text-xs text-muted-foreground">{t('numbering.issued', 'issued')}</span>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_7rem] xl:grid-cols-[minmax(0,1fr)_8rem]">
            <FormField
              label={t('numbering.prefix', 'Prefix')}
              error={getFieldErrorMessage('prefix', errors.prefix, t)}
              helper={t('numbering.prefixHelp', 'Use a short document family code.')}
            >
              <Input
                value={form.prefix}
                maxLength={NUMBERING_LIMITS.prefixMaxLength}
                aria-invalid={Boolean(errors.prefix)}
                onChange={(event) => setField('prefix', event.target.value.toUpperCase())}
                className="h-11 border-border bg-card text-foreground shadow-none placeholder:text-muted-foreground hover:bg-accent focus-visible:bg-card"
              />
            </FormField>

            <FormField
              label={t('numbering.separator', 'Separator')}
              error={getFieldErrorMessage('separator', errors.separator, t)}
              helper={t('numbering.separatorHelp', '0-3 chars')}
            >
              <Input
                value={form.separator}
                maxLength={NUMBERING_LIMITS.separatorMaxLength}
                aria-invalid={Boolean(errors.separator)}
                onChange={(event) => setField('separator', event.target.value)}
                className="h-11 border-border bg-card text-center font-mono text-foreground shadow-none hover:bg-accent focus-visible:bg-card"
              />
            </FormField>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <FormField
              label={t('numbering.yearFormat', 'Year format')}
              error={getFieldErrorMessage('yearFormat', errors.yearFormat, t)}
              helper={t('numbering.yearHelp', 'Controls whether the year appears in new numbers.')}
            >
              <Select value={form.yearFormat} onValueChange={(value) => setField('yearFormat', value)}>
                <SelectTrigger
                  aria-invalid={Boolean(errors.yearFormat)}
                  className="h-11 border-border bg-card text-foreground shadow-none hover:bg-accent"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YEAR_FORMAT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(option.labelKey, option.fallback)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField
              label={t('numbering.padding', 'Sequence padding')}
              error={getFieldErrorMessage('paddingLength', errors.paddingLength, t)}
              helper={t('numbering.paddingHelp', 'Defines the minimum number width.')}
            >
              <Input
                type="number"
                min={NUMBERING_LIMITS.paddingMin}
                max={NUMBERING_LIMITS.paddingMax}
                value={form.paddingLength}
                aria-invalid={Boolean(errors.paddingLength)}
                onChange={(event) => {
                  const value = event.target.value;
                  setField('paddingLength', value === '' ? '' : Number(value));
                }}
                className="h-11 border-border bg-card text-foreground shadow-none hover:bg-accent focus-visible:bg-card"
              />
            </FormField>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex min-h-16 items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3">
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">{t('numbering.annualReset', 'Annual reset')}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {t('numbering.annualResetDesc', 'Start the sequence from zero in a new year.')}
                </span>
              </span>
              <Switch
                aria-label={t('numbering.annualReset', 'Annual reset')}
                checked={form.resetsAnnually}
                onCheckedChange={(value) => setField('resetsAnnually', value)}
              />
            </div>

            <div className="flex min-h-16 items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3">
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">{t('numbering.productionEnabled', 'Production enabled')}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {t('numbering.productionEnabledDesc', 'Use this sequence for new generated documents.')}
                </span>
              </span>
              <Switch
                aria-label={t('numbering.productionEnabled', 'Production enabled')}
                checked={form.isActive}
                onCheckedChange={(value) => setField('isActive', value)}
              />
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col justify-between gap-4 rounded-lg border border-border bg-background/50 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">{t('numbering.livePreview', 'Live preview')}</p>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={t('numbering.copyPreview', 'Copy preview')}
                onClick={handleCopy}
                className="border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>

            <div className="rounded-lg border border-border bg-muted/50 p-4 shadow-sm">
              <p className="break-all font-mono text-xl font-semibold text-foreground tabular-nums">{preview}</p>
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{t('numbering.savedPreview', 'Saved')}</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="truncate font-mono text-muted-foreground">{savedPreview}</span>
              </div>
            </div>

            <div className="grid gap-2">
              {previewParts.map((part) => (
                <PreviewSegment key={part.id} label={t(`numbering.part.${part.id}`, part.label)} value={part.value} />
              ))}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>{t('numbering.capacity', 'Capacity usage')}</span>
                <span className="font-mono tabular-nums">
                  {formatNumber(sequence.currentValue, localeCode)} / {formatNumber(capacity, localeCode)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-300 via-cyan-300 to-emerald-300 transition-[width] duration-300"
                  style={{ width: `${usagePercent}%` }}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={handleRevert}
              disabled={!isDirty || isSaving}
              className="h-11 border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <RotateCcw className="h-4 w-4" />
              {t('numbering.revert', 'Revert')}
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={!isDirty || hasErrors || isSaving}
              className="h-11 bg-violet-400 px-4 text-slate-950 shadow-[0_0_28px_rgba(167,139,250,0.2)] hover:bg-violet-300"
            >
              {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isSaving ? t('numbering.saving', 'Saving') : t('numbering.save', 'Save')}
            </Button>
          </div>
        </div>
      </div>
    </GlassSurface>
  );
}

function NumberingSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, index) => (
        <GlassSurface key={index}>
          <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="space-y-4">
              <div className="flex gap-3">
                <Skeleton className="h-12 w-12 rounded-lg bg-muted" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-44 bg-muted" />
                  <Skeleton className="h-4 w-72 max-w-full bg-muted" />
                </div>
              </div>
              <Skeleton className="h-24 bg-muted" />
              <Skeleton className="h-24 bg-muted" />
            </div>
            <Skeleton className="h-72 rounded-lg bg-muted" />
          </div>
        </GlassSurface>
      ))}
    </div>
  );
}

function NumberingError({ error, onRetry, t }) {
  return (
    <GlassSurface>
      <div className="flex min-h-72 flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-rose-300/20 bg-rose-300/10 text-rose-700 dark:text-rose-200 shadow-[0_0_32px_rgba(251,113,133,0.12)]">
          <AlertCircle className="h-6 w-6" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">
            {t('numbering.errorTitle', 'Numbering settings could not be loaded')}
          </h2>
          <p className="max-w-xl text-sm text-muted-foreground">
            {error?.message || t('numbering.errorDesc', 'The server returned an unexpected response.')}
          </p>
        </div>
        <Button
          type="button"
          onClick={onRetry}
          className="h-11 bg-violet-400 text-slate-950 hover:bg-violet-300"
        >
          <RefreshCw className="h-4 w-4" />
          {t('common.retry', 'Retry')}
        </Button>
      </div>
    </GlassSurface>
  );
}

function NumberingEmpty({ t }) {
  return (
    <GlassSurface>
      <div className="flex min-h-72 flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground">
          <Hash className="h-6 w-6" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">
            {t('numbering.emptyTitle', 'No number sequences found')}
          </h2>
          <p className="max-w-xl text-sm text-muted-foreground">
            {t('numbering.emptyDesc', 'The backend normally creates the quotation, order, and invoice defaults automatically. Retry after the API is available.')}
          </p>
        </div>
      </div>
    </GlassSurface>
  );
}

export function NumberingAdminPage() {
  const { t, locale } = useLanguage();
  const localeCode = getLocaleCode(locale);
  const {
    sequences,
    isLoading,
    isError,
    error,
    refetch,
    updateSequence,
  } = useNumberingSequences(t);

  const orderedSequences = useMemo(() => {
    const knownTypes = new Set(NUMBERING_TYPES.map((type) => type.id));
    const byType = new Map(sequences.map((sequence) => [sequence.documentType, sequence]));
    const known = NUMBERING_TYPES.map((type) => byType.get(type.id)).filter(Boolean);
    const extras = sequences.filter((sequence) => !knownTypes.has(sequence.documentType));
    return [...known, ...extras];
  }, [sequences]);

  const summary = useMemo(() => getNumberingSummary(sequences), [sequences]);
  const savingId = updateSequence.variables?.id || null;

  const handleSave = (id, data) => {
    updateSequence.mutate({ id, data });
  };

  return (
    <PageShell>
      <NumberingHero summary={summary} t={t} localeCode={localeCode} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          icon={Hash}
          label={t('numbering.metric.totalIssued', 'Total issued')}
          value={formatNumber(summary.totalIssued, localeCode)}
          description={t('numbering.metric.totalIssuedDesc', 'Across all configured sequences')}
          tone="violet"
        />
        <MetricTile
          icon={CheckCircle2}
          label={t('numbering.metric.activeSequences', 'Active sequences')}
          value={`${formatNumber(summary.activeCount, localeCode)} / ${formatNumber(summary.total, localeCode)}`}
          description={t('numbering.metric.activeSequencesDesc', 'Used for new documents')}
          tone="emerald"
        />
        <MetricTile
          icon={CalendarClock}
          label={t('numbering.metric.annualReset', 'Annual reset')}
          value={formatNumber(summary.annualResetCount, localeCode)}
          description={t('numbering.metric.annualResetDesc', 'Sequences reset by year')}
          tone="cyan"
        />
        <MetricTile
          icon={ToggleRight}
          label={t('numbering.metric.inactive', 'Inactive')}
          value={formatNumber(summary.inactiveCount, localeCode)}
          description={t('numbering.metric.inactiveDesc', 'Stored but skipped by generation')}
          tone="violet"
        />
      </div>

      {isError ? (
        <NumberingError error={error} onRetry={() => refetch()} t={t} />
      ) : isLoading ? (
        <NumberingSkeleton />
      ) : orderedSequences.length ? (
        <div className="space-y-4">
          {orderedSequences.map((sequence) => (
            <SequenceCard
              key={`${sequence._id}-${sequence.updatedAt || ''}-${sequence.currentValue || 0}-${sequence.isActive ?? true}`}
              sequence={sequence}
              t={t}
              localeCode={localeCode}
              onSave={handleSave}
              isSaving={savingId === sequence._id && updateSequence.isPending}
            />
          ))}
        </div>
      ) : (
        <NumberingEmpty t={t} />
      )}
    </PageShell>
  );
}
