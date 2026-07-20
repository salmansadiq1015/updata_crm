'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock,
  ExternalLink,
  Filter,
  Loader2,
  Mail,
  Phone,
  Search,
  Video,
  Wrench,
  X,
} from 'lucide-react';
import { assetMaintenanceService } from '@/modules/crm/services/asset-maintenance-service';
import { useAssetMaintenanceContext, useAssetMaintenanceMutations } from '@/modules/crm/hooks/use-asset-maintenance';
import { useCursorList } from '@/modules/crm/hooks/use-cursor-list';
import { useDeployEmployees } from '@/modules/deploy/hooks/use-deploy-employees';
import { queryKeys } from '@/lib/query/keys';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { useLanguage } from '@/lib/i18n/language-context';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { formatDate, formatDateTime } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { DataTableShell } from '@/shared/components/data-table/data-table-shell';
import { RowActionsMenu } from '@/shared/components/data-table/row-actions-menu';
import { DotLabel } from '@/shared/components/filter-dot';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  INSTALLATION_TYPE_META,
  MAINTENANCE_STATUS_META,
  MAINTENANCE_TYPE_META,
} from '@/modules/crm/constants/crm-constants';

const ALL = 'all';
const NO_EMPLOYEE = 'none';

const INSTALLATION_STATUS_OPTIONS = [
  { value: 'active', label: 'Aktiv', tone: 'emerald' },
  { value: 'maintenance', label: 'In Wartung', tone: 'sky' },
  { value: 'out_of_service', label: 'Ausser Betrieb', tone: 'slate' },
  { value: 'defective', label: 'Defekt', tone: 'red' },
  { value: 'decommissioned', label: 'Stillgelegt', tone: 'rose' },
];

const MAINTENANCE_STATUS_TONE = {
  ok: 'emerald',
  due: 'amber',
  overdue: 'red',
  scheduled: 'sky',
};

const DEFAULT_BULK_FORM = {
  maintenanceType: 'annual_service',
  customTypeLabel: '',
  frequencyMonths: '12',
  lastServiceDate: '',
  notes: '',
};

function employeeLabel(employee) {
  return `${employee?.firstName || ''} ${employee?.lastName || ''}`.trim() || employee?.email || '';
}

function maintenanceLabel(maintenance) {
  if (!maintenance) return 'Kein Wartungsintervall';
  return maintenance.customTypeLabel || MAINTENANCE_TYPE_META[maintenance.maintenanceType]?.label || maintenance.maintenanceType;
}

function systemLabel(installation) {
  return [
    installation?.installationNumber,
    installation?.manufacturer,
    installation?.model,
  ].filter(Boolean).join(' - ') || 'Anlage';
}

function dateTimeLocal(offsetDays = 1, hour = 8) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  date.setHours(hour, 0, 0, 0);
  return toLocalInputValue(date);
}

