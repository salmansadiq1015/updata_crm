'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  BellRing,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FileText,
  Gauge,
  Layers,
  PauseCircle,
  PlayCircle,
  Plus,
  RadioTower,
  RefreshCw,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PageHeader } from '@/shared/components/page-header';
import { showError, showSuccess } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import {
  DEFAULT_SCHEDULE_FORM,
  DEFAULT_TEMPLATE_SAMPLE_JSON,
  DEFAULT_TEMPLATE_FORM,
  NOTIFICATION_ADMIN_CATEGORIES,
  NOTIFICATION_ADMIN_CHANNELS,
  NOTIFICATION_ADMIN_HISTORY_LIMIT,
  NOTIFICATION_ADMIN_LANGUAGES,
  NOTIFICATION_ADMIN_PERIODS,
  NOTIFICATION_ADMIN_PRIORITIES,
  NOTIFICATION_ADMIN_SCHEDULE_LIMIT,
  NOTIFICATION_ADMIN_SCHEDULE_STATUSES,
  NOTIFICATION_ADMIN_STATUSES,
  NOTIFICATION_ADMIN_STALE_REVIEW_CHANNELS,
  NOTIFICATION_ADMIN_STALE_REVIEW_MINUTES,
  buildNotificationAdminOverview,
  buildHistoryFilters,
  buildSchedulePayload,
  buildTemplatePayload,
  compactObject,
  deliveryRate,
  downloadCsvBlob,
  failureRate,
  formatDateTime,
  hasAnonymizeTarget,
  normalizeMetrics,
  parseJsonObject,
  templateToForm,
  toggleChannel,
  withDefaultScheduleTime,
} from '../utils/notification-admin-utils';
import {
  useNotificationAdminMutations,
  useNotificationHistory,
  useNotificationMetrics,
  useNotificationTemplates,
  useScheduledNotifications,
} from '../hooks/use-notification-admin';

const HISTORY_EMPTY = [];
const TEMPLATE_EMPTY = [];
const SCHEDULE_EMPTY = [];

const STATUS_META = {
  DELIVERED: { variant: 'success', Icon: CheckCircle2 },
  READ: { variant: 'success', Icon: CheckCircle2 },
  SENT: { variant: 'secondary', Icon: CheckCircle2 },
  PENDING: { variant: 'warning', Icon: BellRing },
  QUEUED: { variant: 'outline', Icon: CalendarClock },
  FAILED: { variant: 'destructive', Icon: AlertTriangle },
  BOUNCED: { variant: 'destructive', Icon: AlertTriangle },
  CANCELLED: { variant: 'outline', Icon: XCircle },
  ACTIVE: { variant: 'success', Icon: CheckCircle2 },
  PAUSED: { variant: 'warning', Icon: PauseCircle },
  COMPLETED: { variant: 'secondary', Icon: CheckCircle2 },
};

function formatCount(value, locale = 'en') {
  return new Intl.NumberFormat(locale).format(value || 0);
}

function optionLabel(t, namespace, value) {
  return t(`${namespace}.${value}`, value);
}

function StatusBadge({ status, t }) {
  const meta = STATUS_META[status] || STATUS_META.QUEUED;
  const Icon = meta.Icon;
  return (
    <Badge variant={meta.variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {status ? optionLabel(t, 'notifications.admin.status', status) : '-'}
    </Badge>
  );
}

function IconButton({ label, children, className, ...props }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button aria-label={label} title={label} className={className} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function PanelShell({ title, description, actions, children, className }) {
  return (
    <section className={cn('overflow-hidden rounded-xl border border-border/70 bg-card/95 shadow-sm', className)}>
      <div className="flex flex-col gap-3 border-b bg-muted/20 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-normal">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ icon: Icon = BellRing, title, body }) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center gap-2 p-8 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full border bg-muted/50">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </span>
      <p className="text-sm font-medium">{title}</p>
      {body && <p className="max-w-md text-sm text-muted-foreground">{body}</p>}
    </div>
  );
}

function ErrorState({ message, onRetry, t }) {
  return (
    <div className="m-5 rounded-lg border border-destructive/30 bg-destructive/5 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="truncate">{message || t('notifications.admin.errorLoad', 'Could not load notifications data.')}</span>
        </div>
        <Button size="sm" variant="outline" onClick={onRetry} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" />
          {t('common.retry', 'Retry')}
        </Button>
      </div>
    </div>
  );
}

function LoadingRows({ columns = 5, rows = 5 }) {
  return Array.from({ length: rows }).map((_, index) => (
    <TableRow key={index}>
      {Array.from({ length: columns }).map((__, colIndex) => (
        <TableCell key={colIndex}>
          <Skeleton className="h-5 w-full max-w-40" />
        </TableCell>
      ))}
    </TableRow>
  ));
}

function MetricTile({ label, value, tone = 'default', suffix, icon: Icon }) {
  const toneClass = {
    default: 'border-border bg-background',
    warning: 'border-warning/30 bg-warning/5',
    danger: 'border-destructive/30 bg-destructive/5',
    success: 'border-success/30 bg-success/5',
  }[tone];

  return (
    <div className={cn('min-h-24 rounded-lg border px-4 py-3', toneClass)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-normal">
        {value}
        {suffix && <span className="ml-1 text-sm text-muted-foreground">{suffix}</span>}
      </p>
    </div>
  );
}

function ChannelCheckboxes({ value, onChange, disabled, t }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {NOTIFICATION_ADMIN_CHANNELS.map((channel) => (
        <label
          key={channel}
          className={cn(
            'flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm transition-colors',
            value.includes(channel) ? 'border-primary/40 bg-primary/5 text-primary' : 'border-border bg-background',
            disabled && 'pointer-events-none opacity-60',
          )}
        >
          <Checkbox
            checked={value.includes(channel)}
            onCheckedChange={() => onChange(toggleChannel(value, channel))}
          />
          <span>{optionLabel(t, 'notifications.channel', channel)}</span>
        </label>
      ))}
    </div>
  );
}

function ChannelSelectItems({ t }) {
  return NOTIFICATION_ADMIN_CHANNELS.map((item) => (
    <SelectItem key={item} value={item}>{optionLabel(t, 'notifications.channel', item)}</SelectItem>
  ));
}

function StatusSelectItems({ t, statuses = NOTIFICATION_ADMIN_STATUSES }) {
  return statuses.map((item) => (
    <SelectItem key={item} value={item}>{optionLabel(t, 'notifications.admin.status', item)}</SelectItem>
  ));
}

