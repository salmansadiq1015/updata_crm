'use client';

import { useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarCheck,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  FileDown,
  FileSpreadsheet,
  Filter,
  Hourglass,
  Inbox,
  Loader2,
  Plus,
  Save,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TimerReset,
  Upload,
  Users,
  X,
  Briefcase,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OfficeTimeEntryDialog } from './office-time-entry-dialog';
import { Textarea } from '@/components/ui/textarea';
import { PermissionGate } from '@/shared/components/permission-gate';
import { formatDate } from '@/lib/formatters';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { FieldOpsTimeTable } from './field-ops-time-table';
import {
  useTimeTrackingAiContext,
  useTimeTrackingAnalytics,
  useTimeTrackingCalendar,
  useTimeTrackingLeaveRequests,
  useTimeTrackingOverview,
  useTimeTrackingVacationBalances,
} from '@/modules/field-ops/hooks/use-time-tracking-queries';
import { useTimeTrackingMutations } from '@/modules/field-ops/hooks/use-time-tracking-mutations';
import { useTimeTrackingRealtime } from '@/modules/field-ops/hooks/use-time-tracking-realtime';

const LEAVE_TYPES = ['VACATION', 'SICK', 'OTHER_ABSENCE', 'PUBLIC_HOLIDAY', 'COMPANY_CLOSURE'];
const LEAVE_STATUS_VARIANT = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'destructive',
  CANCELLED: 'secondary',
};
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50];
const LOW_BALANCE_THRESHOLD = 5;
const GROUP_BY_OPTIONS = ['employee', 'day', 'week', 'month', 'project', 'job', 'customer'];
const IMPORT_REFERENCE_COLUMNS = [
  'orderId',
  'technicianId',
  'date',
  'startTime',
  'endTime',
  'breakDurationMin',
  'activityType',
  'note',
];

function toDateInputValue(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function monthStart() {
  const today = new Date();
  return toDateInputValue(new Date(today.getFullYear(), today.getMonth(), 1));
}

function monthEnd() {
  const today = new Date();
  return toDateInputValue(new Date(today.getFullYear(), today.getMonth() + 1, 0));
}

function hoursLabel(value) {
  return `${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} h`;
}

function employeeName(employee) {
  if (!employee) return '-';
  const source = typeof employee === 'object' ? employee : {};
  const fullName = `${source.firstName || ''} ${source.lastName || ''}`.trim();
  return source.employeeName || source.name || fullName || source.email || source.employeeId || source._id || String(employee || '-');
}

function normalizeSearch(value) {
  return String(value || '').trim().toLowerCase();
}

function apiMessage(error, fallback) {
  if (!error) return null;
  return error.message || fallback;
}

function usePagedItems(items, initialPageSize = 10) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageItems = useMemo(
    () => items.slice((safePage - 1) * pageSize, safePage * pageSize),
    [items, safePage, pageSize],
  );
  const setSize = (value) => {
    setPageSize(Number(value));
    setPage(1);
  };
  return { page: safePage, setPage, pageSize, setPageSize: setSize, pageCount, pageItems, total: items.length };
}

function PremiumHero({ title, description, count, dateFrom, dateTo, onDateFromChange, onDateToChange, onImport, onExport, exporting, t }) {
  return (
    <section className="relative overflow-hidden rounded-xl border border-border/60 bg-card/80 shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(168,85,247,0.13),transparent_34%,rgba(14,165,233,0.11)_68%,rgba(16,185,129,0.08))]" />
      <div className="relative flex flex-col gap-5 p-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            {t('fieldOps.time.commandLabel', 'Workforce Command Center')}
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary/15 px-2 text-xs font-semibold text-primary">
                {count}
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input className="h-10 w-full rounded-lg bg-background/70 sm:w-40" type="date" value={dateFrom} onChange={(event) => onDateFromChange(event.target.value)} />
          <Input className="h-10 w-full rounded-lg bg-background/70 sm:w-40" type="date" value={dateTo} onChange={(event) => onDateToChange(event.target.value)} />
          <Button size="sm" variant="outline" className="h-10 gap-2" onClick={onImport}>
            <Upload className="h-4 w-4" />
            {t('fieldOps.time.actions.import', 'Import')}
          </Button>
          <Button size="sm" className="h-10 gap-2 bg-gradient-to-r from-brand-500 via-sky-500 to-emerald-500 text-white shadow-[0_0_28px_rgba(14,165,233,0.28)]" disabled={exporting} onClick={onExport}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {exporting ? t('fieldOps.time.actions.exporting', 'Exporting...') : t('fieldOps.time.actions.export', 'Export')}
          </Button>
        </div>
      </div>
    </section>
  );
}