function toLocalInputValue(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultScheduleForm(item, context) {
  const start = dateTimeLocal(1, 8);
  const endDate = new Date(start);
  endDate.setHours(endDate.getHours() + 2);
  const contact = context?.contacts?.[0] || null;
  const customer = context?.customer || item?.customer || {};
  const title = `${maintenanceLabel(item?.maintenance)}: ${systemLabel(item?.installation)}`;

  return {
    employeeId: NO_EMPLOYEE,
    title,
    priority: item?.maintenance?.maintenanceStatus === 'overdue' ? 'HIGH' : 'NORMAL',
    startDatetime: start,
    endDatetime: toLocalInputValue(endDate),
    instructions: item?.site?.accessInstructions || '',
    appointmentWindow: '',
    customerContactName: contact?.fullName || customer.ownerName || customer.name || '',
    customerContactPhone: contact?.mobile || contact?.phone || customer.mobile || customer.phone || '',
    customerContactEmail: contact?.email || customer.email || '',
    customerNotes: '',
  };
}

export function AssetMaintenanceWorkspace() {
  const { t } = useLanguage();
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const canWriteCrm = hasPermission('crm:write');
  const canReadScheduling = hasPermission('scheduling:read');
  const canSchedule = hasPermission('scheduling:write');
  const canCreateMeeting = hasPermission('meetings:write');

  const [search, setSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [installationSearch, setInstallationSearch] = useState('');
  const [installationStatus, setInstallationStatus] = useState(ALL);
  const [maintenanceStatus, setMaintenanceStatus] = useState(ALL);
  const [maintenanceType, setMaintenanceType] = useState(ALL);
  const [technicianId, setTechnicianId] = useState(ALL);
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [rowSelection, setRowSelection] = useState({});
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState(DEFAULT_BULK_FORM);
  const [activeItem, setActiveItem] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [scheduleFormEdits, setScheduleFormEdits] = useState(null);

  const debouncedSearch = useDebounce(search, 300);
  const debouncedCustomerSearch = useDebounce(customerSearch, 300);
  const debouncedInstallationSearch = useDebounce(installationSearch, 300);

  const apiParams = useMemo(() => {
    const params = {};
    if (debouncedSearch) params.search = debouncedSearch;
    if (debouncedCustomerSearch) params.customerSearch = debouncedCustomerSearch;
    if (debouncedInstallationSearch) params.installationSearch = debouncedInstallationSearch;
    if (installationStatus !== ALL) params.installationStatus = installationStatus;
    if (maintenanceStatus !== ALL) params.maintenanceStatus = maintenanceStatus;
    if (maintenanceType !== ALL) params.maintenanceType = maintenanceType;
    if (technicianId !== ALL) params.technicianId = technicianId;
    if (dueFrom) params.dueFrom = dueFrom;
    if (dueTo) params.dueTo = dueTo;
    params.sortBy = 'nextDueDate';
    params.sortOrder = 'asc';
    return params;
  }, [
    debouncedSearch,
    debouncedCustomerSearch,
    debouncedInstallationSearch,
    installationStatus,
    maintenanceStatus,
    maintenanceType,
    technicianId,
    dueFrom,
    dueTo,
  ]);

  const {
    items,
    pageSize,
    setPageSize,
    hasNext,
    hasPrev,
    isFetching,
    onNext,
    onPrev,
    reset,
    refetch,
    isError,
  } = useCursorList({
    queryKey: (merged) => queryKeys.crm.assetMaintenance.workItems(merged),
    queryFn: (merged) => assetMaintenanceService.listWorkItems(merged),
    params: apiParams,
    initialSize: 25,
  });

  const { data: employees = [], isFetching: employeesFetching } = useDeployEmployees({
    enabled: canReadScheduling,
    limit: 100,
  });

  const activeInstallationId = activeItem?.installation?._id;
  const contextQuery = useAssetMaintenanceContext(activeInstallationId, { enabled: drawerOpen });
  const { bulkCreate, schedule } = useAssetMaintenanceMutations({
    onBulkCreated: () => {
      setBulkDialogOpen(false);
      setRowSelection({});
      setBulkForm(DEFAULT_BULK_FORM);
    },
    onScheduled: () => {
      setDrawerOpen(false);
      setActiveItem(null);
      setScheduleFormEdits(null);
    },
  });

  const scheduleBaseForm = useMemo(
    () => defaultScheduleForm(activeItem, contextQuery.data),
    [activeItem, contextQuery.data],
  );

  const scheduleForm = scheduleFormEdits || scheduleBaseForm;

  const setScheduleForm = useCallback((updater) => {
    setScheduleFormEdits((previous) => {
      const current = previous || scheduleBaseForm;
      return typeof updater === 'function' ? updater(current) : updater;
    });
  }, [scheduleBaseForm]);

  const selectedRows = useMemo(
    () => items.filter((item) => rowSelection[String(item._id)]),
    [items, rowSelection],
  );

  const selectedInstallationIds = useMemo(() => {
    const ids = selectedRows.map((row) => row.installation?._id).filter(Boolean);
    return [...new Set(ids)];
  }, [selectedRows]);

  const pageStats = useMemo(() => {
    return items.reduce((acc, item) => {
      acc.total += 1;
      const status = item.maintenance?.maintenanceStatus;
      if (status === 'due') acc.due += 1;
      if (status === 'overdue') acc.overdue += 1;
      if (status === 'scheduled') acc.scheduled += 1;
      if (!item.maintenance) acc.withoutInterval += 1;
      return acc;
    }, { total: 0, due: 0, overdue: 0, scheduled: 0, withoutInterval: 0 });
  }, [items]);

  const hasActiveFilters = Boolean(
    search ||
    customerSearch ||
    installationSearch ||
    installationStatus !== ALL ||
    maintenanceStatus !== ALL ||
    maintenanceType !== ALL ||
    technicianId !== ALL ||
    dueFrom ||
    dueTo,
  );

  const clearFilters = () => {
    setSearch('');
    setCustomerSearch('');
    setInstallationSearch('');
    setInstallationStatus(ALL);
    setMaintenanceStatus(ALL);
    setMaintenanceType(ALL);
    setTechnicianId(ALL);
    setDueFrom('');
    setDueTo('');
    setRowSelection({});
    reset();
  };

  const openSchedule = (item) => {
    setActiveItem(item);
    setScheduleFormEdits(null);
    setDrawerOpen(true);
  };

  const submitBulkCreate = async () => {
    if (!selectedInstallationIds.length) return;
    await bulkCreate.mutateAsync({
      installationIds: selectedInstallationIds,
      maintenanceType: bulkForm.maintenanceType,
      customTypeLabel: bulkForm.customTypeLabel || null,
      frequencyMonths: Number(bulkForm.frequencyMonths || 12),
      lastServiceDate: bulkForm.lastServiceDate || null,
      notes: bulkForm.notes || null,
      skipExisting: true,
    });
  };

  const submitSchedule = async () => {
    if (!activeItem || scheduleForm.employeeId === NO_EMPLOYEE) return;
    const maintenanceIntervalId = activeItem.maintenance?._id || null;
    await schedule.mutateAsync({
      maintenanceIntervalIds: maintenanceIntervalId ? [maintenanceIntervalId] : [],
      installationIds: maintenanceIntervalId ? [] : [activeItem.installation._id],
      employeeIds: [scheduleForm.employeeId],
      title: scheduleForm.title || null,
      priority: scheduleForm.priority,
      startDatetime: scheduleForm.startDatetime,
      endDatetime: scheduleForm.endDatetime,
      instructions: scheduleForm.instructions || null,
      isCustomerAppointment: true,
      appointment: {
        customerContactName: scheduleForm.customerContactName || null,
        customerContactPhone: scheduleForm.customerContactPhone || null,
        customerContactEmail: scheduleForm.customerContactEmail || null,
        appointmentWindow: scheduleForm.appointmentWindow || null,
        confirmationMethod: scheduleForm.customerContactEmail ? 'EMAIL' : 'PHONE',
        customerNotes: scheduleForm.customerNotes || null,
      },
    });
  };

  const columns = useMemo(() => [
    {
      accessorKey: 'customer',
      header: t('crm.assetMaintenance.customerSystem', 'Kunde / Anlage'),
      size: 360,
      Cell: ({ row }) => {
        const item = row.original;
        const meta = INSTALLATION_TYPE_META[item.installation?.type] || INSTALLATION_TYPE_META.other;
        const Icon = meta.icon || Wrench;
        return (
          <div className="flex min-w-0 items-center gap-3">
            <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-border', meta.bg)}>
              <Icon className={cn('h-4 w-4', meta.color)} />
            </span>
            <div className="min-w-0">
              <Link href={`/crm/installations/${item.installation?._id}`} className="block truncate text-[13px] font-medium text-foreground hover:underline">
                {systemLabel(item.installation)}
              </Link>
              <p className="truncate text-xs text-muted-foreground">
                {item.customer?.name || '-'} {item.site?.name ? `- ${item.site.name}` : ''}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'maintenance',
      header: t('crm.assetMaintenance.maintenance', 'Wartung'),
      size: 220,
      Cell: ({ row }) => {
        const maintenance = row.original.maintenance;
        if (!maintenance) {
          return <Badge variant="outline" className="text-muted-foreground">{t('crm.assetMaintenance.noInterval', 'Kein Intervall')}</Badge>;
        }
        const meta = MAINTENANCE_TYPE_META[maintenance.maintenanceType] || MAINTENANCE_TYPE_META.other;
        const Icon = meta.icon || Wrench;
        return (
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Icon className={cn('h-3.5 w-3.5 shrink-0', meta.color)} />
              <span className="truncate text-[13px] font-medium text-foreground">{maintenanceLabel(maintenance)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {maintenance.frequencyMonths ? `${maintenance.frequencyMonths} ${t('common.months', 'Monate')}` : '-'}
            </p>
          </div>
        );
      },
    },
    {
      accessorKey: 'nextDueDate',
      header: t('crm.assetMaintenance.due', 'Fälligkeit'),
      size: 170,
      Cell: ({ row }) => {
        const maintenance = row.original.maintenance;
        const status = maintenance?.maintenanceStatus;
        const statusMeta = status ? MAINTENANCE_STATUS_META[status] : null;
        return (
          <div className="space-y-1">
            <p className="text-[13px] text-foreground">{formatDate(maintenance?.nextDueDate)}</p>
            {statusMeta ? (
              <Badge variant="outline" className={cn('border-transparent', statusMeta.bg, statusMeta.color)}>
                <span className={cn('h-1.5 w-1.5 rounded-full', statusMeta.dot)} />
                {statusMeta.label}
              </Badge>
            ) : (
              <span className="text-xs text-muted-foreground">-</span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'assignment',
      header: t('crm.assetMaintenance.technician', 'Techniker / Termin'),
      size: 240,
      Cell: ({ row }) => {
        const assignment = row.original.assignment;
        if (!assignment) {
          return <span className="text-[13px] text-muted-foreground">{t('crm.assetMaintenance.unassigned', 'Nicht geplant')}</span>;
        }
        return (
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-foreground">
              {employeeLabel(assignment.employee) || t('crm.assetMaintenance.unassignedTechnician', 'Ohne Techniker')}
            </p>
            <p className="truncate text-xs text-muted-foreground">{formatDateTime(assignment.startDatetime)}</p>
          </div>
        );
      },
    },
  ], [t]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
              <Wrench className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-[18px] font-semibold leading-tight text-foreground">
                {t('crm.assetMaintenance.title', 'Anlagen & Wartung')}
              </h1>
              <p className="text-[13px] text-muted-foreground">
                {t('crm.assetMaintenance.subtitle', 'Anlagen, Wartungsfälligkeit und Planung in einem Arbeitsfluss.')}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => router.push('/scheduling/calendar')} disabled={!canReadScheduling}>
            <CalendarDays className="h-4 w-4" />
            {t('crm.assetMaintenance.calendar', 'Kalender')}
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => router.push('/scheduling/meetings')} disabled={!canCreateMeeting}>
            <Video className="h-4 w-4" />
            Teams
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric label={t('common.total', 'Total')} value={pageStats.total} />
        <Metric label={t('crm.assetMaintenance.due', 'Fällig')} value={pageStats.due} tone="amber" />
        <Metric label={t('crm.assetMaintenance.overdue', 'Überfällig')} value={pageStats.overdue} tone="red" />
        <Metric label={t('crm.assetMaintenance.scheduledShort', 'Geplant')} value={pageStats.scheduled} tone="sky" />
        <Metric label={t('crm.assetMaintenance.withoutInterval', 'Ohne Intervall')} value={pageStats.withoutInterval} tone="slate" />
      </div>

      <div className="rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            <span className="text-[11px] font-semibold uppercase tracking-wider">{t('common.filter', 'Filter')}</span>
          </div>
          <div className="h-5 w-px bg-border" />
          <FilterInput icon={Search} value={search} onChange={setSearch} placeholder={t('crm.assetMaintenance.search', 'Suchen...')} />
          <FilterInput value={customerSearch} onChange={setCustomerSearch} placeholder={t('crm.assetMaintenance.customerFilter', 'Kunde filtern')} />
          <FilterInput value={installationSearch} onChange={setInstallationSearch} placeholder={t('crm.assetMaintenance.systemFilter', 'Anlage filtern')} />

          <Select value={installationStatus} onValueChange={setInstallationStatus}>
            <SelectTrigger className="h-9 w-42 rounded-xl text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}><DotLabel>{t('crm.assetMaintenance.allSystemStatus', 'Alle Anlagenstatus')}</DotLabel></SelectItem>
              {INSTALLATION_STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <DotLabel tone={option.tone}>{option.label}</DotLabel>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={maintenanceStatus} onValueChange={setMaintenanceStatus}>
            <SelectTrigger className="h-9 w-42 rounded-xl text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}><DotLabel>{t('crm.assetMaintenance.allMaintenanceStatus', 'Alle Wartungsstatus')}</DotLabel></SelectItem>
              {Object.entries(MAINTENANCE_STATUS_META).map(([key, meta]) => (
                <SelectItem key={key} value={key}>
                  <DotLabel tone={MAINTENANCE_STATUS_TONE[key]}>{meta.label}</DotLabel>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={maintenanceType} onValueChange={setMaintenanceType}>
            <SelectTrigger className="h-9 w-44 rounded-xl text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}><DotLabel>{t('crm.assetMaintenance.allMaintenanceTypes', 'Alle Wartungstypen')}</DotLabel></SelectItem>
              {Object.entries(MAINTENANCE_TYPE_META).map(([key, meta]) => (
                <SelectItem key={key} value={key}>{meta.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={technicianId} onValueChange={setTechnicianId} disabled={!canReadScheduling || employeesFetching}>
            <SelectTrigger className="h-9 w-44 rounded-xl text-xs">
              <SelectValue placeholder={t('crm.assetMaintenance.technician', 'Techniker')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('crm.assetMaintenance.allTechnicians', 'Alle Techniker')}</SelectItem>
              {employees.map((employee) => (
                <SelectItem key={employee._id} value={employee._id}>{employeeLabel(employee)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input type="date" value={dueFrom} onChange={(event) => setDueFrom(event.target.value)} className="h-9 w-36 rounded-xl text-xs" />
          <Input type="date" value={dueTo} onChange={(event) => setDueTo(event.target.value)} className="h-9 w-36 rounded-xl text-xs" />

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="h-8 gap-1 rounded-full text-xs" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" />
              {t('common.reset', 'Zurücksetzen')}
            </Button>
          )}
        </div>
      </div>

      {selectedInstallationIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
          <p className="text-sm font-medium text-foreground">
            {t('crm.assetMaintenance.selectedSystems', '{count} Anlagen ausgewählt').replace('{count}', String(selectedInstallationIds.length))}
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" className="gap-2" onClick={() => setBulkDialogOpen(true)} disabled={!canWriteCrm}>
              <Wrench className="h-4 w-4" />
              {t('crm.assetMaintenance.createBulk', 'Wartung erfassen')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setRowSelection({})}>
              {t('common.clear', 'Leeren')}
            </Button>
          </div>
        </div>
      )}

      {isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t('crm.assetMaintenance.loadError', 'Daten konnten nicht geladen werden')}</AlertTitle>
          <AlertDescription>
            <Button variant="outline" size="sm" onClick={() => refetch()}>{t('common.retry', 'Erneut versuchen')}</Button>
          </AlertDescription>
        </Alert>
      )}

      <DataTableShell
        columns={columns}
        data={items}
        isLoading={isFetching && items.length === 0}
        rowCount={items.length}
        manualPagination
        manualSorting
        manualFiltering
        enableGlobalFilter={false}
        enableRowSelection
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        getRowId={(row) => String(row._id)}
        emptyState={<AssetMaintenanceEmptyState t={t} />}
        cursorPagination={{
          pageSize,
          onPageSizeChange: setPageSize,
          hasNext,
          hasPrev,
          isFetching,
          onNext,
          onPrev,
        }}
        renderRowActions={({ row }) => {
          const item = row.original;
          const linkedAssignmentId = item.assignment?._id || item.maintenance?.linkedServiceOrderId;
          return (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                disabled={!canSchedule || Boolean(linkedAssignmentId)}
                onClick={() => openSchedule(item)}
              >
                <CalendarClock className="h-3.5 w-3.5" />
                {t('crm.assetMaintenance.terminieren', 'Terminieren')}
              </Button>
              <RowActionsMenu
                items={[
                  {
                    label: t('crm.assetMaintenance.openInstallation', 'Anlage öffnen'),
                    icon: ExternalLink,
                    onSelect: () => router.push(`/crm/installations/${item.installation?._id}`),
                  },
                  {
                    label: t('crm.assetMaintenance.openCalendar', 'Kalender öffnen'),
                    icon: CalendarDays,
                    hidden: !canReadScheduling,
                    onSelect: () => router.push('/scheduling/calendar'),
                  },
                ]}
              />
            </div>
          );
        }}
      />

      <BulkMaintenanceDialog
        open={bulkDialogOpen}
        onOpenChange={setBulkDialogOpen}
        form={bulkForm}
        setForm={setBulkForm}
        selectedCount={selectedInstallationIds.length}
        isPending={bulkCreate.isPending}
        onSubmit={submitBulkCreate}
        t={t}
      />

      <ScheduleDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        item={activeItem}
        context={contextQuery.data}
        isContextLoading={contextQuery.isFetching}
        employees={employees}
        canSchedule={canSchedule}
        canCreateMeeting={canCreateMeeting}
        form={scheduleForm}
        setForm={setScheduleForm}
        isPending={schedule.isPending}
        onSubmit={submitSchedule}
        t={t}
      />
    </div>
  );
}

function Metric({ label, value, tone = 'default' }) {
  const toneClass = {
    default: 'text-foreground',
    amber: 'text-amber-700 dark:text-amber-300',
    red: 'text-red-700 dark:text-red-300',
    sky: 'text-sky-700 dark:text-sky-300',
    slate: 'text-slate-700 dark:text-slate-300',
  }[tone];

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-xl font-semibold', toneClass)}>{value}</p>
    </div>
  );
}

function FilterInput({ value, onChange, placeholder, icon: Icon }) {
  return (
    <div className="relative w-48">
      {Icon && <Icon className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />}
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={cn('h-9 rounded-xl text-xs', Icon && 'pl-8')}
      />
    </div>
  );
}

function AssetMaintenanceEmptyState({ t }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/10 bg-primary/5">
        <Wrench className="h-6 w-6 text-primary/50" />
      </div>
      <p className="text-sm font-medium">{t('crm.assetMaintenance.empty', 'Keine Anlagen oder Wartungen gefunden')}</p>
      <p className="max-w-md text-xs">{t('crm.assetMaintenance.emptyDesc', 'Filter anpassen oder Wartungsintervalle für ausgewählte Anlagen erfassen.')}</p>
    </div>
  );
}

function BulkMaintenanceDialog({ open, onOpenChange, form, setForm, selectedCount, isPending, onSubmit, t }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{t('crm.assetMaintenance.createBulk', 'Wartung erfassen')}</DialogTitle>
          <DialogDescription>
            {t('crm.assetMaintenance.bulkDesc', 'Erstellt Wartungsintervalle für {count} ausgewählte Anlagen und überspringt vorhandene gleiche Intervalle.')
              .replace('{count}', String(selectedCount))}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('crm.assetMaintenance.maintenanceType', 'Wartungstyp')}</Label>
              <Select value={form.maintenanceType} onValueChange={(value) => setForm((prev) => ({ ...prev, maintenanceType: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(MAINTENANCE_TYPE_META).map(([key, meta]) => (
                    <SelectItem key={key} value={key}>{meta.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('crm.assetMaintenance.frequencyMonths', 'Intervall Monate')}</Label>
              <Input
                type="number"
                min="1"
                max="120"
                value={form.frequencyMonths}
                onChange={(event) => setForm((prev) => ({ ...prev, frequencyMonths: event.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t('crm.assetMaintenance.customLabel', 'Bezeichnung')}</Label>
            <Input value={form.customTypeLabel} onChange={(event) => setForm((prev) => ({ ...prev, customTypeLabel: event.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>{t('crm.assetMaintenance.lastServiceDate', 'Letzter Service')}</Label>
            <Input type="date" value={form.lastServiceDate} onChange={(event) => setForm((prev) => ({ ...prev, lastServiceDate: event.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>{t('common.notes', 'Notizen')}</Label>
            <Textarea value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            {t('common.cancel', 'Abbrechen')}
          </Button>
          <Button type="button" onClick={onSubmit} disabled={isPending || selectedCount === 0}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.create', 'Erstellen')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleDrawer({
  open,
  onOpenChange,
  item,
  context,
  isContextLoading,
  employees,
  canSchedule,
  canCreateMeeting,
  form,
  setForm,
  isPending,
  onSubmit,
  t,
}) {
  const router = useRouter();
  const assignment = item?.assignment;
  const maintenance = item?.maintenance;
  const installation = item?.installation;
  const customer = context?.customer || item?.customer || {};
  const site = context?.site || item?.site || {};
  const canSubmit = canSchedule && form.employeeId !== NO_EMPLOYEE && form.startDatetime && form.endDatetime;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-3xl">
        <SheetHeader className="border-b border-border p-5">
          <SheetTitle>{t('crm.assetMaintenance.scheduleTitle', 'Wartung planen')}</SheetTitle>
          <SheetDescription>
            {systemLabel(installation)} - {customer?.name || t('crm.assetMaintenance.noCustomer', 'Kein Kunde')}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 p-5">
          {!canSchedule && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>{t('crm.assetMaintenance.schedulePermissionTitle', 'Keine Planungsberechtigung')}</AlertTitle>
              <AlertDescription>{t('crm.assetMaintenance.schedulePermissionDesc', 'Sie können Kontext einsehen, aber keinen Techniker zuweisen.')}</AlertDescription>
            </Alert>
          )}

          {isContextLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ContextPanel title={t('crm.assetMaintenance.customerContext', 'Kundenkontakt')}>
                <p className="text-sm font-medium text-foreground">{customer?.name || '-'}</p>
                <p className="text-xs text-muted-foreground">{[customer?.street, customer?.postalCode, customer?.city].filter(Boolean).join(', ') || '-'}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {form.customerContactPhone && (
                    <Button asChild variant="outline" size="sm" className="gap-2">
                      <a href={`tel:${form.customerContactPhone}`}><Phone className="h-4 w-4" />{form.customerContactPhone}</a>
                    </Button>
                  )}
                  {form.customerContactEmail && (
                    <Button asChild variant="outline" size="sm" className="gap-2">
                      <a href={`mailto:${form.customerContactEmail}`}><Mail className="h-4 w-4" />{t('common.email', 'E-Mail')}</a>
                    </Button>
                  )}
                  {form.customerContactPhone ? (
                    <Button asChild variant="outline" size="sm" className="gap-2">
                      <a href={`callto:${form.customerContactPhone}`}><Video className="h-4 w-4" /> Teams</a>
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => router.push('/scheduling/meetings')} disabled={!canCreateMeeting}>
                      <Video className="h-4 w-4" /> Teams
                    </Button>
                  )}
                </div>
              </ContextPanel>

              <ContextPanel title={t('crm.assetMaintenance.systemContext', 'Anlage')}>
                <p className="text-sm font-medium text-foreground">{systemLabel(installation)}</p>
                <p className="text-xs text-muted-foreground">{installation?.serialNumber || t('crm.assetMaintenance.noSerial', 'Keine Seriennummer')}</p>
                <p className="mt-2 text-xs text-muted-foreground">{site?.name || '-'} {site?.city ? `- ${site.city}` : ''}</p>
                {site?.accessInstructions && (
                  <p className="mt-2 rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">{site.accessInstructions}</p>
                )}
              </ContextPanel>
            </div>
          )}

          <ContextPanel title={t('crm.assetMaintenance.currentMaintenance', 'Aktuelle Wartung')}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{maintenanceLabel(maintenance)}</Badge>
              {maintenance?.maintenanceStatus && (
                <Badge variant="outline">{MAINTENANCE_STATUS_META[maintenance.maintenanceStatus]?.label || maintenance.maintenanceStatus}</Badge>
              )}
              <span className="text-sm text-muted-foreground">
                {t('crm.assetMaintenance.nextDue', 'Nächste Fälligkeit')}: {formatDate(maintenance?.nextDueDate)}
              </span>
            </div>
            {assignment && (
              <Alert className="mt-3">
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>{t('crm.assetMaintenance.alreadyScheduled', 'Bereits geplant')}</AlertTitle>
                <AlertDescription>
                  {formatDateTime(assignment.startDatetime)} - {employeeLabel(assignment.employee)}
                </AlertDescription>
              </Alert>
            )}
          </ContextPanel>

          <ContextPanel title={t('crm.assetMaintenance.scheduleForm', 'Termin & Zuweisung')}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t('crm.assetMaintenance.technician', 'Techniker')}>
                <Select value={form.employeeId} onValueChange={(value) => setForm((prev) => ({ ...prev, employeeId: value }))} disabled={!canSchedule}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_EMPLOYEE}>{t('crm.assetMaintenance.selectTechnician', 'Techniker auswählen')}</SelectItem>
                    {employees.map((employee) => (
                      <SelectItem key={employee._id} value={employee._id}>{employeeLabel(employee)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t('crm.assetMaintenance.priority', 'Priorität')}>
                <Select value={form.priority} onValueChange={(value) => setForm((prev) => ({ ...prev, priority: value }))} disabled={!canSchedule}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NORMAL">{t('common.normal', 'Normal')}</SelectItem>
                    <SelectItem value="HIGH">{t('common.high', 'Hoch')}</SelectItem>
                    <SelectItem value="URGENT">{t('common.urgent', 'Dringend')}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t('crm.assetMaintenance.start', 'Start')}>
                <Input type="datetime-local" value={form.startDatetime} onChange={(event) => setForm((prev) => ({ ...prev, startDatetime: event.target.value }))} disabled={!canSchedule} />
              </Field>
              <Field label={t('crm.assetMaintenance.end', 'Ende')}>
                <Input type="datetime-local" value={form.endDatetime} onChange={(event) => setForm((prev) => ({ ...prev, endDatetime: event.target.value }))} disabled={!canSchedule} />
              </Field>
            </div>
            <Field label={t('crm.assetMaintenance.titleField', 'Titel')}>
              <Input value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} disabled={!canSchedule} />
            </Field>
            <Field label={t('crm.assetMaintenance.instructions', 'Hinweise')}>
              <Textarea value={form.instructions} onChange={(event) => setForm((prev) => ({ ...prev, instructions: event.target.value }))} disabled={!canSchedule} />
            </Field>
          </ContextPanel>

          <ContextPanel title={t('crm.assetMaintenance.appointment', 'Kundentermin')}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t('deploy.form.contactName', 'Kontaktname')}>
                <Input value={form.customerContactName} onChange={(event) => setForm((prev) => ({ ...prev, customerContactName: event.target.value }))} disabled={!canSchedule} />
              </Field>
              <Field label={t('deploy.form.phone', 'Telefon')}>
                <Input value={form.customerContactPhone} onChange={(event) => setForm((prev) => ({ ...prev, customerContactPhone: event.target.value }))} disabled={!canSchedule} />
              </Field>
              <Field label={t('deploy.form.email', 'E-Mail')}>
                <Input type="email" value={form.customerContactEmail} onChange={(event) => setForm((prev) => ({ ...prev, customerContactEmail: event.target.value }))} disabled={!canSchedule} />
              </Field>
              <Field label={t('deploy.form.appointmentWindow', 'Zeitfenster')}>
                <Input value={form.appointmentWindow} onChange={(event) => setForm((prev) => ({ ...prev, appointmentWindow: event.target.value }))} disabled={!canSchedule} />
              </Field>
            </div>
            <Field label={t('deploy.form.customerNotes', 'Kundenhinweise')}>
              <Textarea value={form.customerNotes} onChange={(event) => setForm((prev) => ({ ...prev, customerNotes: event.target.value }))} disabled={!canSchedule} />
            </Field>
          </ContextPanel>

          <ContextPanel title={t('crm.assetMaintenance.history', 'Historie')}>
            <div className="space-y-2">
              {(context?.history || []).slice(0, 6).map((entry) => (
                <div key={`${entry.type}-${entry.id || entry.timestamp}`} className="flex items-start gap-3 rounded-lg border border-border/60 p-2">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{entry.title}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(entry.timestamp)} {entry.summary ? `- ${entry.summary}` : ''}</p>
                  </div>
                </div>
              ))}
              {!context?.history?.length && (
                <p className="text-sm text-muted-foreground">{t('crm.assetMaintenance.noHistory', 'Keine Historie vorhanden')}</p>
              )}
            </div>
          </ContextPanel>
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-border bg-popover p-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>{t('common.cancel', 'Abbrechen')}</Button>
          <Button onClick={onSubmit} disabled={!canSubmit || isPending || Boolean(assignment)} className="gap-2">
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('crm.assetMaintenance.schedule', 'Planen')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ContextPanel({ title, children }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold text-foreground">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
