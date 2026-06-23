'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  CalendarClock,
  CheckCircle2,
  Download,
  Eye,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldAlert,
  Trash2,
  XCircle,
} from 'lucide-react';
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
import { PageHeader } from '@/shared/components/page-header';
import { showError, showSuccess } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import {
  DEFAULT_SCHEDULE_FORM,
  DEFAULT_TEMPLATE_FORM,
  NOTIFICATION_ADMIN_CATEGORIES,
  NOTIFICATION_ADMIN_CHANNELS,
  NOTIFICATION_ADMIN_LANGUAGES,
  NOTIFICATION_ADMIN_PERIODS,
  NOTIFICATION_ADMIN_PRIORITIES,
  NOTIFICATION_ADMIN_STATUSES,
  buildHistoryFilters,
  buildSchedulePayload,
  buildTemplatePayload,
  compactObject,
  deliveryRate,
  downloadCsvBlob,
  failureRate,
  formatDateTime,
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

function formatCount(value) {
  return new Intl.NumberFormat().format(value || 0);
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.QUEUED;
  const Icon = meta.Icon;
  return (
    <Badge variant={meta.variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {status || '-'}
    </Badge>
  );
}

function PanelShell({ title, description, actions, children }) {
  return (
    <section className="rounded-lg border bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b p-5 lg:flex-row lg:items-center lg:justify-between">
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
    <div className="flex min-h-40 flex-col items-center justify-center gap-2 p-8 text-center">
      <Icon className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm font-medium">{title}</p>
      {body && <p className="max-w-md text-sm text-muted-foreground">{body}</p>}
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="m-5 rounded-lg border border-destructive/30 bg-destructive/5 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="truncate">{message || 'Could not load notifications data.'}</span>
        </div>
        <Button size="sm" variant="outline" onClick={onRetry} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
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

function MetricTile({ label, value, tone = 'default', suffix }) {
  const toneClass = {
    default: 'border-border bg-background',
    warning: 'border-warning/30 bg-warning/5',
    danger: 'border-destructive/30 bg-destructive/5',
    success: 'border-success/30 bg-success/5',
  }[tone];

  return (
    <div className={cn('rounded-lg border px-4 py-3', toneClass)}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-normal">
        {value}
        {suffix && <span className="ml-1 text-sm text-muted-foreground">{suffix}</span>}
      </p>
    </div>
  );
}

function ChannelCheckboxes({ value, onChange, disabled }) {
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
          <span>{channel}</span>
        </label>
      ))}
    </div>
  );
}

