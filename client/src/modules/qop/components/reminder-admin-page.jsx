'use client';

import {
  AlertTriangle,
  BellRing,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Mail,
  MessageCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  TimerReset,
  XCircle,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  REMINDER_CHANNELS,
  REMINDER_DEFAULT_CHANNELS,
  REMINDER_FILTERS,
  REMINDER_LANGUAGES,
  REMINDER_QUICK_SEND_OPTIONS,
  REMINDER_SORT_OPTIONS,
  REMINDER_STATUSES,
  REMINDER_STATUS_META,
  REMINDER_QUERY_LIMIT,
} from '../constants/reminder-admin';
import { useReminderAdminController } from '../hooks/use-reminder-admin-controller';
import {
  customerContact,
  customerLabel,
  formatDateTime,
} from '../utils/reminder-admin-utils';

const STATUS_ICONS = {
  PENDING: Clock3,
  SENT: Mail,
  DELIVERED: CheckCircle2,
  READ: CheckCircle2,
  FAILED: AlertTriangle,
  RESPONDED: MessageCircle,
  CANCELLED: XCircle,
};

const CHANNEL_ICONS = {
  email: Mail,
  whatsapp: MessageCircle,
  both: BellRing,
};

function PanelError({ title, message, actionLabel, onAction }) {
  return (
    <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>{message}</span>
        {onAction ? (
          <Button type="button" size="sm" variant="outline" onClick={onAction}>
            <RefreshCw className="h-3.5 w-3.5" />
            {actionLabel}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

function StatusBadge({ status, t }) {
  const meta = REMINDER_STATUS_META[status] || REMINDER_STATUS_META.PENDING;
  const Icon = STATUS_ICONS[status] || Clock3;

  return (
    <Badge variant="outline" className={cn('gap-1.5 rounded-full px-2.5 py-1 text-xs', meta.badgeClass)}>
      <Icon className="h-3.5 w-3.5" />
      {t(meta.labelKey)}
    </Badge>
  );
}

function ChannelLabel({ channel, t }) {
  const meta = REMINDER_CHANNELS.find((item) => item.value === channel) || REMINDER_CHANNELS[0];
  const Icon = CHANNEL_ICONS[meta.value] || Mail;

  return (
    <span className="inline-flex items-center gap-1.5 capitalize text-foreground">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      {t(meta.labelKey)}
    </span>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  helper,
  tone = 'default',
}) {
  const tones = {
    default: 'border-border/80 bg-background/70',
    success: 'border-emerald-500/30 bg-emerald-500/10',
    warning: 'border-amber-500/30 bg-amber-500/10',
    danger: 'border-destructive/30 bg-destructive/10',
    info: 'border-sky-500/30 bg-sky-500/10',
  };

  return (
    <div className={cn('min-h-28 rounded-xl border p-4 shadow-sm transition-colors', tones[tone])}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="mt-3 text-3xl font-semibold tabular-nums tracking-normal">{value}</p>
      {helper ? <p className="mt-1 text-xs text-muted-foreground">{helper}</p> : null}
    </div>
  );
}

function ReminderHero({ controller }) {
  const {
    t, language, stats, table, refresh,
  } = controller;
  const nextLabel = stats.nextReminder
    ? formatDateTime(stats.nextReminder.scheduledAt, language)
    : t('qop.reminders.stats.none');

  return (
    <section className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-theme-sm">
      <div className="flex flex-col gap-6 p-5 lg:flex-row lg:items-end lg:justify-between lg:p-7">
        <div className="max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            {t('qop.reminders.badge')}
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-normal text-foreground md:text-4xl">
              {t('qop.reminders.title')}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t('qop.reminders.subtitle')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="h-9 gap-2 rounded-full px-3 text-xs">
            <TimerReset className="h-3.5 w-3.5 text-muted-foreground" />
            {t('qop.reminders.hero.limit', { count: REMINDER_QUERY_LIMIT })}
          </Badge>
          <Button type="button" variant="outline" onClick={refresh} disabled={table.isFetching} className="gap-2">
            <RefreshCw className={cn('h-4 w-4', table.isFetching && 'animate-spin')} />
            {table.isFetching ? t('qop.reminders.hero.refreshing') : t('qop.reminders.hero.refresh')}
          </Button>
        </div>
      </div>
      <div className="grid gap-3 border-t border-border/80 bg-muted/20 p-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricTile
          icon={Clock3}
          label={t('qop.reminders.stats.pending')}
          value={stats.pending}
          helper={t('qop.reminders.stats.ofTotal', { count: stats.total })}
          tone="warning"
        />
        <MetricTile
          icon={AlertTriangle}
          label={t('qop.reminders.stats.failed')}
          value={stats.failed}
          helper={stats.overdue > 0 ? t('qop.reminders.stats.overdue', { count: stats.overdue }) : t('qop.reminders.stats.none')}
          tone={stats.failed > 0 ? 'danger' : 'default'}
        />
        <MetricTile
          icon={CheckCircle2}
          label={t('qop.reminders.stats.successRate')}
          value={`${stats.successRate}%`}
          helper={t('qop.reminders.stats.ofTotal', { count: stats.successful })}
          tone="success"
        />
        <MetricTile
          icon={CalendarClock}
          label={t('qop.reminders.stats.next')}
          value={nextLabel}
          helper={stats.nextReminder ? customerLabel(stats.nextReminder.customerId) : ''}
          tone="info"
        />
        <MetricTile
          icon={BellRing}
          label={t('qop.reminders.stats.shown')}
          value={table.rawCount}
          helper={t('qop.reminders.table.lastUpdated', { value: formatDateTime(table.lastUpdatedAt, language) })}
        />
      </div>
    </section>
  );
}

function SettingsPanel({ controller }) {
  const { t, settings } = controller;

  return (
    <Card className="overflow-hidden rounded-2xl">
      <CardHeader className="border-b border-border/80 bg-muted/20">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-primary" />
              {t('qop.reminders.settings.title')}
            </CardTitle>
            <CardDescription className="mt-1">
              {t('qop.reminders.settings.description')}
            </CardDescription>
          </div>
          {settings.isFetching ? <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
        </div>
      </CardHeader>
      <CardContent className="p-5">
        {settings.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </div>
        ) : settings.isError ? (
          <PanelError
            title={t('common.errorLoading')}
            message={settings.queryError?.message || t('common.errorLoading')}
            actionLabel={t('qop.reminders.table.refresh')}
            onAction={controller.refresh}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="appointment-hours">{t('qop.reminders.settings.appointmentHours')}</Label>
              <Input
                id="appointment-hours"
                value={settings.form.appointmentReminderHours}
                onChange={(event) => settings.setValue('appointmentReminderHours', event.target.value)}
                placeholder="48, 24, 2"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">{t('qop.reminders.settings.appointmentHoursHelp')}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="followup-days">{t('qop.reminders.settings.followupDays')}</Label>
              <Input
                id="followup-days"
                value={settings.form.quotationFollowupDays}
                onChange={(event) => settings.setValue('quotationFollowupDays', event.target.value)}
                placeholder="7, 14, 21"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">{t('qop.reminders.settings.followupDaysHelp')}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expiry-warning">{t('qop.reminders.settings.expiryWarning')}</Label>
              <Input
                id="expiry-warning"
                type="number"
                min={1}
                max={90}
                value={settings.form.quotationExpiryWarnDays}
                onChange={(event) => settings.setValue('quotationExpiryWarnDays', event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t('qop.reminders.settings.expiryWarningHelp')}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{t('qop.reminders.settings.defaultLanguage')}</Label>
              <Select value={settings.form.defaultLanguage} onValueChange={(value) => settings.setValue('defaultLanguage', value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REMINDER_LANGUAGES.map((item) => <SelectItem key={item} value={item}>{item.toUpperCase()}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t('qop.reminders.settings.defaultChannel')}</Label>
              <Select value={settings.form.defaultAppointmentChannel} onValueChange={(value) => settings.setValue('defaultAppointmentChannel', value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REMINDER_DEFAULT_CHANNELS.map((channel) => (
                    <SelectItem key={channel.value} value={channel.value}>{t(channel.labelKey)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t('qop.reminders.settings.channelHelp')}</p>
            </div>
            <div className="sm:col-span-2 rounded-xl border border-border/80 bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
              {t('qop.reminders.settings.whatsappOutOfScope')}
            </div>
            {settings.error ? (
              <div className="sm:col-span-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {settings.error}
              </div>
            ) : null}
            <div className="sm:col-span-2 flex flex-col gap-3 border-t border-border/80 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                {settings.isSaved ? t('qop.reminders.settings.saved') : t('qop.reminders.settings.applyNote')}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" onClick={settings.reset} disabled={settings.isSaving}>
                  <RotateCcw className="h-4 w-4" />
                  {t('qop.reminders.settings.reset')}
                </Button>
                <Button type="button" onClick={settings.save} disabled={settings.isSaving}>
                  <Save className="h-4 w-4" />
                  {settings.isSaving ? t('qop.reminders.settings.saving') : t('qop.reminders.settings.save')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ManualReminderPanel({ controller }) {
  const { t, manual } = controller;
  const showNoCustomers = manual.form.customerQuery.trim().length >= 2
    && !manual.form.customerId
    && !manual.isSearchingCustomers
    && manual.customers.length === 0;

  return (
    <Card className="overflow-hidden rounded-2xl">
      <CardHeader className="border-b border-border/80 bg-muted/20">
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          {t('qop.reminders.manual.title')}
        </CardTitle>
        <CardDescription>{t('qop.reminders.manual.description')}</CardDescription>
      </CardHeader>
      <CardContent className="p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="customer-search">{t('qop.reminders.manual.customerSearch')}</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="customer-search"
                value={manual.form.customerQuery}
                onChange={(event) => manual.setValue('customerQuery', event.target.value)}
                placeholder={t('qop.reminders.manual.customerPlaceholder')}
                className="pl-9"
              />
            </div>
            {manual.isSearchingCustomers ? (
              <div className="rounded-xl border border-border/80 bg-muted/20 p-2">
                <Skeleton className="h-10 w-full" />
              </div>
            ) : null}
            {manual.isCustomerSearchError ? (
              <p className="text-xs text-destructive">{t('qop.reminders.manual.searchFailed')}</p>
            ) : null}
            {showNoCustomers ? (
              <p className="text-xs text-muted-foreground">{t('qop.reminders.manual.noCustomers')}</p>
            ) : null}
            {manual.customers.length > 0 ? (
              <div className="max-h-44 overflow-auto rounded-xl border border-border/80 bg-popover p-1 shadow-theme-sm">
                {manual.customers.map((customer) => (
                  <button
                    key={customer._id}
                    type="button"
                    onClick={() => manual.selectCustomer(customer)}
                    className="flex min-h-11 w-full cursor-pointer flex-col rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="font-medium">{customerLabel(customer)}</span>
                    <span className="text-xs text-muted-foreground">{customerContact(customer)}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="customer-id">{t('qop.reminders.manual.customerId')}</Label>
            <Input
              id="customer-id"
              value={manual.form.customerId}
              onChange={(event) => manual.setValue('customerId', event.target.value)}
              placeholder="64f..."
              className="font-mono"
            />
            {manual.form.customerId ? (
              <p className="text-xs text-muted-foreground">{t('qop.reminders.manual.customerSelected')}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="appointment-id">{t('qop.reminders.manual.appointmentId')}</Label>
            <Input
              id="appointment-id"
              value={manual.form.appointmentId}
              onChange={(event) => manual.setValue('appointmentId', event.target.value)}
              placeholder="64f..."
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="scheduled-at">{t('qop.reminders.manual.sendAt')}</Label>
            <Input
              id="scheduled-at"
              type="datetime-local"
              value={manual.form.scheduledAt}
              onChange={(event) => manual.setValue('scheduledAt', event.target.value)}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <p className="text-xs font-medium text-muted-foreground">{t('qop.reminders.manual.quickLabel')}</p>
            <div className="flex flex-wrap gap-2">
              {REMINDER_QUICK_SEND_OPTIONS.map((option) => (
                <Button
                  key={option.minutes}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => manual.applyQuickSend(option.minutes)}
                >
                  <Clock3 className="h-3.5 w-3.5" />
                  {t(option.labelKey)}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t('qop.reminders.manual.language')}</Label>
            <Select value={manual.form.language} onValueChange={(value) => manual.setValue('language', value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REMINDER_LANGUAGES.map((item) => <SelectItem key={item} value={item}>{item.toUpperCase()}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('qop.reminders.manual.channel')}</Label>
            <Select value={manual.form.channel} onValueChange={(value) => manual.setValue('channel', value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REMINDER_CHANNELS.map((channel) => (
                  <SelectItem key={channel.value} value={channel.value}>{t(channel.labelKey)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="message-content">{t('qop.reminders.manual.messageLabel')}</Label>
              <span className="text-xs text-muted-foreground">
                {t('qop.reminders.manual.messageHelp', { count: manual.form.messageContent.length })}
              </span>
            </div>
            <Textarea
              id="message-content"
              value={manual.form.messageContent}
              onChange={(event) => manual.setValue('messageContent', event.target.value)}
              rows={4}
              maxLength={2000}
              placeholder={t('qop.reminders.manual.messagePlaceholder')}
            />
          </div>
          {manual.error ? (
            <div className="md:col-span-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {manual.error}
            </div>
          ) : null}
          <div className="md:col-span-2 flex flex-col gap-2 border-t border-border/80 pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={manual.reset} disabled={manual.isCreating}>
              <RotateCcw className="h-4 w-4" />
              {t('qop.reminders.manual.reset')}
            </Button>
            <Button type="button" onClick={manual.create} disabled={manual.isCreating}>
              <Plus className="h-4 w-4" />
              {manual.isCreating ? t('qop.reminders.manual.creating') : t('qop.reminders.manual.create')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ReminderLoadingRows() {
  return Array.from({ length: 6 }).map((_, index) => (
    <TableRow key={index}>
      <TableCell><Skeleton className="h-10 w-48" /></TableCell>
      <TableCell><Skeleton className="h-10 w-64" /></TableCell>
      <TableCell><Skeleton className="h-8 w-28" /></TableCell>
      <TableCell><Skeleton className="h-8 w-44" /></TableCell>
      <TableCell><Skeleton className="h-8 w-32" /></TableCell>
      <TableCell><Skeleton className="h-8 w-32" /></TableCell>
    </TableRow>
  ));
}

function EmptyReminderState({ filtered, t }) {
  return (
    <TableRow>
      <TableCell colSpan={6} className="h-48 text-center">
        <div className="mx-auto flex max-w-sm flex-col items-center gap-3 text-muted-foreground">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-muted/40">
            <BellRing className="h-6 w-6" />
          </div>
          <div>
            <p className="font-medium text-foreground">
              {filtered ? t('qop.reminders.table.filteredEmptyTitle') : t('qop.reminders.table.emptyTitle')}
            </p>
            <p className="mt-1 text-sm">
              {filtered ? t('qop.reminders.table.filteredEmptyBody') : t('qop.reminders.table.emptyBody')}
            </p>
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

function ReminderRow({ reminder, controller }) {
  const {
    t, language, table,
  } = controller;
  const canRetry = reminder.status === 'FAILED';
  const canCancel = reminder.status === 'PENDING';

  return (
    <TableRow className="align-top">
      <TableCell className="min-w-48">
        <div className="font-medium">{formatDateTime(reminder.scheduledAt, language)}</div>
        <div className="mt-1 text-xs text-muted-foreground">{reminder.language?.toUpperCase() || 'DE'}</div>
      </TableCell>
      <TableCell className="min-w-64">
        <div className="font-medium">{customerLabel(reminder.customerId)}</div>
        <div className="max-w-80 truncate text-xs text-muted-foreground">
          {customerContact(reminder.customerId) || reminder.customerId?._id || '-'}
        </div>
      </TableCell>
      <TableCell className="min-w-36">
        <ChannelLabel channel={reminder.channel} t={t} />
      </TableCell>
      <TableCell className="min-w-56">
        <div className="flex flex-col gap-2">
          <StatusBadge status={reminder.status} t={t} />
          <Select
            value={reminder.status}
            onValueChange={(status) => table.updateStatus(reminder._id, status)}
            disabled={table.isUpdatingStatus}
          >
            <SelectTrigger className="h-8 w-40 text-xs" aria-label={t('qop.reminders.table.setStatus')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REMINDER_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>{t(REMINDER_STATUS_META[status].labelKey)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </TableCell>
      <TableCell className="min-w-72">
        <div className="space-y-1 text-xs text-muted-foreground">
          <div>
            <span className="font-medium text-foreground">{t('qop.reminders.table.appointment')}: </span>
            <span className="font-mono">{reminder.appointmentId || '-'}</span>
          </div>
          {reminder.retryCount ? (
            <div>{t('qop.reminders.table.retryCount', { count: reminder.retryCount })}</div>
          ) : null}
          {reminder.customerResponse ? (
            <div>
              {t('qop.reminders.table.response')}: {t(`qop.reminders.customerResponse.${reminder.customerResponse}`)}
            </div>
          ) : null}
          {reminder.lastError ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="max-w-72 truncate text-destructive">
                    {t('qop.reminders.table.error')}: {reminder.lastError}
                  </div>
                </TooltipTrigger>
                <TooltipContent>{reminder.lastError}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : reminder.messageContent ? (
            <div className="max-w-72 truncate">{reminder.messageContent}</div>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="min-w-36">
        <div className="flex flex-wrap justify-end gap-2">
          {canRetry ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => table.updateStatus(reminder._id, 'PENDING')}
              disabled={table.isUpdatingStatus}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t('qop.reminders.table.retry')}
            </Button>
          ) : null}
          {canCancel ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => table.updateStatus(reminder._id, 'CANCELLED')}
              disabled={table.isUpdatingStatus}
            >
              <XCircle className="h-3.5 w-3.5" />
              {t('qop.reminders.table.cancel')}
            </Button>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}

function ReminderTable({ controller }) {
  const {
    t, filters, table,
  } = controller;
  const hasActiveFilters = filters.statusFilter !== 'all' || filters.searchTerm.trim().length > 0;

  return (
    <Card className="overflow-hidden rounded-2xl">
      <CardHeader className="border-b border-border/80 bg-muted/20">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-primary" />
              {t('qop.reminders.table.title')}
            </CardTitle>
            <CardDescription className="mt-1">
              {t('qop.reminders.table.description')}
            </CardDescription>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_180px_180px_auto] xl:min-w-[760px]">
            <div className="space-y-1">
              <Label htmlFor="reminder-search" className="sr-only">{t('qop.reminders.table.search')}</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="reminder-search"
                  value={filters.searchTerm}
                  onChange={(event) => filters.setSearchTerm(event.target.value)}
                  placeholder={t('qop.reminders.table.searchPlaceholder')}
                  className="pl-9"
                />
              </div>
            </div>
            <Select value={filters.statusFilter} onValueChange={filters.setStatusFilter}>
              <SelectTrigger aria-label={t('common.status')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REMINDER_FILTERS.map((filter) => (
                  <SelectItem key={filter.value} value={filter.value}>{t(filter.labelKey)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filters.sortKey} onValueChange={filters.setSortKey}>
              <SelectTrigger aria-label={t('qop.reminders.table.sort')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REMINDER_SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{t(option.labelKey)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" size="icon" aria-label={t('qop.reminders.table.refresh')} onClick={controller.refresh} disabled={table.isFetching}>
              <RefreshCw className={cn('h-4 w-4', table.isFetching && 'animate-spin')} />
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
          <Badge variant="outline" className="rounded-full">
            {t('qop.reminders.table.showing', { visible: table.reminders.length, total: table.rawCount })}
          </Badge>
          {hasActiveFilters ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => {
                filters.setStatusFilter('all');
                filters.setSearchTerm('');
              }}
            >
              <RotateCcw className="h-3 w-3" />
              {t('common.reset')}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {table.isError ? (
          <div className="p-5">
            <PanelError
              title={t('common.errorLoading')}
              message={table.error?.message || t('common.errorLoading')}
              actionLabel={t('qop.reminders.table.refresh')}
              onAction={controller.refresh}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('qop.reminders.table.scheduled')}</TableHead>
                  <TableHead>{t('qop.reminders.table.customer')}</TableHead>
                  <TableHead>{t('qop.reminders.table.channel')}</TableHead>
                  <TableHead>{t('qop.reminders.table.status')}</TableHead>
                  <TableHead>{t('qop.reminders.table.details')}</TableHead>
                  <TableHead className="text-right">{t('qop.reminders.table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {table.isLoading ? (
                  <ReminderLoadingRows />
                ) : table.reminders.length === 0 ? (
                  <EmptyReminderState filtered={hasActiveFilters} t={t} />
                ) : table.reminders.map((reminder) => (
                  <ReminderRow key={reminder._id} reminder={reminder} controller={controller} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ReminderAdminPage() {
  const controller = useReminderAdminController();

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-4 py-6 md:px-6 lg:py-8">
      <ReminderHero controller={controller} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <SettingsPanel controller={controller} />
        <ManualReminderPanel controller={controller} />
      </div>
      <ReminderTable controller={controller} />
      <div className="h-4" aria-hidden="true" />
    </div>
  );
}