function jsonValidationMessages(t, labelKey, fallback) {
  return {
    mustBeObject: t('notifications.admin.validation.jsonObject', '{label} must be a JSON object.', {
      label: t(labelKey, fallback),
    }),
    invalidJson: t('notifications.admin.validation.invalidJson', '{label} contains invalid JSON.', {
      label: t(labelKey, fallback),
    }),
  };
}

function templateValidationMessages(t) {
  return {
    typeRequired: t('notifications.admin.validation.typeRequired', 'Notification type is required.'),
    bodyRequired: t('notifications.admin.validation.templateBodyRequired', 'Body template is required.'),
    variablesLabel: t('notifications.admin.template.variablesJson', 'Variables JSON'),
    variablesJson: jsonValidationMessages(t, 'notifications.admin.template.variablesJson', 'Variables JSON'),
  };
}

function scheduleValidationMessages(t) {
  return {
    typeRequired: t('notifications.admin.validation.typeRequired', 'Notification type is required.'),
    channelRequired: t('notifications.admin.validation.channelRequired', 'Select at least one channel.'),
    bodyRequired: t('notifications.admin.validation.messageBodyRequired', 'Message body is required.'),
    scheduledAtRequired: t('notifications.admin.validation.scheduledAtRequired', 'Scheduled time is required.'),
    cronRequired: t('notifications.admin.validation.cronRequired', 'Cron expression is required.'),
    payloadLabel: t('notifications.admin.schedule.extraPayloadJson', 'Extra payload JSON'),
    payloadJson: jsonValidationMessages(t, 'notifications.admin.schedule.extraPayloadJson', 'Extra payload JSON'),
  };
}

function OperationsOverview({ overview, locale, t, isFetching }) {
  const failedDeliveries = overview.failed + overview.bounced;
  const deliveryTone = failedDeliveries > 0 ? 'warning' : 'success';
  const reviewTone = overview.reviewRequired > 0 ? 'warning' : 'default';

  return (
    <section className="rounded-xl border border-border/70 bg-card/95 p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={failedDeliveries > 0 ? 'warning' : 'success'} className="gap-1">
              <RadioTower className="h-3 w-3" />
              {failedDeliveries > 0
                ? t('notifications.admin.summary.attention', 'Needs attention')
                : t('notifications.admin.summary.operational', 'Operational')}
            </Badge>
            {isFetching && (
              <Badge variant="outline" className="gap-1">
                <RefreshCw className="h-3 w-3 animate-spin" />
                {t('notifications.admin.refreshing', 'Refreshing...')}
              </Badge>
            )}
          </div>
          <h2 className="mt-3 text-xl font-semibold tracking-normal">{t('notifications.admin.summary.title', 'Delivery command center')}</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {t('notifications.admin.summary.description', 'Monitor delivery health, audit privacy actions, template coverage, and scheduled campaigns from one operations surface.')}
          </p>
        </div>

        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:min-w-[620px] xl:grid-cols-4">
          <MetricTile
            label={t('notifications.admin.summary.deliveryRate', 'Delivery rate')}
            value={overview.deliveryRate}
            suffix="%"
            tone={deliveryTone}
            icon={Gauge}
          />
          <MetricTile
            label={t('notifications.admin.summary.sent', 'Sent')}
            value={formatCount(overview.sent, locale)}
            icon={BarChart3}
          />
          <MetricTile
            label={t('notifications.admin.summary.reviewRequired', 'Review required')}
            value={formatCount(overview.reviewRequired, locale)}
            tone={reviewTone}
            icon={ShieldAlert}
          />
          <MetricTile
            label={t('notifications.admin.summary.activeSchedules', 'Active schedules')}
            value={formatCount(overview.activeScheduleCount, locale)}
            icon={Clock3}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="flex items-center gap-3 rounded-lg bg-muted/35 px-3 py-2">
          <ShieldCheck className="h-4 w-4 text-success" />
          <span className="text-sm text-muted-foreground">
            {t('notifications.admin.summary.deliveredMeta', '{count} delivered', { count: formatCount(overview.delivered, locale) })}
          </span>
        </div>
        <div className="flex items-center gap-3 rounded-lg bg-muted/35 px-3 py-2">
          <AlertTriangle className={cn('h-4 w-4', failedDeliveries > 0 ? 'text-warning' : 'text-muted-foreground')} />
          <span className="text-sm text-muted-foreground">
            {t('notifications.admin.summary.failuresMeta', '{count} failed or bounced', { count: formatCount(failedDeliveries, locale) })}
          </span>
        </div>
        <div className="flex items-center gap-3 rounded-lg bg-muted/35 px-3 py-2">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {t('notifications.admin.summary.templatesMeta', '{active} active templates', { active: formatCount(overview.activeTemplateCount, locale) })}
          </span>
        </div>
        <div className="flex items-center gap-3 rounded-lg bg-muted/35 px-3 py-2">
          <PauseCircle className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {t('notifications.admin.summary.pausedMeta', '{count} paused schedules', { count: formatCount(overview.pausedScheduleCount, locale) })}
          </span>
        </div>
      </div>
    </section>
  );
}

