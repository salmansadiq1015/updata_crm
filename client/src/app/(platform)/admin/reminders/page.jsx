'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  BellRing,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/lib/i18n/language-context';
import { customerService } from '@/modules/crm/services/customer-service';
import { useAppointmentReminders, useReminderSettings } from '@/modules/qop/hooks/use-qop-queries';
import { useReminderMutations } from '@/modules/qop/hooks/use-qop-mutations';

const STATUSES = ['PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'RESPONDED', 'CANCELLED'];
const LANGUAGES = ['de', 'fr', 'it', 'en'];

const STATUS_META = {
  PENDING: { labelKey: 'status.pending', variant: 'warning', Icon: Clock3 },
  SENT: { labelKey: 'status.sent', variant: 'secondary', Icon: CheckCircle2 },
  DELIVERED: { labelKey: 'status.delivered', variant: 'success', Icon: CheckCircle2 },
  READ: { labelKey: 'status.read', variant: 'success', Icon: CheckCircle2 },
  FAILED: { labelKey: 'status.failed', variant: 'destructive', Icon: AlertTriangle },
  RESPONDED: { labelKey: 'status.responded', variant: 'outline', Icon: CheckCircle2 },
  CANCELLED: { labelKey: 'status.cancelled', variant: 'outline', Icon: AlertTriangle },
};

function localDateTimeValue(date = new Date(Date.now() + 24 * 60 * 60 * 1000)) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function parseNumberList(value) {
  return [...new Set(String(value)
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0))];
}

function settingsToForm(settings) {
  return {
    appointmentReminderHours: (settings?.appointmentReminderHours || [48, 24, 2]).join(','),
    quotationFollowupDays: (settings?.quotationFollowupDays || [7, 14, 21]).join(','),
    quotationExpiryWarnDays: settings?.quotationExpiryWarnDays || 3,
    defaultAppointmentChannel: settings?.defaultAppointmentChannel || 'email',
    defaultLanguage: settings?.defaultLanguage || 'de',
  };
}