function PremiumStatCard({ icon: Icon, label, value, tone = 'default', sub }) {
  const toneClass = {
    default: 'text-foreground',
    success: 'text-emerald-500',
    warning: 'text-amber-500',
    danger: 'text-red-500',
    info: 'text-sky-500',
  }[tone];
  const glowClass = {
    default: 'from-slate-400/10 via-transparent to-transparent',
    success: 'from-emerald-400/18 via-transparent to-transparent',
    warning: 'from-amber-400/18 via-transparent to-transparent',
    danger: 'from-red-500/16 via-transparent to-transparent',
    info: 'from-sky-400/18 via-transparent to-transparent',
  }[tone];

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border/60 bg-card/85 px-4 py-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_20px_60px_rgba(15,23,42,0.16)]">
      <div className={cn('absolute inset-0 bg-gradient-to-br opacity-100 transition group-hover:opacity-100', glowClass)} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase text-muted-foreground">{label}</p>
          <p className={cn('text-2xl font-bold tabular-nums', toneClass)}>{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
        <div className="rounded-lg border border-border/60 bg-background/55 p-2 text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function PremiumPanel({ title, icon: Icon, action, children, className }) {
  return (
    <section className={cn('overflow-hidden rounded-xl border border-border/60 bg-card/85 shadow-sm', className)}>
      {(title || action) && (
        <div className="flex min-h-14 items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {Icon && <Icon className="h-4 w-4 shrink-0 text-primary" />}
            {title && <h3 className="truncate text-sm font-semibold">{title}</h3>}
          </div>
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

function LoadingRows({ rows = 4 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-11 w-full rounded-lg" />
      ))}
    </div>
  );
}

function PremiumEmptyState({ icon: Icon = Inbox, title, description, action }) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/10 px-4 py-8 text-center">
      <div className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 shadow-[0_0_34px_rgba(168,85,247,0.18)]">
        <span className="absolute inset-1 rounded-lg border border-primary/15 animate-pulse" />
        <Icon className="relative h-7 w-7 text-primary" />
      </div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function ErrorInline({ message }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }) {
  return (
    <div className="relative min-w-0 flex-1 sm:max-w-xs">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input className="h-9 rounded-lg bg-background/70 pl-9" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  );
}

function ToolbarSelect({ value, onValueChange, options, className = 'w-44' }) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={cn('h-9 rounded-lg bg-background/70 text-xs', className)}>
        <Filter className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TabToolbar({ search, onSearch, searchPlaceholder, filters = [], action }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card/70 p-3 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
        <SearchBox value={search} onChange={onSearch} placeholder={searchPlaceholder} />
        <div className="flex flex-wrap gap-2">
          {filters.map(({ key, ...filter }) => (
            <ToolbarSelect key={key} {...filter} />
          ))}
        </div>
      </div>
      {action && <div className="flex shrink-0 justify-end">{action}</div>}
    </div>
  );
}

function PremiumPagination({ page, pageSize, pageCount, total, onPageChange, onPageSizeChange, de }) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-col gap-3 border-t border-border/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="tabular-nums">{start}-{end} {de ? 'von' : 'of'} {total}</span>
        <Select value={String(pageSize)} onValueChange={onPageSizeChange}>
          <SelectTrigger className="h-8 w-20 rounded-lg bg-background/70 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((size) => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-1">
        <span className="mr-2 text-xs text-muted-foreground tabular-nums">{page} / {pageCount}</span>
        <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" disabled={page <= 1} onClick={() => onPageChange(1)} aria-label={de ? 'Erste Seite' : 'First page'}>
          <ChevronsLeft className="h-3.5 w-3.5" />
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label={de ? 'Vorherige Seite' : 'Previous page'}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} aria-label={de ? 'Nächste Seite' : 'Next page'}>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" disabled={page >= pageCount} onClick={() => onPageChange(pageCount)} aria-label={de ? 'Letzte Seite' : 'Last page'}>
          <ChevronsRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function DataShell({ children, pagination }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card/85">
      <div className="overflow-x-auto">{children}</div>
      {pagination}
    </div>
  );
}