function MetricsPanel({ metricsQuery, period, setPeriod, channel, setChannel, mutations }) {
  const normalized = useMemo(() => normalizeMetrics(metricsQuery.data), [metricsQuery.data]);
  const totals = normalized.totals;

  const flagStale = async () => {
    try {
      const result = await mutations.flagStaleDeliveries.mutateAsync({
        olderThanMinutes: 60,
        channels: ['EMAIL', 'WHATSAPP'],
      });
      showSuccess(`Flagged ${result?.modifiedCount || 0} delivery records for review.`);
    } catch (error) {
      showError(error);
    }
  };

  return (
    <PanelShell
      title="Delivery metrics"
      description="Channel health, latency, failure rates, and callback-review volume."
      actions={(
        <>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {NOTIFICATION_ADMIN_PERIODS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All channels</SelectItem>
              {NOTIFICATION_ADMIN_CHANNELS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => metricsQuery.refetch()} disabled={metricsQuery.isFetching}>
            <RefreshCw className={cn('h-4 w-4', metricsQuery.isFetching && 'animate-spin')} />
          </Button>
          <Button variant="outline" className="gap-2" onClick={flagStale} disabled={mutations.flagStaleDeliveries.isPending}>
            <ShieldAlert className="h-4 w-4" />
            Review stale
          </Button>
        </>
      )}
    >
      {metricsQuery.isLoading ? (
        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-lg" />)}
        </div>
      ) : metricsQuery.isError ? (
        <ErrorState message={metricsQuery.error?.message} onRetry={() => metricsQuery.refetch()} />
      ) : (
        <div className="space-y-5 p-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricTile label="Sent" value={formatCount(totals.sent)} />
            <MetricTile label="Delivered" value={formatCount(totals.delivered)} tone="success" />
            <MetricTile label="Failed" value={formatCount(totals.failed)} tone={totals.failed ? 'danger' : 'default'} />
            <MetricTile label="Bounced" value={formatCount(totals.bounced)} tone={totals.bounced ? 'warning' : 'default'} />
            <MetricTile label="Needs review" value={formatCount(totals.reviewRequired)} tone={totals.reviewRequired ? 'warning' : 'default'} />
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Channel</TableHead>
                <TableHead>Delivery rate</TableHead>
                <TableHead>Failure rate</TableHead>
                <TableHead>Average latency</TableHead>
                <TableHead>Review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {normalized.channels.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}>
                    <EmptyState title="No delivery metrics yet" body="Metrics appear as channel deliveries are processed." />
                  </TableCell>
                </TableRow>
              ) : normalized.channels.map((item) => (
                <TableRow key={item.channel}>
                  <TableCell className="font-medium">{item.channel}</TableCell>
                  <TableCell>{deliveryRate(item)}%</TableCell>
                  <TableCell>{failureRate(item)}%</TableCell>
                  <TableCell>{item.avgLatencyMs == null ? '-' : `${Math.round(item.avgLatencyMs)} ms`}</TableCell>
                  <TableCell>{formatCount(item.reviewRequired)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </PanelShell>
  );
}

function HistoryPanel({ historyQuery, filters, setters, locale, mutations }) {
  const [cursorStack, setCursorStack] = setters.cursor;
  const [selected, setSelected] = useState(null);
  const [anonymizeForm, setAnonymizeForm] = useState({ recipientId: '', email: '', phone: '' });
  const rows = historyQuery.data?.items ?? HISTORY_EMPTY;
  const pagination = historyQuery.data?.pagination ?? {};

  const exportCsv = async () => {
    try {
      const blob = await mutations.exportHistory.mutateAsync(filters);
      downloadCsvBlob(blob, `notification-history-${new Date().toISOString().slice(0, 10)}.csv`);
      showSuccess('Notification history export started.');
    } catch (error) {
      showError(error);
    }
  };

  const anonymize = async () => {
    const payload = compactObject(anonymizeForm);
    if (Object.keys(payload).length === 0) {
      showError('Provide a recipient ID, email, or phone number.');
      return;
    }

    try {
      const result = await mutations.anonymizeHistory.mutateAsync(payload);
      showSuccess(`Anonymized ${result?.modifiedCount || 0} history records.`);
      setAnonymizeForm({ recipientId: '', email: '', phone: '' });
    } catch (error) {
      showError(error);
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <PanelShell
        title="Notification history"
        description="Searchable delivery audit trail with masked recipients and timeline details."
        actions={(
          <>
            <Button variant="outline" className="gap-2" onClick={exportCsv} disabled={mutations.exportHistory.isPending}>
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Button variant="outline" size="icon" onClick={() => historyQuery.refetch()} disabled={historyQuery.isFetching}>
              <RefreshCw className={cn('h-4 w-4', historyQuery.isFetching && 'animate-spin')} />
            </Button>
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
              placeholder="Search recipient, type, source, or subject"
              className="pl-9"
            />
          </div>
          <Select value={setters.channel[0]} onValueChange={(value) => { setters.channel[1](value); setCursorStack([]); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All channels</SelectItem>
              {NOTIFICATION_ADMIN_CHANNELS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={setters.status[0]} onValueChange={(value) => { setters.status[1](value); setCursorStack([]); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              {NOTIFICATION_ADMIN_STATUSES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {historyQuery.isError ? (
          <ErrorState message={historyQuery.error?.message} onRetry={() => historyQuery.refetch()} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Created</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Subject</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historyQuery.isLoading ? (
                <LoadingRows columns={6} rows={7} />
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <EmptyState title="No matching history" body="Try a different search, channel, or delivery status." />
                  </TableCell>
                </TableRow>
              ) : rows.map((row) => (
                <TableRow
                  key={row.deliveryId}
                  className={cn('cursor-pointer', selected?.deliveryId === row.deliveryId && 'bg-muted/60')}
                  onClick={() => setSelected(row)}
                >
                  <TableCell className="min-w-36">{formatDateTime(row.createdAt, locale)}</TableCell>
                  <TableCell className="min-w-48">
                    <div className="font-medium">{row.recipient?.email || row.recipient?.phone || row.recipient?.userId || '-'}</div>
                    <div className="text-xs text-muted-foreground">{row.recipient?.userId || ''}</div>
                  </TableCell>
                  <TableCell>{row.type || '-'}</TableCell>
                  <TableCell><Badge variant="outline">{row.channel}</Badge></TableCell>
                  <TableCell><StatusBadge status={row.status} /></TableCell>
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
            {historyQuery.isFetching && !historyQuery.isLoading ? 'Refreshing...' : `${rows.length} rows on this page`}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={cursorStack.length === 0} onClick={() => setCursorStack((stack) => stack.slice(0, -1))}>
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!pagination.hasNext || !pagination.nextCursor}
              onClick={() => setCursorStack((stack) => [...stack, pagination.nextCursor])}
            >
              Next
            </Button>
          </div>
        </div>
      </PanelShell>

      <div className="space-y-5">
        <PanelShell title="Delivery detail" description="Timeline and source context for the selected record.">
          {selected ? (
            <div className="space-y-5 p-5">
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Timeline</p>
                <div className="space-y-2">
                  {(selected.statusTimeline || []).map((item) => (
                    <div key={`${item.status}-${item.at}`} className="flex items-start justify-between gap-3 rounded-lg border bg-background px-3 py-2">
                      <StatusBadge status={item.status} />
                      <span className="text-right text-xs text-muted-foreground">{formatDateTime(item.at, locale)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <p><span className="text-muted-foreground">Template:</span> {selected.content?.templateId || '-'} v{selected.content?.templateVersion || '-'}</p>
                <p><span className="text-muted-foreground">Source:</span> {[selected.source?.module, selected.source?.event].filter(Boolean).join(' / ') || '-'}</p>
                <p><span className="text-muted-foreground">Failure:</span> {selected.failureReason || '-'}</p>
                <p><span className="text-muted-foreground">Review:</span> {selected.reviewRequiredAt ? formatDateTime(selected.reviewRequiredAt, locale) : '-'}</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-3 text-sm leading-6 text-muted-foreground">
                {selected.content?.bodyPreview || 'No body preview stored.'}
              </div>
            </div>
          ) : (
            <EmptyState icon={Eye} title="Select a history row" body="Details stay out of the table until you need them." />
          )}
        </PanelShell>

        <PanelShell title="GDPR anonymization" description="Remove recipient identifiers while preserving audit counts.">
          <div className="space-y-3 p-5">
            <Input
              value={anonymizeForm.recipientId}
              onChange={(event) => setAnonymizeForm((current) => ({ ...current, recipientId: event.target.value }))}
              placeholder="Recipient user ID"
            />
            <Input
              value={anonymizeForm.email}
              onChange={(event) => setAnonymizeForm((current) => ({ ...current, email: event.target.value }))}
              placeholder="Email"
            />
            <Input
              value={anonymizeForm.phone}
              onChange={(event) => setAnonymizeForm((current) => ({ ...current, phone: event.target.value }))}
              placeholder="Phone"
            />
            <Button className="w-full gap-2" variant="destructive" onClick={anonymize} disabled={mutations.anonymizeHistory.isPending}>
              <Trash2 className="h-4 w-4" />
              Anonymize history
            </Button>
          </div>
        </PanelShell>
      </div>
    </div>
  );
}

function TemplatesPanel({ templatesQuery, filters, setFilters, mutations }) {
  const [form, setForm] = useState({ ...DEFAULT_TEMPLATE_FORM });
  const [sampleData, setSampleData] = useState('{"customer":{"name":"Muster AG"},"appointment":{"date":"2026-06-23"}}');
  const [preview, setPreview] = useState(null);
  const templates = templatesQuery.data?.items ?? TEMPLATE_EMPTY;
  const editing = Boolean(form.id);

  const saveTemplate = async () => {
    const result = buildTemplatePayload(form);
    if (result.error) {
      showError(result.error);
      return;
    }

    try {
      if (editing) {
        await mutations.updateTemplate.mutateAsync({ id: form.id, payload: result.payload });
        showSuccess('Notification template version saved.');
      } else {
        await mutations.createTemplate.mutateAsync(result.payload);
        showSuccess('Notification template created.');
      }
      setForm({ ...DEFAULT_TEMPLATE_FORM });
      setPreview(null);
    } catch (error) {
      showError(error);
    }
  };

  const previewTemplate = async () => {
    if (!form.id) {
      showError('Save or select a template before previewing.');
      return;
    }
    const parsed = parseJsonObject(sampleData, 'Sample data');
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

  const removeTemplate = async (id) => {
    try {
      await mutations.removeTemplate.mutateAsync(id);
      showSuccess('Notification template archived.');
      if (form.id === id) setForm({ ...DEFAULT_TEMPLATE_FORM });
    } catch (error) {
      showError(error);
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)]">
      <PanelShell
        title="Template library"
        description="Versioned templates per type, channel, and language."
        actions={(
          <>
            <Select value={filters.channel} onValueChange={(value) => setFilters((current) => ({ ...current, channel: value }))}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All channels</SelectItem>
                {NOTIFICATION_ADMIN_CHANNELS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.language} onValueChange={(value) => setFilters((current) => ({ ...current, language: value }))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                {NOTIFICATION_ADMIN_LANGUAGES.map((item) => <SelectItem key={item} value={item}>{item.toUpperCase()}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => templatesQuery.refetch()} disabled={templatesQuery.isFetching}>
              <RefreshCw className={cn('h-4 w-4', templatesQuery.isFetching && 'animate-spin')} />
            </Button>
          </>
        )}
      >
        {templatesQuery.isError ? (
          <ErrorState message={templatesQuery.error?.message} onRetry={() => templatesQuery.refetch()} />
        ) : (
          <div className="divide-y">
            {templatesQuery.isLoading ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-20 rounded-lg" />)}
              </div>
            ) : templates.length === 0 ? (
              <EmptyState title="No templates found" body="Create the first channel template from the editor." />
            ) : templates.map((template) => (
              <div key={template._id} className="flex items-start justify-between gap-3 p-4">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setForm(templateToForm(template)); setPreview(null); }}>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium">{template.type}</p>
                    <Badge variant="outline">{template.channel}</Badge>
                    <Badge variant={template.isActive ? 'success' : 'secondary'}>v{template.version}</Badge>
                    <span className="text-xs uppercase text-muted-foreground">{template.language}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{template.subjectTemplate || template.bodyTemplate}</p>
                </button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removeTemplate(template._id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </PanelShell>

      <PanelShell
        title={editing ? 'Edit template version' : 'Create template'}
        description="Missing placeholders render as empty strings. Updating creates a new active version."
        actions={editing && (
          <Button variant="outline" size="sm" onClick={() => { setForm({ ...DEFAULT_TEMPLATE_FORM }); setPreview(null); }}>
            New template
          </Button>
        )}
      >
        <div className="grid gap-4 p-5 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Notification type</Label>
            <Input value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))} placeholder="appointment_reminder" />
          </div>
          <div className="space-y-1.5">
            <Label>Channel</Label>
            <Select value={form.channel} onValueChange={(value) => setForm((current) => ({ ...current, channel: value }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{NOTIFICATION_ADMIN_CHANNELS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Language</Label>
            <Select value={form.language} onValueChange={(value) => setForm((current) => ({ ...current, language: value }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{NOTIFICATION_ADMIN_LANGUAGES.map((item) => <SelectItem key={item} value={item}>{item.toUpperCase()}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Input value={form.subjectTemplate} onChange={(event) => setForm((current) => ({ ...current, subjectTemplate: event.target.value }))} placeholder="{{customer.name}} reminder" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Body</Label>
            <Textarea value={form.bodyTemplate} onChange={(event) => setForm((current) => ({ ...current, bodyTemplate: event.target.value }))} rows={4} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Email HTML body</Label>
            <Textarea value={form.bodyHtmlTemplate} onChange={(event) => setForm((current) => ({ ...current, bodyHtmlTemplate: event.target.value }))} rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label>WhatsApp template ID</Label>
            <Input value={form.whatsappTemplateId} onChange={(event) => setForm((current) => ({ ...current, whatsappTemplateId: event.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Variables JSON</Label>
            <Textarea value={form.variables} onChange={(event) => setForm((current) => ({ ...current, variables: event.target.value }))} rows={3} className="font-mono text-xs" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Preview sample JSON</Label>
            <Textarea value={sampleData} onChange={(event) => setSampleData(event.target.value)} rows={3} className="font-mono text-xs" />
          </div>
          {preview && (
            <div className="md:col-span-2 rounded-lg border bg-background p-4">
              <p className="text-sm font-medium">{preview.subject || 'No subject'}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{preview.body || preview.bodyHtml || 'No body'}</p>
            </div>
          )}
          <div className="md:col-span-2 flex flex-wrap justify-end gap-2">
            <Button variant="outline" className="gap-2" onClick={previewTemplate} disabled={mutations.previewTemplate.isPending || !editing}>
              <Eye className="h-4 w-4" />
              Preview
            </Button>
            <Button className="gap-2" onClick={saveTemplate} disabled={mutations.createTemplate.isPending || mutations.updateTemplate.isPending}>
              <Save className="h-4 w-4" />
              {editing ? 'Save version' : 'Create'}
            </Button>
          </div>
        </div>
      </PanelShell>
    </div>
  );
}

function ScheduledPanel({ scheduledQuery, status, setStatus, mutations, locale }) {
  const [form, setForm] = useState(withDefaultScheduleTime());
  const rows = scheduledQuery.data?.items ?? SCHEDULE_EMPTY;

  const createSchedule = async () => {
    const result = buildSchedulePayload(form);
    if (result.error) {
      showError(result.error);
      return;
    }

    try {
      await mutations.createScheduled.mutateAsync(result.payload);
      showSuccess('Scheduled notification created.');
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

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(420px,0.8fr)_minmax(0,1.2fr)]">
      <PanelShell title="Create schedule" description="One-time or recurring notifications using the normal delivery pipeline.">
        <div className="grid gap-4 p-5 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Notification type</Label>
            <Input value={form.notificationType} onChange={(event) => setForm((current) => ({ ...current, notificationType: event.target.value }))} placeholder="daily_reminder" />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={form.category} onValueChange={(value) => setForm((current) => ({ ...current, category: value }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{NOTIFICATION_ADMIN_CATEGORIES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Schedule type</Label>
            <Select value={form.scheduleType} onValueChange={(value) => setForm((current) => ({ ...current, scheduleType: value }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ONE_TIME">One-time</SelectItem>
                <SelectItem value="RECURRING">Recurring</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select value={form.priority} onValueChange={(value) => setForm((current) => ({ ...current, priority: value }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{NOTIFICATION_ADMIN_PRIORITIES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {form.scheduleType === 'ONE_TIME' ? (
            <div className="space-y-1.5">
              <Label>Scheduled at</Label>
              <Input type="datetime-local" value={form.scheduledAt} onChange={(event) => setForm((current) => ({ ...current, scheduledAt: event.target.value }))} />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Cron expression</Label>
              <Input value={form.cronExpression} onChange={(event) => setForm((current) => ({ ...current, cronExpression: event.target.value }))} className="font-mono" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Timezone</Label>
            <Input value={form.timezone} onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Recipient IDs</Label>
            <Input value={form.recipientIds} onChange={(event) => setForm((current) => ({ ...current, recipientIds: event.target.value }))} placeholder="comma-separated user IDs" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Channels</Label>
            <ChannelCheckboxes value={form.channels} onChange={(channels) => setForm((current) => ({ ...current, channels }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Deep link</Label>
            <Input value={form.deepLink} onChange={(event) => setForm((current) => ({ ...current, deepLink: event.target.value }))} placeholder="/field-ops/orders/..." />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Body</Label>
            <Textarea value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} rows={3} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Extra payload JSON</Label>
            <Textarea value={form.payloadJson} onChange={(event) => setForm((current) => ({ ...current, payloadJson: event.target.value }))} rows={3} className="font-mono text-xs" />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <Button className="gap-2" onClick={createSchedule} disabled={mutations.createScheduled.isPending}>
              <Plus className="h-4 w-4" />
              Create schedule
            </Button>
          </div>
        </div>
      </PanelShell>

      <PanelShell
        title="Scheduled notifications"
        description="Manage active, paused, completed, and cancelled schedule records."
        actions={(
          <>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                {['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => scheduledQuery.refetch()} disabled={scheduledQuery.isFetching}>
              <RefreshCw className={cn('h-4 w-4', scheduledQuery.isFetching && 'animate-spin')} />
            </Button>
          </>
        )}
      >
        {scheduledQuery.isError ? (
          <ErrorState message={scheduledQuery.error?.message} onRetry={() => scheduledQuery.refetch()} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Next dispatch</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scheduledQuery.isLoading ? (
                <LoadingRows columns={5} rows={6} />
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}>
                    <EmptyState icon={CalendarClock} title="No schedules found" body="Create a reminder or recurring batch notification." />
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
                    <div>{row.scheduleType}</div>
                    <div className="text-xs text-muted-foreground">{row.cronExpression || row.scheduledAt || '-'}</div>
                  </TableCell>
                  <TableCell><StatusBadge status={row.status} /></TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {row.status === 'ACTIVE' && (
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => runScheduleAction(mutations.pauseScheduled, row._id, 'Schedule paused.')}>
                          <PauseCircle className="h-4 w-4" />
                        </Button>
                      )}
                      {row.status === 'PAUSED' && (
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => runScheduleAction(mutations.resumeScheduled, row._id, 'Schedule resumed.')}>
                          <PlayCircle className="h-4 w-4" />
                        </Button>
                      )}
                      {['ACTIVE', 'PAUSED'].includes(row.status) && (
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => runScheduleAction(mutations.cancelScheduled, row._id, 'Schedule cancelled.')}>
                          <XCircle className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </PanelShell>
    </div>
  );
}

export function NotificationAdminConsole() {
  const { locale } = useLanguage();
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
    limit: 50,
    status: scheduleStatus === 'ALL' ? '' : scheduleStatus,
  }), [scheduleStatus]);

  const metricsQuery = useNotificationMetrics(metricsFilters);
  const historyQuery = useNotificationHistory(historyFilters);
  const templatesQuery = useNotificationTemplates(templateQueryFilters);
  const scheduledQuery = useScheduledNotifications(scheduledFilters);
  const mutations = useNotificationAdminMutations();

  return (
    <div className="flex w-full min-w-0 flex-col gap-6 p-6">
      <PageHeader
        title="Notification operations"
        description="Delivery health, audit history, templates, and schedules for the notification module."
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
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </PageHeader>

      <Tabs defaultValue="history" className="gap-5">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="schedules">Schedules</TabsTrigger>
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
          />
        </TabsContent>

        <TabsContent value="templates">
          <TemplatesPanel
            templatesQuery={templatesQuery}
            filters={templateFilters}
            setFilters={setTemplateFilters}
            mutations={mutations}
          />
        </TabsContent>

        <TabsContent value="schedules">
          <ScheduledPanel
            scheduledQuery={scheduledQuery}
            status={scheduleStatus}
            setStatus={setScheduleStatus}
            mutations={mutations}
            locale={locale}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
