'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import {
  useFieldOpsOrderDetail, useFieldOpsOrderReports,
  useFieldOpsOrderTimeEntries, useFieldOpsOrderPhotos,
  useFieldOpsOrderHistory,
} from '@/modules/field-ops/hooks/use-field-ops-queries';
import { useFieldOpsOrderMutations } from '@/modules/field-ops/hooks/use-field-ops-order-mutations';
import { useOrderTasks } from '@/modules/tasks/hooks/use-task-queries';
import { useTaskMutations } from '@/modules/tasks/hooks/use-task-mutations';
import { FieldOpsCreateOrderDialog } from './field-ops-create-order-dialog';
import { FieldOpsOrderStatusBadge } from './field-ops-order-status-badge';
import { FieldOpsReportDetailPanel } from '@/modules/field-ops/components/reports/field-ops-report-detail-panel';
import { FieldOpsReportStatusBadge } from '@/modules/field-ops/components/reports/field-ops-report-status-badge';
import { FieldOpsPhotoGallery } from '@/modules/field-ops/components/photos/field-ops-photo-gallery';
import { FieldOpsInstallationsTable } from '@/modules/field-ops/components/installations/field-ops-installations-table';
import { RichTextContent } from '@/components/ui/rich-text-content';
import { useLanguage } from '@/lib/i18n/language-context';
import { formatDate } from '@/lib/formatters';
import {
  ORDER_TYPE_LABELS, RELEASE_STATUS_CONFIG, ACTIVITY_TYPE_LABELS,
} from '@/modules/field-ops/constants/field-ops-constants';
import { cn } from '@/lib/utils';
import {
  MoreHorizontal, Pencil, Trash2, ChevronLeft,
  MapPin, Phone, Mail, User, Calendar, FileText, Clock,
  Camera, Wrench, MessageSquare, FileCheck, ClipboardList,
  AlertCircle, CheckCircle2, XCircle, Navigation,
  History, ListChecks, PlayCircle, PlusCircle, RotateCcw, UsersRound,
} from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────