function MetricsPanel({ metricsQuery, period, setPeriod, channel, setChannel, mutations, locale, t }) {
  const normalized = useMemo(() => normalizeMetrics(metricsQuery.data), [metricsQuery.data]);
  const totals = normalized.totals;

  const flagStale = async () => {
    try {
      const result = await mutations.flagStaleDeliveries.mutateAsync({
        olderThanMinutes: NOTIFICATION_ADMIN_STALE_REVIEW_MINUTES,
        channels: NOTIFICATION_ADMIN_STALE_REVIEW_CHANNELS,
      });
      showSuccess(t('notifications.admin.toast.staleFlagged', 'Flagged {count} delivery records for review.', {
        count: formatCount(result?.modifiedCount || 0, locale),
      }));
    } catch (error) {
      showError(error);
    }
  };

  return (
    <PanelShell
      title={t('notifications.admin.metrics.title', 'Delivery metrics')}
      description={t('notifications.admin.metrics.description', 'Channel health, latency, failure rates, and callback-review volume.')}
      actions={(
        <>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-28" aria-label={t('notifications.admin.metrics.period', 'Metrics period')}><SelectValue /></SelectTrigger>
            <SelectContent>
              {NOTIFICATION_ADMIN_PERIODS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger className="w-40" aria-label={t('notifications.admin.filters.channel', 'Channel filter')}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('notifications.admin.filters.allChannels', 'All channels')}</SelectItem>
              <ChannelSelectItems t={t} />
            </SelectContent>
          </Select>
          <IconButton label={t('notifications.admin.actions.refreshMetrics', 'Refresh metrics')} variant="outline" size="icon" onClick={() => metricsQuery.refetch()} disabled={metricsQuery.isFetching}>
            <RefreshCw className={cn('h-4 w-4', metricsQuery.isFetching && 'animate-spin')} />
          </IconButton>
          <Button variant="outline" className="gap-2" onClick={flagStale} disabled={mutations.flagStaleDeliveries.isPending}>
            <ShieldAlert className="h-4 w-4" />
            {t('notifications.admin.metrics.reviewStale', 'Review stale')}
          </Button>
        </>
      )}
    >
      {metricsQuery.isLoading ? (
        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-lg" />)}
        </div>
      ) : metricsQuery.isError ? (
        <ErrorState message={metricsQuery.error?.message} onRetry={() => metricsQuery.refetch()} t={t} />
      ) : (
        <div className="space-y-5 p-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricTile label={t('notifications.admin.metrics.sent', 'Sent')} value={formatCount(totals.sent, locale)} icon={BarChart3} />
            <MetricTile label={t('notifications.admin.metrics.delivered', 'Delivered')} value={formatCount(totals.delivered, locale)} tone="success" icon={ShieldCheck} />
            <MetricTile label={t('notifications.admin.metrics.failed', 'Failed')} value={formatCount(totals.failed, locale)} tone={totals.failed ? 'danger' : 'default'} icon={AlertTriangle} />
            <MetricTile label={t('notifications.admin.metrics.bounced', 'Bounced')} value={formatCount(totals.bounced, locale)} tone={totals.bounced ? 'warning' : 'default'} icon={XCircle} />
            <MetricTile label={t('notifications.admin.metrics.needsReview', 'Needs review')} value={formatCount(totals.reviewRequired, locale)} tone={totals.reviewRequired ? 'warning' : 'default'} icon={ShieldAlert} />
          </div>

          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow>
                <TableHead>{t('notifications.admin.table.channel', 'Channel')}</TableHead>
                <TableHead>{t('notifications.admin.metrics.deliveryRate', 'Delivery rate')}</TableHead>
                <TableHead>{t('notifications.admin.metrics.failureRate', 'Failure rate')}</TableHead>
                <TableHead>{t('notifications.admin.metrics.averageLatency', 'Average latency')}</TableHead>
                <TableHead>{t('notifications.admin.metrics.review', 'Review')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {normalized.channels.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}>
                    <EmptyState title={t('notifications.admin.metrics.emptyTitle', 'No delivery metrics yet')} body={t('notifications.admin.metrics.emptyBody', 'Metrics appear as channel deliveries are processed.')} />
                  </TableCell>
                </TableRow>
              ) : normalized.channels.map((item) => (
                <TableRow key={item.channel}>
                  <TableCell className="font-medium">{optionLabel(t, 'notifications.channel', item.channel)}</TableCell>
                  <TableCell>{deliveryRate(item)}%</TableCell>
                  <TableCell>{failureRate(item)}%</TableCell>
                  <TableCell>{item.avgLatencyMs == null ? '-' : `${Math.round(item.avgLatencyMs)} ms`}</TableCell>
                  <TableCell>{formatCount(item.reviewRequired, locale)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </PanelShell>
  );
}

function HistoryPanel({ historyQuery, filters, setters, locale, mutations, t }) {
  const [cursorStack, setCursorStack] = setters.cursor;
  const [selected, setSelected] = useState(null);
  const [anonymizeForm, setAnonymizeForm] = useState({ recipientId: '', email: '', phone: '' });
  const [confirmAnonymizeOpen, setConfirmAnonymizeOpen] = useState(false);
  const rows = historyQuery.data?.items ?? HISTORY_EMPTY;
  const pagination = historyQuery.data?.pagination ?? {};
  const canAnonymize = hasAnonymizeTarget(anonymizeForm);

  const exportCsv = async () => {
    try {
      const blob = await mutations.exportHistory.mutateAsync(filters);
      downloadCsvBlob(blob, `notification-history-${new Date().toISOString().slice(0, 10)}.csv`);
      showSuccess(t('notifications.admin.toast.historyExported', 'Notification history export started.'));
    } catch (error) {
      showError(error);
    }
  };

  const anonymize = async () => {
    const payload = compactObject(anonymizeForm);
    if (Object.keys(payload).length === 0) {
      showError(t('notifications.admin.toast.anonymizeTargetRequired', 'Provide a recipient ID, email, or phone number.'));
      return;
    }

    try {
      const result = await mutations.anonymizeHistory.mutateAsync(payload);
      showSuccess(t('notifications.admin.toast.anonymized', 'Anonymized {count} history records.', {
        count: formatCount(result?.modifiedCount || 0, locale),
      }));
      setAnonymizeForm({ recipientId: '', email: '', phone: '' });
      setConfirmAnonymizeOpen(false);
    } catch (error) {
      showError(error);
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <PanelShell
        title={t('notifications.admin.history.title', 'Notification history')}
        description={t('notifications.admin.history.description', 'Searchable delivery audit trail with masked recipients and timeline details.')}
        actions={(
          <>
            <Button variant="outline" className="gap-2" onClick={exportCsv} disabled={mutations.exportHistory.isPending}>
              <Download className="h-4 w-4" />
              {t('notifications.admin.history.exportCsv', 'Export CSV')}
            </Button>
            <IconButton label={t('notifications.admin.actions.refreshHistory', 'Refresh history')} variant="outline" size="icon" onClick={() => historyQuery.refetch()} disabled={historyQuery.isFetching}>
              <RefreshCw className={cn('h-4 w-4', historyQuery.isFetching && 'animate-spin')} />
            </IconButton>
          </>
        )}
      >
        <div className="grid gap-3 border-b p-5 lg:grid-cols-[minmax(220px,1fr)_160px_160px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={setters.search[0]}
              onChange={(event) => {
                setters.search[1](event.target.value);
                setCursorStack([]);
              }}
              placeholder={t('notifications.admin.history.searchPlaceholder', 'Search recipient, type, source, or subject')}
              className="pl-9"
            />
          </div>
          <Select value={setters.channel[0]} onValueChange={(value) => { setters.channel[1](value); setCursorStack([]); }}>
            <SelectTrigger aria-label={t('notifications.admin.filters.channel', 'Channel filter')}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('notifications.admin.filters.allChannels', 'All channels')}</SelectItem>
              <ChannelSelectItems t={t} />
            </SelectContent>
          </Select>
          <Select value={setters.status[0]} onValueChange={(value) => { setters.status[1](value); setCursorStack([]); }}>
            <SelectTrigger aria-label={t('notifications.admin.filters.status', 'Status filter')}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('notifications.admin.filters.allStatuses', 'All statuses')}</SelectItem>
              <StatusSelectItems t={t} />
            </SelectContent>
          </Select>
        </div>

        {historyQuery.isError ? (
          <ErrorState message={historyQuery.error?.message} onRetry={() => historyQuery.refetch()} t={t} />
        ) : (
          <Table className="min-w-[920px]">
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead>{t('notifications.admin.table.created', 'Created')}</TableHead>
                <TableHead>{t('notifications.admin.table.recipient', 'Recipient')}</TableHead>
                <TableHead>{t('notifications.admin.table.type', 'Type')}</TableHead>
                <TableHead>{t('notifications.admin.table.channel', 'Channel')}</TableHead>
                <TableHead>{t('notifications.admin.table.status', 'Status')}</TableHead>
                <TableHead>{t('notifications.admin.table.subject', 'Subject')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historyQuery.isLoading ? (
                <LoadingRows columns={6} rows={7} />
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <EmptyState title={t('notifications.admin.history.emptyTitle', 'No matching history')} body={t('notifications.admin.history.emptyBody', 'Try a different search, channel, or delivery status.')} />
                  </TableCell>
                </TableRow>
              ) : rows.map((row) => (
                <TableRow
                  key={row.deliveryId}
                  tabIndex={0}
                  aria-selected={selected?.deliveryId === row.deliveryId}
                  className={cn('cursor-pointer outline-none hover:bg-primary/5 focus-visible:bg-primary/5', selected?.deliveryId === row.deliveryId && 'bg-primary/10')}
                  onClick={() => setSelected(row)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelected(row);
                    }
                  }}
                >
                  <TableCell className="min-w-36">{formatDateTime(row.createdAt, locale)}</TableCell>
                  <TableCell className="min-w-48">
                    <div className="font-medium">{row.recipient?.email || row.recipient?.phone || row.recipient?.userId || '-'}</div>
                    <div className="text-xs text-muted-foreground">{row.recipient?.userId || ''}</div>
                  </TableCell>
                  <TableCell>{row.type || '-'}</TableCell>
                  <TableCell><Badge variant="outline">{optionLabel(t, 'notifications.channel', row.channel)}</Badge></TableCell>
                  <TableCell><StatusBadge status={row.status} t={t} /></TableCell>
                  <TableCell className="max-w-72 whitespace-normal">
                    <span className="line-clamp-2 text-sm">{row.content?.subject || row.content?.bodyPreview || '-'}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <div className="flex items-center justify-between gap-3 border-t p-4">
          <p className="text-xs text-muted-foreground">
            {historyQuery.isFetching && !historyQuery.isLoading
              ? t('notifications.admin.refreshing', 'Refreshing...')
              : t('notifications.admin.history.rowsOnPage', '{count} rows on this page', { count: formatCount(rows.length, locale) })}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={cursorStack.length === 0} onClick={() => setCursorStack((stack) => stack.slice(0, -1))}>
              {t('common.previous', 'Previous')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!pagination.hasNext || !pagination.nextCursor}
              onClick={() => setCursorStack((stack) => [...stack, pagination.nextCursor])}
            >
              {t('common.next', 'Next')}
            </Button>
          </div>
        </div>
      </PanelShell>

      <div className="space-y-5">
        <PanelShell title={t('notifications.admin.detail.title', 'Delivery detail')} description={t('notifications.admin.detail.description', 'Timeline and source context for the selected record.')}>
          {selected ? (
            <div className="space-y-5 p-5">
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('notifications.admin.detail.timeline', 'Timeline')}</p>
                <div className="space-y-2">
                  {(selected.statusTimeline || []).length === 0 ? (
                    <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                      {t('notifications.admin.detail.noTimeline', 'No timeline events stored.')}
                    </div>
                  ) : (selected.statusTimeline || []).map((item) => (
                    <div key={`${item.status}-${item.at}`} className="flex items-start justify-between gap-3 rounded-lg border bg-background px-3 py-2">
                      <StatusBadge status={item.status} t={t} />
                      <span className="text-right text-xs text-muted-foreground">{formatDateTime(item.at, locale)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <p><span className="text-muted-foreground">{t('notifications.admin.detail.template', 'Template')}:</span> {selected.content?.templateId || '-'} v{selected.content?.templateVersion || '-'}</p>
                <p><span className="text-muted-foreground">{t('notifications.admin.detail.source', 'Source')}:</span> {[selected.source?.module, selected.source?.event].filter(Boolean).join(' / ') || '-'}</p>
                <p><span className="text-muted-foreground">{t('notifications.admin.detail.failure', 'Failure')}:</span> {selected.failureReason || '-'}</p>
                <p><span className="text-muted-foreground">{t('notifications.admin.detail.review', 'Review')}:</span> {selected.reviewRequiredAt ? formatDateTime(selected.reviewRequiredAt, locale) : '-'}</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-3 text-sm leading-6 text-muted-foreground">
                {selected.content?.bodyPreview || t('notifications.admin.detail.noBody', 'No body preview stored.')}
              </div>
            </div>
          ) : (
            <EmptyState icon={Eye} title={t('notifications.admin.detail.emptyTitle', 'Select a history row')} body={t('notifications.admin.detail.emptyBody', 'Details stay out of the table until you need them.')} />
          )}
        </PanelShell>

        <PanelShell title={t('notifications.admin.gdpr.title', 'GDPR anonymization')} description={t('notifications.admin.gdpr.description', 'Remove recipient identifiers while preserving audit counts.')}>
          <div className="space-y-3 p-5">
            <div className="space-y-1.5">
              <Label htmlFor="notification-gdpr-recipient">{t('notifications.admin.gdpr.recipientId', 'Recipient user ID')}</Label>
              <Input
                id="notification-gdpr-recipient"
                value={anonymizeForm.recipientId}
                onChange={(event) => setAnonymizeForm((current) => ({ ...current, recipientId: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notification-gdpr-email">{t('notifications.admin.gdpr.email', 'Email')}</Label>
              <Input
                id="notification-gdpr-email"
                type="email"
                value={anonymizeForm.email}
                onChange={(event) => setAnonymizeForm((current) => ({ ...current, email: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notification-gdpr-phone">{t('notifications.admin.gdpr.phone', 'Phone')}</Label>
              <Input
                id="notification-gdpr-phone"
                type="tel"
                value={anonymizeForm.phone}
                onChange={(event) => setAnonymizeForm((current) => ({ ...current, phone: event.target.value }))}
              />
            </div>
            <AlertDialog open={confirmAnonymizeOpen} onOpenChange={setConfirmAnonymizeOpen}>
              <Button className="w-full gap-2" variant="destructive" onClick={() => setConfirmAnonymizeOpen(true)} disabled={!canAnonymize || mutations.anonymizeHistory.isPending}>
                <Trash2 className="h-4 w-4" />
                {t('notifications.admin.gdpr.action', 'Anonymize history')}
              </Button>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('notifications.admin.gdpr.confirmTitle', 'Anonymize notification history?')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('notifications.admin.gdpr.confirmDescription', 'Recipient identifiers will be removed while preserving the audit record structure. This action cannot be undone.')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
                  <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={anonymize}>
                    {t('notifications.admin.gdpr.confirmAction', 'Anonymize')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </PanelShell>
      </div>
    </div>
  );
}

function TemplatesPanel({ templatesQuery, filters, setFilters, mutations, locale, t }) {
  const [form, setForm] = useState({ ...DEFAULT_TEMPLATE_FORM });
  const [sampleData, setSampleData] = useState(DEFAULT_TEMPLATE_SAMPLE_JSON);
  const [preview, setPreview] = useState(null);
  const [templateToArchive, setTemplateToArchive] = useState(null);
  const templates = templatesQuery.data?.items ?? TEMPLATE_EMPTY;
  const editing = Boolean(form.id);

  const saveTemplate = async () => {
    const result = buildTemplatePayload(form, templateValidationMessages(t));
    if (result.error) {
      showError(result.error);
      return;
    }

    try {
      if (editing) {
        await mutations.updateTemplate.mutateAsync({ id: form.id, payload: result.payload });
        showSuccess(t('notifications.admin.toast.templateSaved', 'Notification template version saved.'));
      } else {
        await mutations.createTemplate.mutateAsync(result.payload);
        showSuccess(t('notifications.admin.toast.templateCreated', 'Notification template created.'));
      }
      setForm({ ...DEFAULT_TEMPLATE_FORM });
      setPreview(null);
    } catch (error) {
      showError(error);
    }
  };

  const previewTemplate = async () => {
    if (!form.id) {
      showError(t('notifications.admin.toast.previewRequiresTemplate', 'Save or select a template before previewing.'));
      return;
    }
    const parsed = parseJsonObject(
      sampleData,
      t('notifications.admin.template.previewSampleJson', 'Preview sample JSON'),
      jsonValidationMessages(t, 'notifications.admin.template.previewSampleJson', 'Preview sample JSON'),
    );
    if (parsed.error) {
      showError(parsed.error);
      return;
    }

    try {
      const result = await mutations.previewTemplate.mutateAsync({ id: form.id, sampleData: parsed.data });
      setPreview(result);
    } catch (error) {
      showError(error);
    }
  };

  const removeTemplate = async (template) => {
    const id = template?._id;
    if (!id) return;

    try {
      await mutations.removeTemplate.mutateAsync(id);
      showSuccess(t('notifications.admin.toast.templateArchived', 'Notification template archived.'));
      if (form.id === id) setForm({ ...DEFAULT_TEMPLATE_FORM });
      setTemplateToArchive(null);
    } catch (error) {
      showError(error);
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)]">
      <PanelShell
        title={t('notifications.admin.template.libraryTitle', 'Template library')}
        description={t('notifications.admin.template.libraryDescription', 'Versioned templates per type, channel, and language.')}
        actions={(
          <>
            <Select value={filters.channel} onValueChange={(value) => setFilters((current) => ({ ...current, channel: value }))}>
              <SelectTrigger className="w-40" aria-label={t('notifications.admin.filters.channel', 'Channel filter')}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('notifications.admin.filters.allChannels', 'All channels')}</SelectItem>
                <ChannelSelectItems t={t} />
              </SelectContent>
            </Select>
            <Select value={filters.language} onValueChange={(value) => setFilters((current) => ({ ...current, language: value }))}>
              <SelectTrigger className="w-28" aria-label={t('notifications.admin.filters.language', 'Language filter')}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('common.all', 'All')}</SelectItem>
                {NOTIFICATION_ADMIN_LANGUAGES.map((item) => <SelectItem key={item} value={item}>{item.toUpperCase()}</SelectItem>)}
              </SelectContent>
            </Select>
            <IconButton label={t('notifications.admin.actions.refreshTemplates', 'Refresh templates')} variant="outline" size="icon" onClick={() => templatesQuery.refetch()} disabled={templatesQuery.isFetching}>
              <RefreshCw className={cn('h-4 w-4', templatesQuery.isFetching && 'animate-spin')} />
            </IconButton>
          </>
        )}
      >
        {templatesQuery.isError ? (
          <ErrorState message={templatesQuery.error?.message} onRetry={() => templatesQuery.refetch()} t={t} />
        ) : (
          <div className="divide-y">
            {templatesQuery.isLoading ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-20 rounded-lg" />)}
              </div>
            ) : templates.length === 0 ? (
              <EmptyState icon={FileText} title={t('notifications.admin.template.emptyTitle', 'No templates found')} body={t('notifications.admin.template.emptyBody', 'Create the first channel template from the editor.')} />
            ) : templates.map((template) => (
              <div key={template._id} className="flex items-start justify-between gap-3 p-4 transition-colors hover:bg-muted/30">
                <button type="button" className="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40" onClick={() => { setForm(templateToForm(template)); setPreview(null); }}>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium">{template.type}</p>
                    <Badge variant="outline">{optionLabel(t, 'notifications.channel', template.channel)}</Badge>
                    <Badge variant={template.isActive ? 'success' : 'secondary'}>v{template.version}</Badge>
                    <span className="text-xs uppercase text-muted-foreground">{template.language}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{template.subjectTemplate || template.bodyTemplate}</p>
                </button>
                <IconButton label={t('notifications.admin.template.archiveAction', 'Archive template')} size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setTemplateToArchive(template)}>
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </div>
            ))}
          </div>
        )}
      </PanelShell>

      <PanelShell
        title={editing ? t('notifications.admin.template.editTitle', 'Edit template version') : t('notifications.admin.template.createTitle', 'Create template')}
        description={t('notifications.admin.template.editorDescription', 'Missing placeholders render as empty strings. Updating creates a new active version.')}
        actions={editing && (
          <Button variant="outline" size="sm" onClick={() => { setForm({ ...DEFAULT_TEMPLATE_FORM }); setPreview(null); }}>
            {t('notifications.admin.template.newTemplate', 'New template')}
          </Button>
        )}
      >
        <div className="grid gap-4 p-5 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="notification-template-type">{t('notifications.admin.form.notificationType', 'Notification type')}</Label>
            <Input id="notification-template-type" value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))} placeholder="appointment_reminder" />
          </div>
          <div className="space-y-1.5">
            <Label>{t('notifications.admin.form.channel', 'Channel')}</Label>
            <Select value={form.channel} onValueChange={(value) => setForm((current) => ({ ...current, channel: value }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><ChannelSelectItems t={t} /></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('notifications.admin.form.language', 'Language')}</Label>
            <Select value={form.language} onValueChange={(value) => setForm((current) => ({ ...current, language: value }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{NOTIFICATION_ADMIN_LANGUAGES.map((item) => <SelectItem key={item} value={item}>{item.toUpperCase()}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notification-template-subject">{t('notifications.admin.template.subject', 'Subject')}</Label>
            <Input id="notification-template-subject" value={form.subjectTemplate} onChange={(event) => setForm((current) => ({ ...current, subjectTemplate: event.target.value }))} placeholder="{{customer.name}} reminder" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="notification-template-body">{t('notifications.admin.template.body', 'Body')}</Label>
            <Textarea id="notification-template-body" value={form.bodyTemplate} onChange={(event) => setForm((current) => ({ ...current, bodyTemplate: event.target.value }))} rows={4} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="notification-template-html">{t('notifications.admin.template.emailHtmlBody', 'Email HTML body')}</Label>
            <Textarea id="notification-template-html" value={form.bodyHtmlTemplate} onChange={(event) => setForm((current) => ({ ...current, bodyHtmlTemplate: event.target.value }))} rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notification-template-whatsapp">{t('notifications.admin.template.whatsappTemplateId', 'WhatsApp template ID')}</Label>
            <Input id="notification-template-whatsapp" value={form.whatsappTemplateId} onChange={(event) => setForm((current) => ({ ...current, whatsappTemplateId: event.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notification-template-variables">{t('notifications.admin.template.variablesJson', 'Variables JSON')}</Label>
            <Textarea id="notification-template-variables" value={form.variables} onChange={(event) => setForm((current) => ({ ...current, variables: event.target.value }))} rows={3} className="font-mono text-xs" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="notification-template-preview-sample">{t('notifications.admin.template.previewSampleJson', 'Preview sample JSON')}</Label>
            <Textarea id="notification-template-preview-sample" value={sampleData} onChange={(event) => setSampleData(event.target.value)} rows={3} className="font-mono text-xs" />
          </div>
          {preview && (
            <div className="md:col-span-2 rounded-lg border bg-background p-4">
              <p className="text-sm font-medium">{preview.subject || t('notifications.admin.template.noSubject', 'No subject')}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{preview.body || preview.bodyHtml || t('notifications.admin.template.noBody', 'No body')}</p>
            </div>
          )}
          <div className="md:col-span-2 flex flex-wrap justify-end gap-2">
            <Button variant="outline" className="gap-2" onClick={previewTemplate} disabled={mutations.previewTemplate.isPending || !editing}>
              <Eye className="h-4 w-4" />
              {t('common.preview', 'Preview')}
            </Button>
            <Button className="gap-2" onClick={saveTemplate} disabled={mutations.createTemplate.isPending || mutations.updateTemplate.isPending}>
              <Save className="h-4 w-4" />
              {editing ? t('notifications.admin.template.saveVersion', 'Save version') : t('common.create', 'Create')}
            </Button>
          </div>
        </div>
      </PanelShell>
      <AlertDialog open={Boolean(templateToArchive)} onOpenChange={(open) => { if (!open) setTemplateToArchive(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('notifications.admin.template.archiveTitle', 'Archive template?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('notifications.admin.template.archiveDescription', 'The selected template version will be removed from active administration lists. Existing audit history remains unchanged.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => removeTemplate(templateToArchive)}>
              {t('notifications.admin.template.archiveConfirm', 'Archive template')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ScheduledPanel({ scheduledQuery, status, setStatus, mutations, locale, t }) {
  const [form, setForm] = useState(withDefaultScheduleTime());
  const [scheduleToCancel, setScheduleToCancel] = useState(null);
  const rows = scheduledQuery.data?.items ?? SCHEDULE_EMPTY;

  const createSchedule = async () => {
    const result = buildSchedulePayload(form, scheduleValidationMessages(t));
    if (result.error) {
      showError(result.error);
      return;
    }

    try {
      await mutations.createScheduled.mutateAsync(result.payload);
      showSuccess(t('notifications.admin.toast.scheduleCreated', 'Scheduled notification created.'));
      setForm(withDefaultScheduleTime(DEFAULT_SCHEDULE_FORM));
    } catch (error) {
      showError(error);
    }
  };

  const runScheduleAction = async (action, id, successMessage) => {
    try {
      await action.mutateAsync(id);
      showSuccess(successMessage);
    } catch (error) {
      showError(error);
    }
  };

  const cancelSchedule = async (schedule) => {
    if (!schedule?._id) return;
    await runScheduleAction(
      mutations.cancelScheduled,
      schedule._id,
      t('notifications.admin.toast.scheduleCancelled', 'Schedule cancelled.'),
    );
    setScheduleToCancel(null);
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(420px,0.8fr)_minmax(0,1.2fr)]">
      <PanelShell title={t('notifications.admin.schedule.createTitle', 'Create schedule')} description={t('notifications.admin.schedule.createDescription', 'One-time or recurring notifications using the normal delivery pipeline.')}>
        <div className="grid gap-4 p-5 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="notification-schedule-type">{t('notifications.admin.form.notificationType', 'Notification type')}</Label>
            <Input id="notification-schedule-type" value={form.notificationType} onChange={(event) => setForm((current) => ({ ...current, notificationType: event.target.value }))} placeholder="daily_reminder" />
          </div>
          <div className="space-y-1.5">
            <Label>{t('notifications.admin.form.category', 'Category')}</Label>
            <Select value={form.category} onValueChange={(value) => setForm((current) => ({ ...current, category: value }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{NOTIFICATION_ADMIN_CATEGORIES.map((item) => <SelectItem key={item} value={item}>{optionLabel(t, 'notifications.category', item)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('notifications.admin.schedule.type', 'Schedule type')}</Label>
            <Select value={form.scheduleType} onValueChange={(value) => setForm((current) => ({ ...current, scheduleType: value }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ONE_TIME">{t('notifications.admin.schedule.oneTime', 'One-time')}</SelectItem>
                <SelectItem value="RECURRING">{t('notifications.admin.schedule.recurring', 'Recurring')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('notifications.admin.form.priority', 'Priority')}</Label>
            <Select value={form.priority} onValueChange={(value) => setForm((current) => ({ ...current, priority: value }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{NOTIFICATION_ADMIN_PRIORITIES.map((item) => <SelectItem key={item} value={item}>{optionLabel(t, 'notifications.priority', item)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {form.scheduleType === 'ONE_TIME' ? (
            <div className="space-y-1.5">
              <Label htmlFor="notification-schedule-at">{t('notifications.admin.schedule.scheduledAt', 'Scheduled at')}</Label>
              <Input id="notification-schedule-at" type="datetime-local" value={form.scheduledAt} onChange={(event) => setForm((current) => ({ ...current, scheduledAt: event.target.value }))} />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="notification-schedule-cron">{t('notifications.admin.schedule.cronExpression', 'Cron expression')}</Label>
              <Input id="notification-schedule-cron" value={form.cronExpression} onChange={(event) => setForm((current) => ({ ...current, cronExpression: event.target.value }))} className="font-mono" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="notification-schedule-timezone">{t('notifications.admin.schedule.timezone', 'Timezone')}</Label>
            <Input id="notification-schedule-timezone" value={form.timezone} onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="notification-schedule-recipient-ids">{t('notifications.admin.schedule.recipientIds', 'Recipient IDs')}</Label>
            <Input id="notification-schedule-recipient-ids" value={form.recipientIds} onChange={(event) => setForm((current) => ({ ...current, recipientIds: event.target.value }))} placeholder={t('notifications.admin.schedule.recipientIdsPlaceholder', 'comma-separated user IDs')} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>{t('notifications.admin.form.channels', 'Channels')}</Label>
            <ChannelCheckboxes value={form.channels} onChange={(channels) => setForm((current) => ({ ...current, channels }))} t={t} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notification-schedule-title">{t('notifications.admin.form.title', 'Title')}</Label>
            <Input id="notification-schedule-title" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notification-schedule-deep-link">{t('notifications.admin.schedule.deepLink', 'Deep link')}</Label>
            <Input id="notification-schedule-deep-link" value={form.deepLink} onChange={(event) => setForm((current) => ({ ...current, deepLink: event.target.value }))} placeholder="/field-ops/orders/..." />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="notification-schedule-body">{t('notifications.admin.template.body', 'Body')}</Label>
            <Textarea id="notification-schedule-body" value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} rows={3} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="notification-schedule-payload">{t('notifications.admin.schedule.extraPayloadJson', 'Extra payload JSON')}</Label>
            <Textarea id="notification-schedule-payload" value={form.payloadJson} onChange={(event) => setForm((current) => ({ ...current, payloadJson: event.target.value }))} rows={3} className="font-mono text-xs" />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <Button className="gap-2" onClick={createSchedule} disabled={mutations.createScheduled.isPending}>
              <Plus className="h-4 w-4" />
              {t('notifications.admin.schedule.createAction', 'Create schedule')}
            </Button>
          </div>
        </div>
      </PanelShell>

      <PanelShell
        title={t('notifications.admin.schedule.listTitle', 'Scheduled notifications')}
        description={t('notifications.admin.schedule.listDescription', 'Manage active, paused, completed, and cancelled schedule records.')}
        actions={(
          <>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-44" aria-label={t('notifications.admin.filters.status', 'Status filter')}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('notifications.admin.filters.allStatuses', 'All statuses')}</SelectItem>
                <StatusSelectItems t={t} statuses={NOTIFICATION_ADMIN_SCHEDULE_STATUSES} />
              </SelectContent>
            </Select>
            <IconButton label={t('notifications.admin.actions.refreshSchedules', 'Refresh schedules')} variant="outline" size="icon" onClick={() => scheduledQuery.refetch()} disabled={scheduledQuery.isFetching}>
              <RefreshCw className={cn('h-4 w-4', scheduledQuery.isFetching && 'animate-spin')} />
            </IconButton>
          </>
        )}
      >
        {scheduledQuery.isError ? (
          <ErrorState message={scheduledQuery.error?.message} onRetry={() => scheduledQuery.refetch()} t={t} />
        ) : (
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead>{t('notifications.admin.schedule.nextDispatch', 'Next dispatch')}</TableHead>
                <TableHead>{t('notifications.admin.table.type', 'Type')}</TableHead>
                <TableHead>{t('notifications.admin.schedule.tableSchedule', 'Schedule')}</TableHead>
                <TableHead>{t('notifications.admin.table.status', 'Status')}</TableHead>
                <TableHead className="text-right">{t('notifications.admin.table.actions', 'Actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scheduledQuery.isLoading ? (
                <LoadingRows columns={5} rows={6} />
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}>
                    <EmptyState icon={CalendarClock} title={t('notifications.admin.schedule.emptyTitle', 'No schedules found')} body={t('notifications.admin.schedule.emptyBody', 'Create a reminder or recurring batch notification.')} />
                  </TableCell>
                </TableRow>
              ) : rows.map((row) => (
                <TableRow key={row._id}>
                  <TableCell className="min-w-40">
                    <div className="font-medium">{formatDateTime(row.nextDispatchAt || row.scheduledAt, locale)}</div>
                    <div className="text-xs text-muted-foreground">{row.timezone || 'Europe/Zurich'}</div>
                  </TableCell>
                  <TableCell>{row.notificationType}</TableCell>
                  <TableCell>
                    <div>{row.scheduleType === 'ONE_TIME' ? t('notifications.admin.schedule.oneTime', 'One-time') : t('notifications.admin.schedule.recurring', 'Recurring')}</div>
                    <div className="text-xs text-muted-foreground">{row.cronExpression || row.scheduledAt || '-'}</div>
                  </TableCell>
                  <TableCell><StatusBadge status={row.status} t={t} /></TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {row.status === 'ACTIVE' && (
                        <IconButton label={t('notifications.admin.schedule.pauseAction', 'Pause schedule')} size="icon" variant="ghost" className="h-8 w-8" onClick={() => runScheduleAction(mutations.pauseScheduled, row._id, t('notifications.admin.toast.schedulePaused', 'Schedule paused.'))}>
                          <PauseCircle className="h-4 w-4" />
                        </IconButton>
                      )}
                      {row.status === 'PAUSED' && (
                        <IconButton label={t('notifications.admin.schedule.resumeAction', 'Resume schedule')} size="icon" variant="ghost" className="h-8 w-8" onClick={() => runScheduleAction(mutations.resumeScheduled, row._id, t('notifications.admin.toast.scheduleResumed', 'Schedule resumed.'))}>
                          <PlayCircle className="h-4 w-4" />
                        </IconButton>
                      )}
                      {['ACTIVE', 'PAUSED'].includes(row.status) && (
                        <IconButton label={t('notifications.admin.schedule.cancelAction', 'Cancel schedule')} size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setScheduleToCancel(row)}>
                          <XCircle className="h-4 w-4" />
                        </IconButton>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </PanelShell>
      <AlertDialog open={Boolean(scheduleToCancel)} onOpenChange={(open) => { if (!open) setScheduleToCancel(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('notifications.admin.schedule.cancelTitle', 'Cancel scheduled notification?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('notifications.admin.schedule.cancelDescription', 'Future dispatches for this schedule will stop. Delivery history already written by the pipeline is preserved.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => cancelSchedule(scheduleToCancel)}>
              {t('notifications.admin.schedule.cancelConfirm', 'Cancel schedule')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function NotificationAdminConsole() {
  const { locale, t } = useLanguage();
  const [period, setPeriod] = useState('24h');
  const [metricsChannel, setMetricsChannel] = useState('ALL');
  const [historySearch, setHistorySearch] = useState('');
  const deferredHistorySearch = useDeferredValue(historySearch);
  const [historyChannel, setHistoryChannel] = useState('ALL');
  const [historyStatus, setHistoryStatus] = useState('ALL');
  const [historyCursorStack, setHistoryCursorStack] = useState([]);
  const [templateFilters, setTemplateFilters] = useState({ channel: 'ALL', language: 'ALL' });
  const [scheduleStatus, setScheduleStatus] = useState('ALL');

  const metricsFilters = useMemo(() => compactObject({
    period,
    channel: metricsChannel === 'ALL' ? '' : metricsChannel,
  }), [metricsChannel, period]);

  const historyFilters = useMemo(() => buildHistoryFilters({
    cursor: historyCursorStack[historyCursorStack.length - 1],
    search: deferredHistorySearch,
    channel: historyChannel,
    status: historyStatus,
  }), [deferredHistorySearch, historyChannel, historyCursorStack, historyStatus]);

  const templateQueryFilters = useMemo(() => compactObject({
    channel: templateFilters.channel === 'ALL' ? '' : templateFilters.channel,
    language: templateFilters.language === 'ALL' ? '' : templateFilters.language,
  }), [templateFilters]);

  const scheduledFilters = useMemo(() => compactObject({
    limit: NOTIFICATION_ADMIN_SCHEDULE_LIMIT,
    status: scheduleStatus === 'ALL' ? '' : scheduleStatus,
  }), [scheduleStatus]);

  const metricsQuery = useNotificationMetrics(metricsFilters);
  const historyQuery = useNotificationHistory(historyFilters);
  const templatesQuery = useNotificationTemplates(templateQueryFilters);
  const scheduledQuery = useScheduledNotifications(scheduledFilters);
  const mutations = useNotificationAdminMutations();
  const overview = useMemo(() => buildNotificationAdminOverview({
    metrics: metricsQuery.data,
    templates: templatesQuery.data,
    schedules: scheduledQuery.data,
  }), [metricsQuery.data, scheduledQuery.data, templatesQuery.data]);
  const isRefreshing = metricsQuery.isFetching || historyQuery.isFetching || templatesQuery.isFetching || scheduledQuery.isFetching;

  return (
    <TooltipProvider>
      <div className="flex w-full min-w-0 flex-col gap-6 p-4 md:p-6">
        <PageHeader
          title={t('notifications.admin.title', 'Notification operations')}
          description={t('notifications.admin.description', 'Delivery health, audit history, templates, and schedules for the notification module.')}
          icon={BellRing}
        >
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => {
              metricsQuery.refetch();
              historyQuery.refetch();
              templatesQuery.refetch();
              scheduledQuery.refetch();
            }}
            disabled={isRefreshing}
          >
            <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
            {t('common.refresh', 'Refresh')}
          </Button>
        </PageHeader>

        <OperationsOverview overview={overview} locale={locale} t={t} isFetching={isRefreshing} />

        <Tabs defaultValue="history" className="gap-5">
          <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl border bg-card/80 p-1">
            <TabsTrigger value="history" className="min-h-10 gap-2 rounded-lg px-3">
              <FileText className="h-4 w-4" />
              {t('notifications.admin.tabs.history', 'History')}
              <Badge variant="secondary">{formatCount(historyQuery.data?.items?.length || 0, locale)}</Badge>
            </TabsTrigger>
            <TabsTrigger value="metrics" className="min-h-10 gap-2 rounded-lg px-3">
              <BarChart3 className="h-4 w-4" />
              {t('notifications.admin.tabs.metrics', 'Metrics')}
              <Badge variant={overview.reviewRequired > 0 ? 'warning' : 'secondary'}>{formatCount(overview.reviewRequired, locale)}</Badge>
            </TabsTrigger>
            <TabsTrigger value="templates" className="min-h-10 gap-2 rounded-lg px-3">
              <Layers className="h-4 w-4" />
              {t('notifications.admin.tabs.templates', 'Templates')}
              <Badge variant="secondary">{formatCount(overview.templateCount, locale)}</Badge>
            </TabsTrigger>
            <TabsTrigger value="schedules" className="min-h-10 gap-2 rounded-lg px-3">
              <CalendarClock className="h-4 w-4" />
              {t('notifications.admin.tabs.schedules', 'Schedules')}
              <Badge variant={overview.activeScheduleCount > 0 ? 'success' : 'secondary'}>{formatCount(overview.activeScheduleCount, locale)}</Badge>
            </TabsTrigger>
          </TabsList>

        <TabsContent value="history">
          <HistoryPanel
            historyQuery={historyQuery}
            filters={historyFilters}
            setters={{
              search: [historySearch, setHistorySearch],
              channel: [historyChannel, setHistoryChannel],
              status: [historyStatus, setHistoryStatus],
              cursor: [historyCursorStack, setHistoryCursorStack],
            }}
            locale={locale}
            mutations={mutations}
            t={t}
          />
        </TabsContent>

        <TabsContent value="metrics">
          <MetricsPanel
            metricsQuery={metricsQuery}
            period={period}
            setPeriod={setPeriod}
            channel={metricsChannel}
            setChannel={setMetricsChannel}
            mutations={mutations}
            locale={locale}
            t={t}
          />
        </TabsContent>

        <TabsContent value="templates">
          <TemplatesPanel
            templatesQuery={templatesQuery}
            filters={templateFilters}
            setFilters={setTemplateFilters}
            mutations={mutations}
            locale={locale}
            t={t}
          />
        </TabsContent>

        <TabsContent value="schedules">
          <ScheduledPanel
            scheduledQuery={scheduledQuery}
            status={scheduleStatus}
            setStatus={setScheduleStatus}
            mutations={mutations}
            locale={locale}
            t={t}
          />
        </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}