function formatDateTime(value, language) {
  if (!value) return '-';
  const locale = language === 'de'
    ? 'de-CH'
    : language === 'fr'
      ? 'fr-CH'
      : language === 'it'
        ? 'it-CH'
        : 'en-US';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function customerLabel(customer) {
  if (!customer) return '-';
  if (typeof customer === 'string') return customer;
  return [customer.customerNumber, customer.name].filter(Boolean).join(' - ') || customer._id;
}

function StatusBadge({ status, t }) {
  const meta = STATUS_META[status] || STATUS_META.PENDING;
  const Icon = meta.Icon;
  return (
    <Badge variant={meta.variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {t(`qop.reminders.${meta.labelKey}`)}
    </Badge>
  );
}

function LoadingRows() {
  return Array.from({ length: 5 }).map((_, index) => (
    <TableRow key={index}>
      <TableCell><Skeleton className="h-5 w-40" /></TableCell>
      <TableCell><Skeleton className="h-5 w-48" /></TableCell>
      <TableCell><Skeleton className="h-5 w-28" /></TableCell>
      <TableCell><Skeleton className="h-8 w-32" /></TableCell>
    </TableRow>
  ));
}

export default function RemindersPage() {
  const { locale: language, t } = useLanguage();
  const [statusFilter, setStatusFilter] = useState('all');
  const [settingsDraft, setSettingsDraft] = useState(null);
  const [createForm, setCreateForm] = useState({
    appointmentId: '',
    customerId: '',
    customerQuery: '',
    scheduledAt: localDateTimeValue(),
    language: 'de',
    messageContent: '',
  });
  const [settingsError, setSettingsError] = useState('');
  const [createError, setCreateError] = useState('');

  const filters = useMemo(() => ({
    limit: 50,
    ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
  }), [statusFilter]);

  const remindersQuery = useAppointmentReminders(filters);
  const settingsQuery = useReminderSettings();
  const {
    createAppointmentReminder,
    updateAppointmentReminderStatus,
    updateReminderSettings,
  } = useReminderMutations();

  const customerSearchQuery = createForm.customerQuery.trim();
  const customersQuery = useQuery({
    queryKey: ['crm', 'customers', 'search', customerSearchQuery],
    queryFn: () => customerService.searchCustomers(customerSearchQuery, 8),
    enabled: customerSearchQuery.length >= 2,
    select: (data) => Array.isArray(data) ? data : [],
  });

  const settingsForm = useMemo(
    () => settingsDraft || settingsToForm(settingsQuery.data),
    [settingsDraft, settingsQuery.data],
  );

  const setSettings = (key, value) => {
    setSettingsDraft((current) => ({ ...(current || settingsForm), [key]: value }));
    setSettingsError('');
  };

  const setCreate = (key, value) => {
    setCreateForm((current) => ({ ...current, [key]: value }));
    setCreateError('');
  };

  const handleSaveSettings = () => {
    const appointmentReminderHours = parseNumberList(settingsForm.appointmentReminderHours);
    const quotationFollowupDays = parseNumberList(settingsForm.quotationFollowupDays);

    if (!appointmentReminderHours.length || !quotationFollowupDays.length) {
      setSettingsError(t('qop.reminders.settings.invalidLists'));
      return;
    }

    updateReminderSettings.mutate({
      appointmentReminderHours,
      quotationFollowupDays,
      quotationExpiryWarnDays: Number(settingsForm.quotationExpiryWarnDays),
      defaultAppointmentChannel: settingsForm.defaultAppointmentChannel,
      defaultLanguage: settingsForm.defaultLanguage,
    }, {
      onSuccess: (response) => setSettingsDraft(settingsToForm(response.data)),
      onError: (err) => setSettingsError(err.message),
    });
  };

  const handleCreateReminder = () => {
    if (!createForm.appointmentId || !createForm.customerId || !createForm.scheduledAt) {
      setCreateError(t('qop.reminders.manual.required'));
      return;
    }

    createAppointmentReminder.mutate({
      appointmentId: createForm.appointmentId,
      customerId: createForm.customerId,
      channel: 'email',
      language: createForm.language,
      scheduledAt: new Date(createForm.scheduledAt).toISOString(),
      messageContent: createForm.messageContent,
      status: 'PENDING',
    }, {
      onSuccess: () => {
        setCreateForm({
          appointmentId: '',
          customerId: '',
          customerQuery: '',
          scheduledAt: localDateTimeValue(),
          language: settingsForm.defaultLanguage || 'de',
          messageContent: '',
        });
      },
      onError: (err) => setCreateError(err.message),
    });
  };

  const reminders = remindersQuery.data || [];
  const pendingCount = reminders.filter((item) => item.status === 'PENDING').length;
  const failedCount = reminders.filter((item) => item.status === 'FAILED').length;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
            <BellRing className="h-3.5 w-3.5" />
            {t('qop.reminders.badge')}
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-normal">
              {t('qop.reminders.title')}
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t('qop.reminders.subtitle')}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-background px-4 py-3 shadow-sm">
            <p className="text-xs text-muted-foreground">{t('qop.reminders.stats.pending')}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{pendingCount}</p>
          </div>
          <div className="rounded-lg border border-border bg-background px-4 py-3 shadow-sm">
            <p className="text-xs text-muted-foreground">{t('qop.reminders.stats.failed')}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{failedCount}</p>
          </div>
          <div className="rounded-lg border border-border bg-background px-4 py-3 shadow-sm">
            <p className="text-xs text-muted-foreground">{t('qop.reminders.stats.shown')}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{reminders.length}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="rounded-lg border border-border bg-background p-5 shadow-sm">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Settings2 className="h-4 w-4 text-muted-foreground" />
                {t('qop.reminders.settings.title')}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('qop.reminders.settings.description')}
              </p>
            </div>
            {settingsQuery.isFetching && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>

          {settingsQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-32" />
            </div>
          ) : settingsQuery.isError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {settingsQuery.error.message}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="appointment-hours">{t('qop.reminders.settings.appointmentHours')}</Label>
                <Input
                  id="appointment-hours"
                  value={settingsForm.appointmentReminderHours}
                  onChange={(event) => setSettings('appointmentReminderHours', event.target.value)}
                  placeholder="48,24,2"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">{t('qop.reminders.settings.appointmentHoursHelp')}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="followup-days">{t('qop.reminders.settings.followupDays')}</Label>
                <Input
                  id="followup-days"
                  value={settingsForm.quotationFollowupDays}
                  onChange={(event) => setSettings('quotationFollowupDays', event.target.value)}
                  placeholder="7,14,21"
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
                  value={settingsForm.quotationExpiryWarnDays}
                  onChange={(event) => setSettings('quotationExpiryWarnDays', event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('qop.reminders.settings.defaultLanguage')}</Label>
                <Select value={settingsForm.defaultLanguage} onValueChange={(value) => setSettings('defaultLanguage', value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((item) => <SelectItem key={item} value={item}>{item.toUpperCase()}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>{t('qop.reminders.settings.defaultChannel')}</Label>
                <Select value={settingsForm.defaultAppointmentChannel} onValueChange={(value) => setSettings('defaultAppointmentChannel', value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">{t('qop.reminders.channel.email')}</SelectItem>
                    <SelectItem value="both">{t('qop.reminders.channel.both')}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t('qop.reminders.settings.whatsappOutOfScope')}
                </p>
              </div>
              {(settingsError || updateReminderSettings.isError) && (
                <div className="sm:col-span-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  {settingsError || updateReminderSettings.error?.message}
                </div>
              )}
              <div className="sm:col-span-2 flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {updateReminderSettings.isSuccess
                    ? t('qop.reminders.settings.saved')
                    : t('qop.reminders.settings.applyNote')}
                </p>
                <Button onClick={handleSaveSettings} disabled={updateReminderSettings.isPending} className="gap-2">
                  <Save className="h-4 w-4" />
                  {updateReminderSettings.isPending ? t('qop.reminders.settings.saving') : t('qop.reminders.settings.save')}
                </Button>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-border bg-background p-5 shadow-sm">
          <div className="mb-5">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              {t('qop.reminders.manual.title')}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('qop.reminders.manual.description')}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="customer-search">{t('qop.reminders.manual.customerSearch')}</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="customer-search"
                  value={createForm.customerQuery}
                  onChange={(event) => setCreate('customerQuery', event.target.value)}
                  placeholder={t('qop.reminders.manual.customerPlaceholder')}
                  className="pl-9"
                />
              </div>
              {customersQuery.data?.length > 0 && (
                <div className="max-h-40 overflow-auto rounded-lg border border-border bg-background p-1 shadow-sm">
                  {customersQuery.data.map((customer) => (
                    <button
                      key={customer._id}
                      type="button"
                      onClick={() => {
                        setCreate('customerId', customer._id);
                        setCreate('customerQuery', customerLabel(customer));
                      }}
                      className="flex min-h-11 w-full cursor-pointer flex-col rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="font-medium">{customerLabel(customer)}</span>
                      <span className="text-xs text-muted-foreground">{customer.email || customer.phone || customer.mobile || customer._id}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customer-id">{t('qop.reminders.manual.customerId')}</Label>
              <Input
                id="customer-id"
                value={createForm.customerId}
                onChange={(event) => setCreate('customerId', event.target.value)}
                placeholder="64f..."
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="appointment-id">{t('qop.reminders.manual.appointmentId')}</Label>
              <Input
                id="appointment-id"
                value={createForm.appointmentId}
                onChange={(event) => setCreate('appointmentId', event.target.value)}
                placeholder="64f..."
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="scheduled-at">{t('qop.reminders.manual.sendAt')}</Label>
              <Input
                id="scheduled-at"
                type="datetime-local"
                value={createForm.scheduledAt}
                onChange={(event) => setCreate('scheduledAt', event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('qop.reminders.manual.language')}</Label>
              <Select value={createForm.language} onValueChange={(value) => setCreate('language', value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((item) => <SelectItem key={item} value={item}>{item.toUpperCase()}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('qop.reminders.manual.channel')}</Label>
              <Input value={t('qop.reminders.channel.email')} readOnly className="bg-muted/50" />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="message-content">{t('qop.reminders.manual.messageLabel')}</Label>
              <Textarea
                id="message-content"
                value={createForm.messageContent}
                onChange={(event) => setCreate('messageContent', event.target.value)}
                rows={3}
                placeholder={t('qop.reminders.manual.messagePlaceholder')}
              />
            </div>
            {(createError || createAppointmentReminder.isError) && (
              <div className="md:col-span-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {createError || createAppointmentReminder.error?.message}
              </div>
            )}
            <div className="md:col-span-2 flex justify-end">
              <Button onClick={handleCreateReminder} disabled={createAppointmentReminder.isPending} className="gap-2">
                <Plus className="h-4 w-4" />
                {createAppointmentReminder.isPending ? t('qop.reminders.manual.creating') : t('qop.reminders.manual.create')}
              </Button>
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-border bg-background shadow-sm">
        <div className="flex flex-col gap-4 border-b border-border p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold">{t('qop.reminders.table.title')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('qop.reminders.table.description')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('qop.reminders.table.allStatuses')}</SelectItem>
                {STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>{t(`qop.reminders.${STATUS_META[status]?.labelKey}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" aria-label={t('qop.reminders.table.refresh')} onClick={() => remindersQuery.refetch()}>
              <RefreshCw className={remindersQuery.isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            </Button>
          </div>
        </div>

        {remindersQuery.isError ? (
          <div className="m-5 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {remindersQuery.error.message}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('qop.reminders.table.scheduled')}</TableHead>
                <TableHead>{t('qop.reminders.table.customer')}</TableHead>
                <TableHead>{t('qop.reminders.table.channel')}</TableHead>
                <TableHead>{t('qop.reminders.table.status')}</TableHead>
                <TableHead>{t('qop.reminders.table.appointment')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {remindersQuery.isLoading ? (
                <LoadingRows />
              ) : reminders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-36 text-center">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-2 text-muted-foreground">
                      <BellRing className="h-8 w-8" />
                      <p className="font-medium text-foreground">{t('qop.reminders.table.emptyTitle')}</p>
                      <p className="text-sm">{t('qop.reminders.table.emptyBody')}</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : reminders.map((reminder) => (
                <TableRow key={reminder._id}>
                  <TableCell className="min-w-44">
                    <div className="font-medium">{formatDateTime(reminder.scheduledAt, language)}</div>
                    <div className="text-xs text-muted-foreground">{reminder.language?.toUpperCase() || 'DE'}</div>
                  </TableCell>
                  <TableCell className="min-w-56">
                    <div className="font-medium">{customerLabel(reminder.customerId)}</div>
                    <div className="max-w-80 truncate text-xs text-muted-foreground">
                      {reminder.messageContent || reminder.customerId?.email || reminder.customerId?._id || '-'}
                    </div>
                  </TableCell>
                  <TableCell className="capitalize">{reminder.channel}</TableCell>
                  <TableCell className="min-w-44">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={reminder.status} t={t} />
                      <Select
                        value={reminder.status}
                        onValueChange={(status) => updateAppointmentReminderStatus.mutate({
                          id: reminder._id,
                          data: { status },
                        })}
                        disabled={updateAppointmentReminderStatus.isPending}
                      >
                        <SelectTrigger className="h-8 w-32 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((status) => (
                            <SelectItem key={status} value={status}>{t(`qop.reminders.${STATUS_META[status]?.labelKey}`)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{reminder.appointmentId}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