const PRIORITY_CONFIG = {
  NORMAL:  { label: 'Normal',   labelEn: 'Normal',  className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  HIGH:    { label: 'Hoch',     labelEn: 'High',    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' },
  URGENT:  { label: 'Dringend', labelEn: 'Urgent',  className: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
};

function InfoRow({ icon: Icon, label, children, className }) {
  if (!children) return null;
  return (
    <div className={cn('flex items-start gap-3 py-2.5 border-b border-border/50 last:border-0', className)}>
      {Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-0.5">{label}</p>
        <div className="text-sm">{children}</div>
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col lg:flex-row gap-0 min-h-[600px]">
      <div className="w-full lg:w-72 xl:w-80 border-r border-border p-6 space-y-4">
        <Skeleton className="h-12 w-12 rounded-xl" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-24 rounded-full" />
        <Separator />
        {[1,2,3,4].map(i => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
      <div className="flex-1 p-6 space-y-4">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    </div>
  );
}

// ── Tab content components ────────────────────────────────────────────────────

function OverviewTab({ order, de }) {
  const type = order.assignmentType || order.orderType;
  const typeCfg = ORDER_TYPE_LABELS[type];
  const priCfg = PRIORITY_CONFIG[order.priority];
  const customer = order.appointment?.customerContactName || order.customerName;
  const phone    = order.appointment?.customerContactPhone || order.customerPhone;
  const email    = order.appointment?.customerContactEmail || order.customerEmail;
  const address  = order.siteAddress || order.appointment?.customerNotes;
  const emp      = order.employeeId;
  const targetType = order.assignmentTargetType || order.assignment_target_type;
  const targetLabel = order.assignmentTargetLabel || order.assignment_target_label || order.assignmentTargetId || order.assignment_target_id;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* Order info card */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          {de ? 'Auftragsdetails' : 'Order Details'}
        </p>
        <InfoRow icon={ClipboardList} label={de ? 'Auftrags-Nr.' : 'Order #'}>
          <span className="font-mono">{order.assignmentNumber || order.orderNumber}</span>
        </InfoRow>
        <InfoRow icon={FileText} label={de ? 'Typ' : 'Type'}>
          {typeCfg ? (de ? typeCfg.label : typeCfg.labelEn) : type}
        </InfoRow>
        <InfoRow icon={AlertCircle} label={de ? 'Priorität' : 'Priority'}>
          {priCfg && (
            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', priCfg.className)}>
              {de ? priCfg.label : priCfg.labelEn}
            </span>
          )}
        </InfoRow>
        <InfoRow icon={Calendar} label={de ? 'Geplant von' : 'Scheduled From'}>
          {order.startDatetime ? formatDate(order.startDatetime) : '—'}
        </InfoRow>
        <InfoRow icon={Calendar} label={de ? 'Geplant bis' : 'Scheduled To'}>
          {order.endDatetime ? formatDate(order.endDatetime) : '—'}
        </InfoRow>
        <InfoRow icon={User} label={de ? 'Techniker' : 'Technician'}>
          {emp && typeof emp === 'object' ? `${emp.firstName} ${emp.lastName}` : '—'}
        </InfoRow>
        {targetType && targetType !== 'EMPLOYEE' && (
          <InfoRow icon={UsersRound} label={de ? 'Team / Abteilung' : 'Team / Department'}>
            {targetLabel || targetType}
          </InfoRow>
        )}
      </div>

      {/* Customer & site card */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          {de ? 'Kunde & Standort' : 'Customer & Site'}
        </p>
        <InfoRow icon={User} label={de ? 'Kundenname' : 'Customer'}>
          {customer || '—'}
        </InfoRow>
        <InfoRow icon={Phone} label={de ? 'Telefon' : 'Phone'}>
          {phone ? <a href={`tel:${phone}`} className="text-primary hover:underline">{phone}</a> : null}
        </InfoRow>
        <InfoRow icon={Mail} label={de ? 'E-Mail' : 'Email'}>
          {email ? <a href={`mailto:${email}`} className="text-primary hover:underline">{email}</a> : null}
        </InfoRow>
        <InfoRow icon={MapPin} label={de ? 'Adresse' : 'Address'}>
          {address ? (
            <span className="flex items-center gap-2">
              {address}
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 text-primary hover:underline inline-flex items-center gap-1 text-xs"
              >
                <Navigation className="h-3 w-3" />
                {de ? 'Karte' : 'Map'}
              </a>
            </span>
          ) : null}
        </InfoRow>
      </div>

      {/* Instructions card */}
      {order.instructions && (
        <div className="xl:col-span-2 rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            {de ? 'Beschreibung & Anweisungen' : 'Description & Instructions'}
          </p>
          <RichTextContent html={order.instructions} className="text-sm text-foreground/80" />
        </div>
      )}
    </div>
  );
}

function ReportsTab({ orderId, de }) {
  const { data: reports = [], isLoading } = useFieldOpsOrderReports(orderId);
  const [selected, setSelected] = useState(null);

  if (isLoading) return <div className="space-y-2">{[1,2].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>;
  if (!reports.length) return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
      <div className="relative flex items-center justify-center">
        <div className="absolute h-20 w-20 rounded-full bg-muted/60 animate-ping opacity-20" />
        <div className="relative flex items-center justify-center h-16 w-16 rounded-full bg-muted">
          <FileCheck className="h-7 w-7 text-muted-foreground/50 animate-bounce" />
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground/70">{de ? 'Keine Berichte vorhanden' : 'No reports yet'}</p>
        <p className="text-xs text-muted-foreground">{de ? 'Berichte werden vom Techniker über die App erstellt.' : 'Reports are created by the technician via the mobile app.'}</p>
      </div>
    </div>
  );

  return (
    <>
      <div className="space-y-2">
        {reports.map((r) => (
          <button
            key={r._id}
            onClick={() => setSelected(r)}
            className="w-full flex items-center justify-between border border-border rounded-xl px-4 py-3.5 hover:bg-muted/50 text-left transition-colors group"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{formatDate(r.reportDate)}</p>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{r.workPerformed?.slice(0, 80)}{r.workPerformed?.length > 80 ? '…' : ''}</p>
            </div>
            <FieldOpsReportStatusBadge status={r.status} size="sm" />
          </button>
        ))}
      </div>
      <FieldOpsReportDetailPanel
        report={selected}
        orderId={orderId}
        open={!!selected}
        onOpenChange={(v) => { if (!v) setSelected(null); }}
      />
    </>
  );
}

function TimeTab({ orderId, de }) {
  const { data: entries = [], isLoading } = useFieldOpsOrderTimeEntries(orderId);

  if (isLoading) return <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>;
  if (!entries.length) return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
      <div className="relative flex items-center justify-center">
        <div className="absolute h-20 w-20 rounded-full bg-muted/60 animate-ping opacity-20" />
        <div className="relative flex items-center justify-center h-16 w-16 rounded-full bg-muted">
          <Clock className="h-7 w-7 text-muted-foreground/50 animate-bounce" />
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground/70">{de ? 'Keine Zeiteinträge' : 'No time entries'}</p>
        <p className="text-xs text-muted-foreground">{de ? 'Zeiteinträge werden vom Techniker erfasst.' : 'Time entries are recorded by the technician.'}</p>
      </div>
    </div>
  );

  const totalMin = entries.reduce((s, e) => s + (e.netDurationMin || e.net_duration_min || 0), 0);
  const totalH = Math.floor(totalMin / 60);
  const totalM = totalMin % 60;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <p className="text-xs text-muted-foreground">{entries.length} {de ? 'Einträge' : 'entries'}</p>
        <p className="text-sm font-semibold font-mono">{de ? 'Gesamt:' : 'Total:'} {totalH}h{totalM > 0 ? ` ${totalM}m` : ''}</p>
      </div>
      <div className="space-y-2">
        {entries.map((e) => {
          const min = e.netDurationMin || e.net_duration_min || 0;
          const h = Math.floor(min / 60);
          const m = min % 60;
          const act = ACTIVITY_TYPE_LABELS[e.activityType];
          const rel = RELEASE_STATUS_CONFIG[e.releaseStatus];
          return (
            <div key={e._id} className="flex items-center justify-between border border-border rounded-xl px-4 py-3.5">
              <div>
                <p className="text-sm font-medium">{formatDate(e.date)}</p>
                <p className="text-xs text-muted-foreground">{act ? (de ? act.label : act.labelEn) : e.activityType}</p>
              </div>
              <div className="text-right flex flex-col items-end gap-1">
                <p className="text-sm font-mono font-semibold">{h}h{m > 0 ? ` ${m}m` : ''}</p>
                {rel && (
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', rel.badge)}>
                    {de ? rel.label : rel.labelEn}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

function taskStatusLabel(status, de) {
  const labels = {
    OPEN: de ? 'Offen' : 'Open',
    IN_PROGRESS: de ? 'In Arbeit' : 'In Progress',
    ON_HOLD: de ? 'Pausiert' : 'On Hold',
    COMPLETED: de ? 'Abgeschlossen' : 'Completed',
    CANCELLED: de ? 'Storniert' : 'Cancelled',
  };
  return labels[status] || status;
}

function taskStatusClass(status) {
  if (status === 'COMPLETED') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300';
  if (status === 'IN_PROGRESS') return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300';
  if (status === 'ON_HOLD') return 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300';
  if (status === 'CANCELLED') return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300';
  return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
}

function WorkPackagesTab({ order, orderId, de }) {
  const { data: tasks = [], isLoading } = useOrderTasks(orderId, {
    limit: 100,
    sortBy: 'dueDate',
    sortOrder: 'asc',
  });
  const { createTask, changeStatus, completeTask, reopenTask } = useTaskMutations();
  const [title, setTitle] = useState('');

  const employee = order.employeeId || order.employee_id;
  const assigneeId = typeof employee === 'object' ? (employee._id || employee.id) : employee;
  const isBusy = createTask.isPending || changeStatus.isPending || completeTask.isPending || reopenTask.isPending;

  const handleCreate = () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    createTask.mutate({
      title: trimmedTitle,
      orderId,
      priority: 'MEDIUM',
      assigneeId: assigneeId || null,
      dueDate: order.endDatetime || order.scheduledEnd || order.scheduled_end || null,
    }, {
      onSuccess: () => setTitle(''),
    });
  };

  if (isLoading) {
    return <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 sm:flex-row">
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              handleCreate();
            }
          }}
          placeholder={de ? 'Arbeitspaket hinzufuegen...' : 'Add work package...'}
          className="h-9"
        />
        <Button size="sm" onClick={handleCreate} disabled={!title.trim() || createTask.isPending} className="gap-1.5">
          <PlusCircle className="h-4 w-4" />
          {de ? 'Erstellen' : 'Create'}
        </Button>
      </div>

      {!tasks.length ? (
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <ListChecks className="h-7 w-7 text-muted-foreground/50" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground/70">{de ? 'Keine Arbeitspakete' : 'No work packages'}</p>
            <p className="text-xs text-muted-foreground">{de ? 'Erstelle naechste Schritte direkt fuer diesen Auftrag.' : 'Create next steps directly for this job.'}</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => {
            const taskId = task._id || task.id;
            const isCompleted = task.status === 'COMPLETED';
            return (
              <div key={taskId} className="flex flex-col gap-3 rounded-xl border border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={cn('truncate text-sm font-medium', isCompleted && 'text-muted-foreground line-through')}>
                      {task.title}
                    </p>
                    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', taskStatusClass(task.status))}>
                      {taskStatusLabel(task.status, de)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {task.dueDate
                      ? `${de ? 'Faellig' : 'Due'} ${formatDate(task.dueDate)}`
                      : (task.priority ? `${de ? 'Prioritaet' : 'Priority'} ${task.priority}` : '')}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  {task.status === 'OPEN' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => changeStatus.mutate({ id: taskId, status: 'IN_PROGRESS' })}
                      disabled={isBusy}
                      className="h-8 gap-1.5"
                    >
                      <PlayCircle className="h-3.5 w-3.5" />
                      {de ? 'Start' : 'Start'}
                    </Button>
                  )}
                  {!isCompleted ? (
                    <Button
                      size="sm"
                      onClick={() => completeTask.mutate({ id: taskId, completeSubtasks: true })}
                      disabled={isBusy}
                      className="h-8 gap-1.5"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {de ? 'Fertig' : 'Done'}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => reopenTask.mutate(taskId)}
                      disabled={isBusy}
                      className="h-8 gap-1.5"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      {de ? 'Oeffnen' : 'Reopen'}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function historyIcon(type) {
  if (type?.includes('report')) return FileCheck;
  if (type?.includes('time')) return Clock;
  if (type?.includes('photo')) return Camera;
  if (type?.includes('document')) return FileText;
  if (type?.includes('assignment')) return ClipboardList;
  return History;
}

function HistoryTab({ orderId, de }) {
  const { data: events = [], isLoading } = useFieldOpsOrderHistory(orderId);

  if (isLoading) return <div className="space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>;
  if (!events.length) return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <History className="h-7 w-7 text-muted-foreground/50" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground/70">{de ? 'Noch keine Historie' : 'No history yet'}</p>
        <p className="text-xs text-muted-foreground">{de ? 'Status, Berichte, Zeiten, Fotos und Dokumente erscheinen hier.' : 'Status, reports, time, photos, and documents appear here.'}</p>
      </div>
    </div>
  );

  return (
    <div className="relative space-y-0 pl-6">
      <div className="absolute bottom-3 left-[11px] top-3 w-px bg-border" />
      {events.map((event) => {
        const Icon = historyIcon(event.type);
        return (
          <div key={event.id || `${event.type}-${event.date}`} className="relative pb-5">
            <span className="absolute -left-6 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background">
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
            <div className="rounded-xl border border-border bg-card px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">{event.title || event.type}</p>
                <span className="text-xs text-muted-foreground">{formatDate(event.date)}</span>
              </div>
              {(event.description || event.notes || event.technician_name) && (
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {[event.description, event.technician_name, event.notes].filter(Boolean).join(' - ')}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function FieldOpsOrderDetailTabs({ orderId }) {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const router = useRouter();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: order, isLoading } = useFieldOpsOrderDetail(orderId);
  const { updateOrder, deleteOrder } = useFieldOpsOrderMutations();

  if (isLoading) return <DetailSkeleton />;
  if (!order) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <XCircle className="h-12 w-12 text-muted-foreground/30" />
      <p className="text-muted-foreground">{de ? 'Auftrag nicht gefunden.' : 'Order not found.'}</p>
      <Button variant="ghost" size="sm" onClick={() => router.back()}>
        <ChevronLeft className="h-4 w-4 mr-1" />{de ? 'Zurück' : 'Back'}
      </Button>
    </div>
  );

  const type = order.assignmentType || order.orderType;
  const typeCfg = ORDER_TYPE_LABELS[type];
  const projectId = order.projectId || order.project_id;
  const siteId = order.siteId || order.site_id;
  const assignmentTargetType = order.assignmentTargetType || order.assignment_target_type;
  const assignmentTargetLabel = order.assignmentTargetLabel || order.assignment_target_label || order.assignmentTargetId || order.assignment_target_id;

  const handleUpdate = (data) => {
    updateOrder.mutate({ id: order.id || order._id, data }, { onSuccess: () => setEditOpen(false) });
  };

  const handleDelete = () => {
    deleteOrder.mutate(order.id || order._id, {
      onSuccess: () => router.push('/field-ops/orders'),
    });
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-[calc(100vh-64px)]">

      {/* ── Sidebar ──────────────────────────────────────────────── */}
      <aside className="w-full lg:w-72 xl:w-80 border-b lg:border-b-0 lg:border-r border-border bg-card/50 flex flex-col">
        {/* Back + actions row */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground" onClick={() => router.back()}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            {de ? 'Aufträge' : 'Orders'}
          </Button>

          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" className="h-8 px-3" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              {de ? 'Bearbeiten' : 'Edit'}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="outline" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  {de ? 'Bearbeiten' : 'Edit'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {de ? 'Löschen' : 'Delete'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Order identity */}
        <div className="px-5 pb-5 space-y-3">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary">
            <ClipboardList className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold leading-tight">{order.title || (de ? 'Kein Titel' : 'Untitled')}</h2>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">{order.assignmentNumber || order.orderNumber}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <FieldOpsOrderStatusBadge status={order.status} />
            {typeCfg && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                {de ? typeCfg.label : typeCfg.labelEn}
              </span>
            )}
            {order.priority && order.priority !== 'NORMAL' && (
              <span className={cn(
                'text-xs px-2 py-0.5 rounded-full font-medium',
                order.priority === 'URGENT' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
              )}>
                {de ? PRIORITY_CONFIG[order.priority]?.label : PRIORITY_CONFIG[order.priority]?.labelEn}
              </span>
            )}
          </div>
        </div>

        <Separator />

        {/* Quick info */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-1">
          {order.startDatetime && (
            <div className="flex items-center gap-3 py-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{de ? 'Termin' : 'Scheduled'}</p>
                <p>{formatDate(order.startDatetime)}</p>
              </div>
            </div>
          )}
          {order.employeeId && typeof order.employeeId === 'object' && (
            <div className="flex items-center gap-3 py-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{de ? 'Techniker' : 'Technician'}</p>
                <p>{order.employeeId.firstName} {order.employeeId.lastName}</p>
              </div>
            </div>
          )}
          {assignmentTargetType && assignmentTargetType !== 'EMPLOYEE' && (
            <div className="flex items-center gap-3 py-2 text-sm">
              <UsersRound className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{de ? 'Team / Abteilung' : 'Team / Department'}</p>
                <p>{assignmentTargetLabel || assignmentTargetType}</p>
              </div>
            </div>
          )}
          {(() => {
            const name = order.appointment?.customerContactName || order.customerName;
            const phone = order.appointment?.customerContactPhone || order.customerPhone;
            const addr = order.siteAddress || order.appointment?.customerNotes;
            return name || addr ? (
              <div className="mt-2 rounded-lg border border-border bg-background p-3 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{de ? 'Kunde' : 'Customer'}</p>
                {name && <p className="text-sm font-medium">{name}</p>}
                {phone && (
                  <a href={`tel:${phone}`} className="flex items-center gap-2 text-xs text-primary hover:underline">
                    <Phone className="h-3 w-3" />{phone}
                  </a>
                )}
                {addr && (
                  <p className="flex items-start gap-2 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 mt-0.5 shrink-0" />{addr}
                  </p>
                )}
              </div>
            ) : null;
          })()}
        </div>

        <Separator />

        {/* Quick links */}
        <div className="px-5 py-4 space-y-1">
          {projectId && (
            <Link
              href={`/field-ops/chat/${projectId}`}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-muted transition-colors"
            >
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              {de ? 'Projekt-Chat öffnen' : 'Open Project Chat'}
            </Link>
          )}
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 p-6">
        <Tabs defaultValue="overview">
          <TabsList className="w-full justify-start h-9 bg-muted/50 mb-6 overflow-x-auto">
            <TabsTrigger value="overview"  className="text-xs gap-1.5"><FileText className="h-3.5 w-3.5" />{de ? 'Übersicht' : 'Overview'}</TabsTrigger>
            <TabsTrigger value="reports"   className="text-xs gap-1.5"><FileCheck className="h-3.5 w-3.5" />{de ? 'Berichte' : 'Reports'}</TabsTrigger>
            <TabsTrigger value="time"      className="text-xs gap-1.5"><Clock className="h-3.5 w-3.5" />{de ? 'Zeiten' : 'Time'}</TabsTrigger>
            <TabsTrigger value="work"      className="text-xs gap-1.5"><ListChecks className="h-3.5 w-3.5" />{de ? 'Arbeit' : 'Work'}</TabsTrigger>
            <TabsTrigger value="photos"    className="text-xs gap-1.5"><Camera className="h-3.5 w-3.5" />{de ? 'Fotos' : 'Photos'}</TabsTrigger>
            <TabsTrigger value="installations" className="text-xs gap-1.5"><Wrench className="h-3.5 w-3.5" />{de ? 'Anlagen' : 'Installations'}</TabsTrigger>
            <TabsTrigger value="history"   className="text-xs gap-1.5"><History className="h-3.5 w-3.5" />{de ? 'Historie' : 'History'}</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab order={order} de={de} />
          </TabsContent>
          <TabsContent value="reports">
            <ReportsTab orderId={orderId} de={de} />
          </TabsContent>
          <TabsContent value="time">
            <TimeTab orderId={orderId} de={de} />
          </TabsContent>
          <TabsContent value="work">
            <WorkPackagesTab order={order} orderId={orderId} de={de} />
          </TabsContent>
          <TabsContent value="photos">
            <FieldOpsPhotoGallery orderId={orderId} />
          </TabsContent>
          <TabsContent value="installations">
            <FieldOpsInstallationsTable siteId={siteId} />
          </TabsContent>
          <TabsContent value="history">
            <HistoryTab orderId={orderId} de={de} />
          </TabsContent>
        </Tabs>
      </main>

      {/* Dialogs */}
      <FieldOpsCreateOrderDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        onCreate={handleUpdate}
        isLoading={updateOrder.isPending}
        defaultValues={order}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={de ? 'Auftrag löschen' : 'Delete Order'}
        description={de
          ? `Auftrag "${order.title || order.assignmentNumber}" wird unwiderruflich gelöscht.`
          : `Order "${order.title || order.assignmentNumber}" will be permanently deleted.`}
        onConfirm={handleDelete}
        isLoading={deleteOrder.isPending}
        variant="destructive"
        confirmText={de ? 'Löschen' : 'Delete'}
      />
    </div>
  );
}