function GroupBars({ groups, de, withControls = false }) {
  const [search, setSearch] = useState('');
  const searchTerm = normalizeSearch(search);
  const filtered = useMemo(
    () => (groups || []).filter((group) => normalizeSearch(`${group.label} ${group.key}`).includes(searchTerm)),
    [groups, searchTerm],
  );
  const pagination = usePagedItems(filtered, 5);

  if (!groups?.length) {
    return <PremiumEmptyState icon={BarChart3} title={de ? 'Keine Gruppierung verfügbar.' : 'No grouping data available.'} description={de ? 'Passen Sie den Zeitraum oder Filter an.' : 'Adjust the period or filters.'} />;
  }

  const rows = withControls ? pagination.pageItems : filtered.slice(0, 12);
  const max = Math.max(...filtered.map((group) => Number(group.actualMinutes || 0)), 1);

  return (
    <div className="space-y-3">
      {withControls && (
        <TabToolbar
          search={search}
          onSearch={setSearch}
          searchPlaceholder={de ? 'Gruppierung suchen...' : 'Search grouping...'}
        />
      )}
      {!filtered.length ? (
        <PremiumEmptyState icon={Search} title={de ? 'Keine Treffer gefunden.' : 'No matches found.'} description={de ? 'Suchbegriff oder Filter zurücksetzen.' : 'Reset search or filters.'} />
      ) : (
        <div className="space-y-3">
          {rows.map((group) => {
            const width = `${Math.max((Number(group.actualMinutes || 0) / max) * 100, 4)}%`;
            return (
              <div key={group.key} className="space-y-1.5 rounded-lg border border-border/50 bg-background/35 p-3">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate font-semibold">{group.label}</span>
                  <span className="font-mono text-muted-foreground">{hoursLabel(group.actualHours)}</span>
                </div>
                <div className="h-2.5 rounded-full bg-muted">
                  <div className="h-2.5 rounded-full bg-gradient-to-r from-brand-500 via-sky-500 to-emerald-500 shadow-[0_0_16px_rgba(14,165,233,0.28)]" style={{ width }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
      {withControls && filtered.length > 0 && (
        <PremiumPagination
          de={de}
          page={pagination.page}
          pageSize={pagination.pageSize}
          pageCount={pagination.pageCount}
          total={pagination.total}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
        />
      )}
    </div>
  );
}

function ImportTimeEntriesDialog({ open, onOpenChange, mutations, t }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [summary, setSummary] = useState(null);
  const importMutation = mutations.importTimeEntries;
  const isBusy = importMutation.isPending || mutations.downloadImportTemplate.isPending;

  const runImport = (dryRun) => {
    if (!file) return;
    importMutation.mutate({ file, dryRun }, { onSuccess: setSummary });
  };

  const reset = (nextOpen) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setFile(null);
      setSummary(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            {t('fieldOps.time.import.title', 'Import time entries')}
          </DialogTitle>
          <DialogDescription>
            {t('fieldOps.time.import.description', 'Validate a CSV file, review row errors, then import it as time entries.')}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold">{t('fieldOps.time.import.referenceTitle', 'Reference file')}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {IMPORT_REFERENCE_COLUMNS.join(', ')}
                </p>
              </div>
              <Button variant="outline" className="gap-2" onClick={() => mutations.downloadImportTemplate.mutate()} disabled={isBusy}>
                <FileDown className="h-4 w-4" />
                {mutations.downloadImportTemplate.isPending
                  ? t('fieldOps.time.import.downloadingTemplate', 'Downloading...')
                  : t('fieldOps.time.import.downloadTemplate', 'Download template')}
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
            <div className="space-y-2">
              <Label>{t('fieldOps.time.import.csvFile', 'CSV file')}</Label>
              <Input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => {
                  setFile(event.target.files?.[0] || null);
                  setSummary(null);
                }}
              />
            </div>
            <Button variant="outline" className="gap-2" disabled={!file || isBusy} onClick={() => runImport(true)}>
              {importMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {importMutation.isPending ? t('fieldOps.time.import.validating', 'Validating...') : t('fieldOps.time.import.validate', 'Validate')}
            </Button>
            <Button className="gap-2" disabled={!file || isBusy || Number(summary?.failed || 0) > 0} onClick={() => runImport(false)}>
              {importMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {importMutation.isPending ? t('fieldOps.time.import.importing', 'Importing...') : t('fieldOps.time.import.importAction', 'Import')}
            </Button>
          </div>

          {summary && (
            <div className="space-y-3 rounded-xl border border-border/60 bg-background/50 p-4">
              <div className="grid gap-2 sm:grid-cols-4">
                <Badge variant="outline">{t('fieldOps.time.import.rows', 'Rows')}: {summary.totalRows}</Badge>
                <Badge variant="outline">{t('fieldOps.time.import.valid', 'Valid')}: {summary.validRows}</Badge>
                <Badge variant="success">{t('fieldOps.time.import.created', 'Created')}: {summary.created}</Badge>
                <Badge variant={summary.failed > 0 ? 'destructive' : 'outline'}>{t('fieldOps.time.import.errors', 'Errors')}: {summary.failed}</Badge>
              </div>
              {summary.rowErrors?.length ? (
                <div className="max-h-48 overflow-auto rounded-lg border border-destructive/20">
                  <table className="w-full min-w-[520px] text-xs">
                    <thead className="bg-destructive/10 text-destructive">
                      <tr>
                        <th className="px-3 py-2 text-left">{t('fieldOps.time.import.row', 'Row')}</th>
                        <th className="px-3 py-2 text-left">{t('fieldOps.time.import.field', 'Field')}</th>
                        <th className="px-3 py-2 text-left">{t('fieldOps.time.import.message', 'Message')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.rowErrors.slice(0, 100).map((error, index) => (
                        <tr key={`${error.row}-${error.field}-${index}`} className="border-t">
                          <td className="px-3 py-2 font-mono">{error.row}</td>
                          <td className="px-3 py-2 font-mono">{error.field}</td>
                          <td className="px-3 py-2">{error.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600">
                  {summary.dryRun
                    ? t('fieldOps.time.import.ready', 'File is ready to import.')
                    : t('fieldOps.time.import.completed', 'Import completed.')}
                </div>
              )}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => reset(false)}>{t('fieldOps.time.import.close', 'Close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LeaveRequestDialog({ open, onOpenChange, employees, onSubmit, isLoading, de }) {
  const [form, setForm] = useState({
    employeeId: 'self',
    leaveType: 'VACATION',
    startDate: toDateInputValue(new Date()),
    endDate: toDateInputValue(new Date()),
    unit: 'DAYS',
    hours: '',
    reason: '',
  });

  const submit = () => {
    const payload = {
      leaveType: form.leaveType,
      startDate: form.startDate,
      endDate: form.endDate,
      unit: form.unit,
      reason: form.reason || null,
    };
    if (form.employeeId !== 'self') payload.employeeId = form.employeeId;
    if (form.unit === 'HOURS') payload.hours = Number(form.hours);
    onSubmit(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{de ? 'Abwesenheit erfassen' : 'Create leave request'}</DialogTitle>
          <DialogDescription>
            {de ? 'Urlaub, Krankheit oder andere Abwesenheiten blockieren nach Genehmigung den Kalender.' : 'Approved absences block the employee calendar.'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{de ? 'Mitarbeiter' : 'Employee'}</Label>
              <Select value={form.employeeId} onValueChange={(value) => setForm((current) => ({ ...current, employeeId: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="self">{de ? 'Eigenes Profil' : 'Current user'}</SelectItem>
                  {employees.map((employee) => (
                    <SelectItem key={employee.employeeId} value={employee.employeeId}>
                      {employeeName(employee)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{de ? 'Typ' : 'Type'}</Label>
              <Select value={form.leaveType} onValueChange={(value) => setForm((current) => ({ ...current, leaveType: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAVE_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>{de ? 'Von' : 'From'}</Label>
              <Input type="date" value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>{de ? 'Bis' : 'To'}</Label>
              <Input type="date" value={form.endDate} onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>{de ? 'Einheit' : 'Unit'}</Label>
              <Select value={form.unit} onValueChange={(value) => setForm((current) => ({ ...current, unit: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DAYS">{de ? 'Tage' : 'Days'}</SelectItem>
                  <SelectItem value="HOURS">{de ? 'Stunden' : 'Hours'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {form.unit === 'HOURS' && (
            <div className="space-y-2">
              <Label>{de ? 'Stunden' : 'Hours'}</Label>
              <Input type="number" min="0.25" step="0.25" value={form.hours} onChange={(event) => setForm((current) => ({ ...current, hours: event.target.value }))} />
            </div>
          )}
          <div className="space-y-2">
            <Label>{de ? 'Grund' : 'Reason'}</Label>
            <Textarea value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{de ? 'Abbrechen' : 'Cancel'}</Button>
          <Button onClick={submit} disabled={isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {de ? 'Erstellen' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectLeaveDialog({ request, onOpenChange, onSubmit, isLoading, de }) {
  const [reason, setReason] = useState('');
  return (
    <Dialog open={!!request} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{de ? 'Abwesenheit ablehnen' : 'Reject leave request'}</DialogTitle>
          <DialogDescription>{request ? `${employeeName(request.employeeId)} - ${request.leaveType}` : ''}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Label>{de ? 'Begründung' : 'Decision note'}</Label>
          <Textarea className="mt-2" value={reason} onChange={(event) => setReason(event.target.value)} />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{de ? 'Abbrechen' : 'Cancel'}</Button>
          <Button variant="destructive" disabled={isLoading || reason.trim().length < 3} onClick={() => onSubmit(reason)}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
            {de ? 'Ablehnen' : 'Reject'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BalanceDialog({ balance, onOpenChange, onSubmit, isLoading, de }) {
  const [form, setForm] = useState({
    annualEntitlementDays: String(balance?.annualEntitlementDays ?? 25),
    carryoverDays: String(balance?.carryoverDays ?? 0),
    manualAdjustmentDays: String(balance?.manualAdjustmentDays ?? 0),
    notes: balance?.notes || '',
  });

  if (!balance) return null;

  return (
    <Dialog open={!!balance} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{de ? 'Ferienguthaben bearbeiten' : 'Edit vacation balance'}</DialogTitle>
          <DialogDescription>{employeeName(balance)} - {balance.year}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>{de ? 'Jahresanspruch' : 'Entitlement'}</Label>
              <Input type="number" min="0" step="0.5" value={form.annualEntitlementDays} onChange={(event) => setForm((current) => ({ ...current, annualEntitlementDays: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>{de ? 'Übertrag' : 'Carryover'}</Label>
              <Input type="number" step="0.5" value={form.carryoverDays} onChange={(event) => setForm((current) => ({ ...current, carryoverDays: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>{de ? 'Korrektur' : 'Adjustment'}</Label>
              <Input type="number" step="0.5" value={form.manualAdjustmentDays} onChange={(event) => setForm((current) => ({ ...current, manualAdjustmentDays: event.target.value }))} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{de ? 'Notizen' : 'Notes'}</Label>
            <Textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{de ? 'Abbrechen' : 'Cancel'}</Button>
          <Button
            disabled={isLoading}
            onClick={() => onSubmit({
              annualEntitlementDays: Number(form.annualEntitlementDays),
              carryoverDays: Number(form.carryoverDays),
              manualAdjustmentDays: Number(form.manualAdjustmentDays),
              notes: form.notes || null,
            })}
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {de ? 'Speichern' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OverviewTab({ overview, employees, isLoading, de }) {
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('all');
  const searchTerm = normalizeSearch(search);
  const departmentOptions = useMemo(() => {
    const values = [...new Set((employees || []).map((employee) => employee.department).filter(Boolean))];
    return [{ value: 'all', label: de ? 'Alle Abteilungen' : 'All departments' }, ...values.map((value) => ({ value, label: value }))];
  }, [employees, de]);
  const filtered = useMemo(
    () => (employees || []).filter((employee) => {
      if (department !== 'all' && employee.department !== department) return false;
      return normalizeSearch(`${employeeName(employee)} ${employee.department || ''}`).includes(searchTerm);
    }),
    [employees, department, searchTerm],
  );
  const pagination = usePagedItems(filtered, 10);

  return (
    <div className="grid gap-4 xl:grid-cols-[1.35fr_0.9fr]">
      <PremiumPanel title={de ? 'Mitarbeiterstunden' : 'Employee hours'} icon={Users}>
        <div className="space-y-3">
          <TabToolbar
            search={search}
            onSearch={setSearch}
            searchPlaceholder={de ? 'Mitarbeiter suchen...' : 'Search employees...'}
            filters={[{ key: 'department', value: department, onValueChange: setDepartment, options: departmentOptions }]}
          />
          {isLoading ? <LoadingRows rows={6} /> : !filtered.length ? (
            <PremiumEmptyState icon={Users} title={de ? 'Keine Mitarbeiterdaten gefunden.' : 'No employee data found.'} description={de ? 'Zeitraum, Suche oder Filter prüfen.' : 'Check the period, search, or filters.'} />
          ) : (
            <DataShell
              pagination={<PremiumPagination de={de} page={pagination.page} pageSize={pagination.pageSize} pageCount={pagination.pageCount} total={pagination.total} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />}
            >
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">{de ? 'Mitarbeiter' : 'Employee'}</th>
                    <th className="px-4 py-3 text-right">{de ? 'Soll' : 'Target'}</th>
                    <th className="px-4 py-3 text-right">{de ? 'Ist' : 'Actual'}</th>
                    <th className="px-4 py-3 text-right">{de ? 'Überzeit' : 'Overtime'}</th>
                    <th className="px-4 py-3 text-right">{de ? 'Defizit' : 'Deficit'}</th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.pageItems.map((row) => (
                    <tr key={row.employeeId} className="border-t border-border/40">
                      <td className="px-4 py-3">
                        <div className="font-semibold">{employeeName(row)}</div>
                        {row.department && <div className="text-xs text-muted-foreground">{row.department}</div>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{hoursLabel(row.targetHours)}</td>
                      <td className="px-4 py-3 text-right font-mono">{hoursLabel(row.actualHours)}</td>
                      <td className="px-4 py-3 text-right font-mono text-amber-500">{hoursLabel(row.overtimeHours)}</td>
                      <td className="px-4 py-3 text-right font-mono text-red-500">{hoursLabel(row.deficitHours)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataShell>
          )}
        </div>
      </PremiumPanel>
      <div className="space-y-4">
        <PremiumPanel title={de ? 'Signale' : 'Signals'} icon={Sparkles}>
          {isLoading ? <LoadingRows rows={4} /> : (
            <div className="space-y-2">
              {(overview?.insights || []).map((item, index) => (
                <div key={index} className="rounded-lg border border-border/60 bg-muted/20 px-3 py-3 text-sm font-medium">{item}</div>
              ))}
            </div>
          )}
        </PremiumPanel>
        <PremiumPanel title={de ? 'Projektstunden' : 'Project hours'} icon={BarChart3}>
          <GroupBars groups={overview?.groupings?.project || []} de={de} withControls />
        </PremiumPanel>
      </div>
    </div>
  );
}

function LeaveTab({ requests, isLoading, error, employees, mutations, de }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('all');
  const searchTerm = normalizeSearch(search);
  const filtered = useMemo(
    () => (requests || []).filter((request) => {
      if (status !== 'all' && request.status !== status) return false;
      if (type !== 'all' && request.leaveType !== type) return false;
      return normalizeSearch(`${employeeName(request.employeeId)} ${request.leaveType} ${request.status}`).includes(searchTerm);
    }),
    [requests, status, type, searchTerm],
  );
  const pagination = usePagedItems(filtered, 10);

  if (isLoading) return <LoadingRows rows={5} />;
  if (error) return <ErrorInline message={apiMessage(error, de ? 'Abwesenheiten konnten nicht geladen werden.' : 'Leave requests could not be loaded.')} />;

  return (
    <div className="space-y-3">
      <TabToolbar
        search={search}
        onSearch={setSearch}
        searchPlaceholder={de ? 'Abwesenheit suchen...' : 'Search leave...'}
        filters={[
          {
            key: 'status',
            value: status,
            onValueChange: setStatus,
            options: ['all', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].map((value) => ({ value, label: value === 'all' ? (de ? 'Alle Status' : 'All statuses') : value })),
          },
          {
            key: 'type',
            value: type,
            onValueChange: setType,
            options: [{ value: 'all', label: de ? 'Alle Typen' : 'All types' }, ...LEAVE_TYPES.map((value) => ({ value, label: value }))],
          },
        ]}
        action={(
          <Button size="sm" className="h-9 gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            {de ? 'Abwesenheit' : 'Leave'}
          </Button>
        )}
      />
      {!filtered.length ? (
        <PremiumEmptyState icon={CalendarCheck} title={de ? 'Keine Abwesenheitsanträge gefunden.' : 'No leave requests found.'} description={de ? 'Neue Abwesenheiten können direkt hier erfasst werden.' : 'Create new leave requests directly from this workspace.'} />
      ) : (
        <DataShell pagination={<PremiumPagination de={de} page={pagination.page} pageSize={pagination.pageSize} pageCount={pagination.pageCount} total={pagination.total} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />}>
          <table className="w-full min-w-[940px] text-sm">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">{de ? 'Mitarbeiter' : 'Employee'}</th>
                <th className="px-4 py-3 text-left">{de ? 'Typ' : 'Type'}</th>
                <th className="px-4 py-3 text-left">{de ? 'Zeitraum' : 'Period'}</th>
                <th className="px-4 py-3 text-right">{de ? 'Tage' : 'Days'}</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">{de ? 'Aktionen' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {pagination.pageItems.map((request) => (
                <tr key={request._id} className="border-t border-border/40">
                  <td className="px-4 py-3 font-semibold">{employeeName(request.employeeId)}</td>
                  <td className="px-4 py-3">{request.leaveType}</td>
                  <td className="px-4 py-3">{formatDate(request.startDate)} - {formatDate(request.endDate)}</td>
                  <td className="px-4 py-3 text-right font-mono">{Number(request.requestedDays || 0).toFixed(2)}</td>
                  <td className="px-4 py-3"><Badge variant={LEAVE_STATUS_VARIANT[request.status] || 'outline'}>{request.status}</Badge></td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {request.status === 'PENDING' && (
                        <PermissionGate permission="time-tracking:write">
                          <Button size="sm" variant="outline" onClick={() => mutations.approveLeaveRequest.mutate({ id: request._id })}>
                            <Check className="h-4 w-4" />
                            {de ? 'Genehmigen' : 'Approve'}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setRejectTarget(request)}>
                            <X className="h-4 w-4" />
                            {de ? 'Ablehnen' : 'Reject'}
                          </Button>
                        </PermissionGate>
                      )}
                      {request.status !== 'CANCELLED' && (
                        <PermissionGate permission="time-tracking:write">
                          <Button size="sm" variant="ghost" onClick={() => mutations.cancelLeaveRequest.mutate(request._id)}>
                            {de ? 'Stornieren' : 'Cancel'}
                          </Button>
                        </PermissionGate>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataShell>
      )}
      <LeaveRequestDialog open={createOpen} onOpenChange={setCreateOpen} employees={employees} onSubmit={(payload) => mutations.createLeaveRequest.mutate(payload, { onSuccess: () => setCreateOpen(false) })} isLoading={mutations.createLeaveRequest.isPending} de={de} />
      <RejectLeaveDialog key={rejectTarget?._id || 'reject-empty'} request={rejectTarget} onOpenChange={(open) => { if (!open) setRejectTarget(null); }} onSubmit={(decisionNote) => mutations.rejectLeaveRequest.mutate({ id: rejectTarget._id, decisionNote }, { onSuccess: () => setRejectTarget(null) })} isLoading={mutations.rejectLeaveRequest.isPending} de={de} />
    </div>
  );
}

function BalanceTab({ balances, isLoading, error, mutations, de }) {
  const [editTarget, setEditTarget] = useState(null);
  const [search, setSearch] = useState('');
  const [health, setHealth] = useState('all');
  const searchTerm = normalizeSearch(search);
  const filtered = useMemo(
    () => (balances || []).filter((balance) => {
      if (health === 'negative' && Number(balance.availableVacationDays || 0) >= 0) return false;
      if (health === 'low' && (Number(balance.availableVacationDays || 0) < 0 || Number(balance.availableVacationDays || 0) >= LOW_BALANCE_THRESHOLD)) return false;
      if (health === 'healthy' && Number(balance.availableVacationDays || 0) < LOW_BALANCE_THRESHOLD) return false;
      return normalizeSearch(`${employeeName(balance)} ${balance.year}`).includes(searchTerm);
    }),
    [balances, health, searchTerm],
  );
  const pagination = usePagedItems(filtered, 10);

  if (isLoading) return <LoadingRows rows={5} />;
  if (error) return <ErrorInline message={apiMessage(error, de ? 'Ferienguthaben konnten nicht geladen werden.' : 'Vacation balances could not be loaded.')} />;

  return (
    <div className="space-y-3">
      <TabToolbar
        search={search}
        onSearch={setSearch}
        searchPlaceholder={de ? 'Guthaben suchen...' : 'Search balances...'}
        filters={[{
          key: 'health',
          value: health,
          onValueChange: setHealth,
          options: [
            { value: 'all', label: de ? 'Alle Guthaben' : 'All balances' },
            { value: 'negative', label: de ? 'Negativ' : 'Negative' },
            { value: 'low', label: de ? 'Niedrig' : 'Low' },
            { value: 'healthy', label: de ? 'Stabil' : 'Healthy' },
          ],
        }]}
      />
      {!filtered.length ? (
        <PremiumEmptyState icon={Hourglass} title={de ? 'Keine Ferienguthaben gefunden.' : 'No vacation balances found.'} description={de ? 'Suche, Jahr oder Filter prüfen.' : 'Check search, year, or filters.'} />
      ) : (
        <DataShell pagination={<PremiumPagination de={de} page={pagination.page} pageSize={pagination.pageSize} pageCount={pagination.pageCount} total={pagination.total} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />}>
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">{de ? 'Mitarbeiter' : 'Employee'}</th>
                <th className="px-4 py-3 text-right">{de ? 'Anspruch' : 'Entitlement'}</th>
                <th className="px-4 py-3 text-right">{de ? 'Genutzt' : 'Used'}</th>
                <th className="px-4 py-3 text-right">{de ? 'Geplant' : 'Planned'}</th>
                <th className="px-4 py-3 text-right">{de ? 'Verfügbar' : 'Available'}</th>
                <th className="px-4 py-3 text-right">{de ? 'Aktionen' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {pagination.pageItems.map((balance) => (
                <tr key={`${balance.employeeId}-${balance.year}`} className="border-t border-border/40">
                  <td className="px-4 py-3 font-semibold">{employeeName(balance)}</td>
                  <td className="px-4 py-3 text-right font-mono">{balance.annualEntitlementDays}</td>
                  <td className="px-4 py-3 text-right font-mono">{balance.usedVacationDays}</td>
                  <td className="px-4 py-3 text-right font-mono">{balance.plannedVacationDays}</td>
                  <td className={cn('px-4 py-3 text-right font-mono font-semibold', balance.availableVacationDays < 0 ? 'text-red-500' : balance.availableVacationDays < LOW_BALANCE_THRESHOLD ? 'text-amber-500' : 'text-emerald-500')}>
                    {balance.availableVacationDays}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <PermissionGate permission="time-tracking:admin">
                      <Button size="sm" variant="outline" onClick={() => setEditTarget(balance)}>
                        <SlidersHorizontal className="h-4 w-4" />
                        {de ? 'Bearbeiten' : 'Edit'}
                      </Button>
                    </PermissionGate>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataShell>
      )}
      <BalanceDialog key={editTarget ? `${editTarget.employeeId}-${editTarget.year}` : 'balance-empty'} balance={editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }} onSubmit={(payload) => mutations.upsertVacationBalance.mutate({ employeeId: editTarget.employeeId, year: editTarget.year, payload }, { onSuccess: () => setEditTarget(null) })} isLoading={mutations.upsertVacationBalance.isPending} de={de} />
    </div>
  );
}

function CalendarTab({ calendar, isLoading, error, de }) {
  const [search, setSearch] = useState('');
  const [availability, setAvailability] = useState('all');
  const searchTerm = normalizeSearch(search);
  const employees = useMemo(() => calendar?.employees || [], [calendar]);
  const days = employees[0]?.days || [];
  const filtered = useMemo(() => employees.filter((employee) => {
    const matchesSearch = normalizeSearch(`${employeeName(employee)} ${employee.department || ''}`).includes(searchTerm);
    if (!matchesSearch) return false;
    const hasAbsence = employee.days?.some((day) => day.availabilityType && day.availabilityType !== 'WORKING');
    const hasPending = employee.days?.some((day) => day.leaveStatus === 'PENDING');
    const hasApproved = employee.days?.some((day) => day.leaveStatus === 'APPROVED');
    if (availability === 'absence') return hasAbsence;
    if (availability === 'pending') return hasPending;
    if (availability === 'approved') return hasApproved;
    return true;
  }), [employees, availability, searchTerm]);
  const pagination = usePagedItems(filtered, 8);

  if (isLoading) return <LoadingRows rows={6} />;
  if (error) return <ErrorInline message={apiMessage(error, de ? 'Kalender konnte nicht geladen werden.' : 'Calendar could not be loaded.')} />;

  if (!employees.length || !days.length) {
    return <PremiumEmptyState icon={CalendarDays} title={de ? 'Keine Kalenderdaten gefunden.' : 'No calendar data found.'} description={de ? 'Zeitraum oder Mitarbeiterfilter prüfen.' : 'Check the period or employee filters.'} />;
  }

  return (
    <div className="space-y-3">
      <TabToolbar
        search={search}
        onSearch={setSearch}
        searchPlaceholder={de ? 'Kalender suchen...' : 'Search calendar...'}
        filters={[{
          key: 'availability',
          value: availability,
          onValueChange: setAvailability,
          options: [
            { value: 'all', label: de ? 'Alle Kalender' : 'All calendars' },
            { value: 'absence', label: de ? 'Mit Abwesenheit' : 'With absence' },
            { value: 'pending', label: de ? 'Offen' : 'Pending' },
            { value: 'approved', label: de ? 'Genehmigt' : 'Approved' },
          ],
        }]}
      />
      {!filtered.length ? (
        <PremiumEmptyState icon={Search} title={de ? 'Keine Kalendertreffer.' : 'No calendar matches.'} description={de ? 'Suchbegriff oder Filter zurücksetzen.' : 'Reset search or filters.'} />
      ) : (
        <DataShell pagination={<PremiumPagination de={de} page={pagination.page} pageSize={pagination.pageSize} pageCount={pagination.pageCount} total={pagination.total} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />}>
          <table className="w-full min-w-[960px] text-xs">
            <thead className="bg-muted/30 text-muted-foreground">
              <tr>
                <th className="sticky left-0 z-10 min-w-56 bg-card px-4 py-3 text-left">{de ? 'Mitarbeiter' : 'Employee'}</th>
                {days.map((day) => (
                  <th key={day.date} className="min-w-20 px-2 py-3 text-center font-semibold">
                    {new Date(day.date).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagination.pageItems.map((employee) => (
                <tr key={employee.employeeId} className="border-t border-border/40">
                  <td className="sticky left-0 z-10 bg-card px-4 py-3">
                    <div className="font-semibold">{employeeName(employee)}</div>
                    <div className="text-muted-foreground">{hoursLabel(employee.actualHours)} / {hoursLabel(employee.targetHours)}</div>
                  </td>
                  {employee.days.map((day) => {
                    const type = day.availabilityType || 'WORKING';
                    const blocked = type !== 'WORKING' && type !== null;
                    return (
                      <td key={`${employee.employeeId}-${day.date}`} className="px-2 py-2 text-center">
                        <span className={cn(
                          'inline-flex h-8 min-w-16 items-center justify-center rounded-lg px-2 font-semibold',
                          blocked ? 'bg-amber-500/12 text-amber-600' : 'bg-muted text-muted-foreground',
                          day.leaveStatus === 'APPROVED' && 'bg-emerald-500/12 text-emerald-600',
                          day.leaveStatus === 'PENDING' && 'bg-sky-500/12 text-sky-600',
                        )}>
                          {blocked ? type.replace('_', ' ') : hoursLabel(Number(day.targetMinutes || 0) / 60)}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </DataShell>
      )}
    </div>
  );
}

function AnalyticsTab({ analytics, aiContext, isLoading, error, groupBy, setGroupBy, de }) {
  if (isLoading) return <LoadingRows rows={5} />;
  if (error) return <ErrorInline message={apiMessage(error, de ? 'Analyse konnte nicht geladen werden.' : 'Analytics could not be loaded.')} />;

  return (
    <div className="grid gap-4 xl:grid-cols-[1.35fr_0.9fr]">
      <PremiumPanel
        title={de ? 'Gruppierung' : 'Grouping'}
        icon={BarChart3}
        action={(
          <ToolbarSelect
            value={groupBy}
            onValueChange={setGroupBy}
            className="w-40"
            options={GROUP_BY_OPTIONS.map((value) => ({ value, label: value }))}
          />
        )}
      >
        <GroupBars groups={analytics?.groups || []} de={de} withControls />
      </PremiumPanel>
      <div className="space-y-4">
        <PremiumPanel title={de ? 'Planungsrisiken' : 'Planning risks'} icon={AlertTriangle}>
          <div className="space-y-2">
            {(analytics?.insights || []).map((item, index) => (
              <div key={index} className="rounded-lg border border-border/60 bg-muted/20 px-3 py-3 text-sm font-medium">{item}</div>
            ))}
          </div>
        </PremiumPanel>
        <PremiumPanel title={de ? 'AI Kontext' : 'AI context'} icon={Activity}>
          <div className="grid gap-2 text-sm">
            <Badge variant="outline">{de ? 'Überzeit' : 'Overtime'}: {aiContext?.topOvertime?.length || 0}</Badge>
            <Badge variant="outline">{de ? 'Defizit' : 'Deficit'}: {aiContext?.topDeficit?.length || 0}</Badge>
            <Badge variant="outline">{de ? 'Ferienrisiko' : 'Leave pressure'}: {aiContext?.leavePressure?.length || 0}</Badge>
          </div>
        </PremiumPanel>
      </div>
    </div>
  );
}

export function TimeManagementWorkspace() {
  const { t, locale } = useLanguage();
  const de = locale === 'de';
  useTimeTrackingRealtime();
  const [tab, setTab] = useState('overview');
  const [officeDialogOpen, setOfficeDialogOpen] = useState(false);
  const [groupBy, setGroupBy] = useState('employee');
  const [dateFrom, setDateFrom] = useState(monthStart);
  const [dateTo, setDateTo] = useState(monthEnd);
  const [importOpen, setImportOpen] = useState(false);
  const filters = useMemo(() => ({ dateFrom, dateTo }), [dateFrom, dateTo]);
  const analyticsFilters = useMemo(() => ({ ...filters, groupBy }), [filters, groupBy]);
  const year = useMemo(() => Number(dateFrom.slice(0, 4)) || new Date().getFullYear(), [dateFrom]);
  const balanceFilters = useMemo(() => ({ year }), [year]);

  const overviewQuery = useTimeTrackingOverview(filters);
  const leaveQuery = useTimeTrackingLeaveRequests(filters, { enabled: tab === 'leave' || tab === 'overview' });
  const balanceQuery = useTimeTrackingVacationBalances(balanceFilters, { enabled: tab === 'balances' || tab === 'leave' || tab === 'analytics' });
  const calendarQuery = useTimeTrackingCalendar(filters, { enabled: tab === 'calendar' });
  const analyticsQuery = useTimeTrackingAnalytics(analyticsFilters, { enabled: tab === 'analytics' });
  const aiQuery = useTimeTrackingAiContext(filters, { enabled: tab === 'analytics' || tab === 'overview' });
  const mutations = useTimeTrackingMutations();

  const overview = overviewQuery.data;
  const totals = overview?.totals || {};
  const employees = useMemo(() => overview?.byEmployee || [], [overview]);
  const leaveRequests = leaveQuery.data || [];
  const balances = balanceQuery.data || [];

  return (
    <div className="space-y-6">
      <PremiumHero
        title={t('fieldOps.time.managementTitle', 'Time & Absence')}
        description={t('fieldOps.time.managementDesc', 'Working hours, approvals, absences, balances, availability, and analytics.')}
        count={Number(totals.totalEntries || 0)}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onImport={() => setImportOpen(true)}
        onExport={() => mutations.exportTimeEntries.mutate(filters)}
        exporting={mutations.exportTimeEntries.isPending}
        t={t}
      />

      {overviewQuery.error && (
        <ErrorInline message={apiMessage(overviewQuery.error, de ? 'Übersicht konnte nicht geladen werden.' : 'Overview could not be loaded.')} />
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <PremiumStatCard icon={Hourglass} label={de ? 'Sollstunden' : 'Target'} value={hoursLabel(totals.targetHours)} />
        <PremiumStatCard icon={TimerReset} label={de ? 'Iststunden' : 'Actual'} value={hoursLabel(totals.actualHours)} tone="info" />
        <PremiumStatCard icon={AlertTriangle} label={de ? 'Überzeit' : 'Overtime'} value={hoursLabel(totals.overtimeHours)} tone="warning" />
        <PremiumStatCard icon={AlertTriangle} label={de ? 'Defizit' : 'Deficit'} value={hoursLabel(totals.deficitHours)} tone="danger" />
        <PremiumStatCard icon={Check} label={de ? 'Freigegeben' : 'Released'} value={totals.releasedEntries || 0} tone="success" />
        <PremiumStatCard icon={CalendarDays} label={de ? 'Offene Abwesenheit' : 'Pending leave'} value={totals.pendingLeaveRequests || 0} tone="warning" />
      </div>

      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5" onClick={() => setOfficeDialogOpen(true)}>
          <Briefcase className="h-3.5 w-3.5" />
          {de ? 'Büroarbeiten erfassen' : 'Log office hours'}
        </Button>
      </div>

      <OfficeTimeEntryDialog open={officeDialogOpen} onOpenChange={setOfficeDialogOpen} />

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <div className="overflow-x-auto">
          <TabsList variant="line" className="min-w-max">
            <TabsTrigger value="overview">{de ? 'Übersicht' : 'Overview'}</TabsTrigger>
            <TabsTrigger value="records">{de ? 'Zeiten' : 'Records'}</TabsTrigger>
            <TabsTrigger value="leave">{de ? 'Abwesenheiten' : 'Leave'}</TabsTrigger>
            <TabsTrigger value="balances">{de ? 'Ferien' : 'Balances'}</TabsTrigger>
            <TabsTrigger value="calendar">{de ? 'Kalender' : 'Calendar'}</TabsTrigger>
            <TabsTrigger value="analytics">{de ? 'Analyse' : 'Analytics'}</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview">
          <OverviewTab overview={overview} employees={employees} isLoading={overviewQuery.isLoading} de={de} />
        </TabsContent>

        <TabsContent value="records">
          <FieldOpsTimeTable filters={filters} compact />
        </TabsContent>

        <TabsContent value="leave">
          <LeaveTab requests={leaveRequests} isLoading={leaveQuery.isLoading} error={leaveQuery.error} employees={employees} mutations={mutations} de={de} />
        </TabsContent>

        <TabsContent value="balances">
          <BalanceTab balances={balances} isLoading={balanceQuery.isLoading} error={balanceQuery.error} mutations={mutations} de={de} />
        </TabsContent>

        <TabsContent value="calendar">
          <CalendarTab calendar={calendarQuery.data} isLoading={calendarQuery.isLoading} error={calendarQuery.error} de={de} />
        </TabsContent>

        <TabsContent value="analytics">
          <AnalyticsTab analytics={analyticsQuery.data} aiContext={aiQuery.data} isLoading={analyticsQuery.isLoading || aiQuery.isLoading} error={analyticsQuery.error || aiQuery.error} groupBy={groupBy} setGroupBy={setGroupBy} de={de} />
        </TabsContent>
      </Tabs>

      <ImportTimeEntriesDialog open={importOpen} onOpenChange={setImportOpen} mutations={mutations} t={t} />
    </div>
  );
}
