'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BrainCircuit,
  CalendarDays,
  Check,
  Download,
  Hourglass,
  Plus,
  Save,
  SlidersHorizontal,
  TimerReset,
  X,
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
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/shared/components/page-header';
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
  const fullName = `${employee.firstName || ''} ${employee.lastName || ''}`.trim();
  return employee.employeeName || employee.name || fullName || employee.email || employee.employeeId || employee._id || '-';
}

function apiMessage(error, fallback) {
  if (!error) return null;
  return error.message || fallback;
}

function StatPanel({ icon: Icon, label, value, tone = 'default', sub }) {
  const toneClass = {
    default: 'text-foreground',
    success: 'text-emerald-600',
    warning: 'text-amber-600',
    danger: 'text-red-600',
    info: 'text-sky-600',
  }[tone];

  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className={cn('text-2xl font-bold tabular-nums', toneClass)}>{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  );
}

function Panel({ title, action, children, className }) {
  return (
    <section className={cn('rounded-lg border bg-card', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          {title && <h3 className="text-sm font-semibold">{title}</h3>}
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
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  );
}

function EmptyInline({ children }) {
  return (
    <div className="flex min-h-28 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function ErrorInline({ message }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      <AlertTriangle className="h-4 w-4" />
      <span>{message}</span>
    </div>
  );
}

function EmployeeWorkloadTable({ rows, de }) {
  if (!rows?.length) {
    return <EmptyInline>{de ? 'Keine Mitarbeiterdaten gefunden.' : 'No employee data found.'}</EmptyInline>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="text-xs uppercase text-muted-foreground">
          <tr className="border-b">
            <th className="py-2 pr-3 text-left">{de ? 'Mitarbeiter' : 'Employee'}</th>
            <th className="py-2 pr-3 text-right">{de ? 'Soll' : 'Target'}</th>
            <th className="py-2 pr-3 text-right">{de ? 'Ist' : 'Actual'}</th>
            <th className="py-2 pr-3 text-right">{de ? 'Ueberzeit' : 'Overtime'}</th>
            <th className="py-2 text-right">{de ? 'Defizit' : 'Deficit'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 50).map((row) => (
            <tr key={row.employeeId} className="border-b last:border-0">
              <td className="py-2 pr-3">
                <div className="font-medium">{employeeName(row)}</div>
                {row.department && <div className="text-xs text-muted-foreground">{row.department}</div>}
              </td>
              <td className="py-2 pr-3 text-right font-mono">{hoursLabel(row.targetHours)}</td>
              <td className="py-2 pr-3 text-right font-mono">{hoursLabel(row.actualHours)}</td>
              <td className="py-2 pr-3 text-right font-mono text-amber-600">{hoursLabel(row.overtimeHours)}</td>
              <td className="py-2 text-right font-mono text-red-600">{hoursLabel(row.deficitHours)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupBars({ groups, de }) {
  if (!groups?.length) {
    return <EmptyInline>{de ? 'Keine Gruppierung verfuegbar.' : 'No grouping data available.'}</EmptyInline>;
  }
  const max = Math.max(...groups.map((group) => Number(group.actualMinutes || 0)), 1);
  return (
    <div className="space-y-3">
      {groups.slice(0, 12).map((group) => {
        const width = `${Math.max((Number(group.actualMinutes || 0) / max) * 100, 4)}%`;
        return (
          <div key={group.key} className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="truncate font-medium">{group.label}</span>
              <span className="font-mono text-muted-foreground">{hoursLabel(group.actualHours)}</span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div className="h-2 rounded-full bg-primary" style={{ width }} />
            </div>
          </div>
        );
      })}
    </div>
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
            {de ? 'Urlaub, Krankheit oder andere Abwesenheiten werden nach Genehmigung im Kalender blockiert.' : 'Approved absences block the employee calendar.'}
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
            <Plus className="h-4 w-4" />
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
          <Label>{de ? 'Begruendung' : 'Decision note'}</Label>
          <Textarea className="mt-2" value={reason} onChange={(event) => setReason(event.target.value)} />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{de ? 'Abbrechen' : 'Cancel'}</Button>
          <Button variant="destructive" disabled={isLoading || reason.trim().length < 3} onClick={() => onSubmit(reason)}>
            <X className="h-4 w-4" />
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
              <Label>{de ? 'Uebertrag' : 'Carryover'}</Label>
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
            <Save className="h-4 w-4" />
            {de ? 'Speichern' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LeaveTab({ requests, isLoading, error, employees, mutations, de }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState(null);

  if (isLoading) return <LoadingRows rows={5} />;
  if (error) return <ErrorInline message={apiMessage(error, de ? 'Abwesenheiten konnten nicht geladen werden.' : 'Leave requests could not be loaded.')} />;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          {de ? 'Abwesenheit' : 'Leave'}
        </Button>
      </div>
      {!requests?.length ? (
        <EmptyInline>{de ? 'Keine Abwesenheitsantraege gefunden.' : 'No leave requests found.'}</EmptyInline>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">{de ? 'Mitarbeiter' : 'Employee'}</th>
                <th className="px-3 py-2 text-left">{de ? 'Typ' : 'Type'}</th>
                <th className="px-3 py-2 text-left">{de ? 'Zeitraum' : 'Period'}</th>
                <th className="px-3 py-2 text-right">{de ? 'Tage' : 'Days'}</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">{de ? 'Aktionen' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request._id} className="border-t">
                  <td className="px-3 py-2 font-medium">{employeeName(request.employeeId)}</td>
                  <td className="px-3 py-2">{request.leaveType}</td>
                  <td className="px-3 py-2">{formatDate(request.startDate)} - {formatDate(request.endDate)}</td>
                  <td className="px-3 py-2 text-right font-mono">{Number(request.requestedDays || 0).toFixed(2)}</td>
                  <td className="px-3 py-2">
                    <Badge variant={LEAVE_STATUS_VARIANT[request.status] || 'outline'}>{request.status}</Badge>
                  </td>
                  <td className="px-3 py-2">
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
        </div>
      )}
      <LeaveRequestDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        employees={employees}
        onSubmit={(payload) => mutations.createLeaveRequest.mutate(payload, { onSuccess: () => setCreateOpen(false) })}
        isLoading={mutations.createLeaveRequest.isPending}
        de={de}
      />
      <RejectLeaveDialog
        key={rejectTarget?._id || 'reject-empty'}
        request={rejectTarget}
        onOpenChange={(open) => { if (!open) setRejectTarget(null); }}
        onSubmit={(decisionNote) => mutations.rejectLeaveRequest.mutate(
          { id: rejectTarget._id, decisionNote },
          { onSuccess: () => setRejectTarget(null) },
        )}
        isLoading={mutations.rejectLeaveRequest.isPending}
        de={de}
      />
    </div>
  );
}

function BalanceTab({ balances, isLoading, error, mutations, de }) {
  const [editTarget, setEditTarget] = useState(null);

  if (isLoading) return <LoadingRows rows={5} />;
  if (error) return <ErrorInline message={apiMessage(error, de ? 'Ferienguthaben konnten nicht geladen werden.' : 'Vacation balances could not be loaded.')} />;

  return (
    <div className="space-y-3">
      {!balances?.length ? (
        <EmptyInline>{de ? 'Keine Ferienguthaben gefunden.' : 'No vacation balances found.'}</EmptyInline>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">{de ? 'Mitarbeiter' : 'Employee'}</th>
                <th className="px-3 py-2 text-right">{de ? 'Anspruch' : 'Entitlement'}</th>
                <th className="px-3 py-2 text-right">{de ? 'Genutzt' : 'Used'}</th>
                <th className="px-3 py-2 text-right">{de ? 'Geplant' : 'Planned'}</th>
                <th className="px-3 py-2 text-right">{de ? 'Verfuegbar' : 'Available'}</th>
                <th className="px-3 py-2 text-right">{de ? 'Aktionen' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((balance) => (
                <tr key={`${balance.employeeId}-${balance.year}`} className="border-t">
                  <td className="px-3 py-2 font-medium">{employeeName(balance)}</td>
                  <td className="px-3 py-2 text-right font-mono">{balance.annualEntitlementDays}</td>
                  <td className="px-3 py-2 text-right font-mono">{balance.usedVacationDays}</td>
                  <td className="px-3 py-2 text-right font-mono">{balance.plannedVacationDays}</td>
                  <td className={cn('px-3 py-2 text-right font-mono font-semibold', balance.availableVacationDays < 0 ? 'text-red-600' : 'text-emerald-600')}>
                    {balance.availableVacationDays}
                  </td>
                  <td className="px-3 py-2 text-right">
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
        </div>
      )}
      <BalanceDialog
        key={editTarget ? `${editTarget.employeeId}-${editTarget.year}` : 'balance-empty'}
        balance={editTarget}
        onOpenChange={(open) => { if (!open) setEditTarget(null); }}
        onSubmit={(payload) => mutations.upsertVacationBalance.mutate(
          { employeeId: editTarget.employeeId, year: editTarget.year, payload },
          { onSuccess: () => setEditTarget(null) },
        )}
        isLoading={mutations.upsertVacationBalance.isPending}
        de={de}
      />
    </div>
  );
}

function CalendarTab({ calendar, isLoading, error, de }) {
  if (isLoading) return <LoadingRows rows={6} />;
  if (error) return <ErrorInline message={apiMessage(error, de ? 'Kalender konnte nicht geladen werden.' : 'Calendar could not be loaded.')} />;

  const employees = calendar?.employees || [];
  const days = employees[0]?.days || [];
  if (!employees.length || !days.length) {
    return <EmptyInline>{de ? 'Keine Kalenderdaten gefunden.' : 'No calendar data found.'}</EmptyInline>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[960px] text-xs">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr>
            <th className="sticky left-0 z-10 min-w-52 bg-muted/80 px-3 py-2 text-left">{de ? 'Mitarbeiter' : 'Employee'}</th>
            {days.map((day) => (
              <th key={day.date} className="min-w-20 px-2 py-2 text-center font-medium">
                {new Date(day.date).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {employees.map((employee) => (
            <tr key={employee.employeeId} className="border-t">
              <td className="sticky left-0 z-10 bg-card px-3 py-2">
                <div className="font-medium">{employeeName(employee)}</div>
                <div className="text-muted-foreground">{hoursLabel(employee.actualHours)} / {hoursLabel(employee.targetHours)}</div>
              </td>
              {employee.days.map((day) => {
                const type = day.availabilityType || 'WORKING';
                const blocked = type !== 'WORKING' && type !== null;
                return (
                  <td key={`${employee.employeeId}-${day.date}`} className="px-2 py-2 text-center">
                    <span className={cn(
                      'inline-flex h-7 min-w-14 items-center justify-center rounded-md px-2 font-medium',
                      blocked ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' : 'bg-muted text-muted-foreground',
                      day.leaveStatus === 'APPROVED' && 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
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
    </div>
  );
}

function AnalyticsTab({ analytics, aiContext, isLoading, error, de }) {
  if (isLoading) return <LoadingRows rows={5} />;
  if (error) return <ErrorInline message={apiMessage(error, de ? 'Analyse konnte nicht geladen werden.' : 'Analytics could not be loaded.')} />;

  return (
    <div className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
      <Panel title={de ? 'Gruppierung' : 'Grouping'}>
        <GroupBars groups={analytics?.groups || []} de={de} />
      </Panel>
      <div className="space-y-4">
        <Panel title={de ? 'Planungsrisiken' : 'Planning risks'}>
          <div className="space-y-2">
            {(analytics?.insights || []).map((item, index) => (
              <div key={index} className="rounded-md border bg-muted/30 px-3 py-2 text-sm">{item}</div>
            ))}
          </div>
        </Panel>
        <Panel title={de ? 'AI Kontext' : 'AI context'}>
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <BrainCircuit className="h-4 w-4" />
              <span>{de ? 'Workforce-Signale fuer Agenten' : 'Workforce signals for agents'}</span>
            </div>
            <div className="grid gap-2">
              <Badge variant="outline">{de ? 'Ueberzeit' : 'Overtime'}: {aiContext?.topOvertime?.length || 0}</Badge>
              <Badge variant="outline">{de ? 'Defizit' : 'Deficit'}: {aiContext?.topDeficit?.length || 0}</Badge>
              <Badge variant="outline">{de ? 'Ferienrisiko' : 'Leave pressure'}: {aiContext?.leavePressure?.length || 0}</Badge>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

export function TimeManagementWorkspace() {
  const { t, locale } = useLanguage();
  const de = locale === 'de';
  useTimeTrackingRealtime();
  const [tab, setTab] = useState('overview');
  const [groupBy, setGroupBy] = useState('employee');
  const [dateFrom, setDateFrom] = useState(monthStart);
  const [dateTo, setDateTo] = useState(monthEnd);
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
      <PageHeader
        title={t('fieldOps.time.managementTitle', 'Time & Absence')}
        description={t('fieldOps.time.managementDesc', 'Working hours, approvals, absences, balances, availability, and analytics.')}
        count={Number(totals.totalEntries || 0)}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input className="h-8 w-full sm:w-36" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          <Input className="h-8 w-full sm:w-36" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          <Button
            size="sm"
            variant="outline"
            disabled={mutations.exportTimeEntries.isPending}
            onClick={() => mutations.exportTimeEntries.mutate(filters)}
          >
            <Download className="h-4 w-4" />
            {de ? 'Export' : 'Export'}
          </Button>
        </div>
      </PageHeader>

      {overviewQuery.error && (
        <ErrorInline message={apiMessage(overviewQuery.error, de ? 'Uebersicht konnte nicht geladen werden.' : 'Overview could not be loaded.')} />
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <StatPanel icon={Hourglass} label={de ? 'Sollstunden' : 'Target'} value={hoursLabel(totals.targetHours)} />
        <StatPanel icon={TimerReset} label={de ? 'Iststunden' : 'Actual'} value={hoursLabel(totals.actualHours)} tone="info" />
        <StatPanel icon={AlertTriangle} label={de ? 'Ueberzeit' : 'Overtime'} value={hoursLabel(totals.overtimeHours)} tone="warning" />
        <StatPanel icon={AlertTriangle} label={de ? 'Defizit' : 'Deficit'} value={hoursLabel(totals.deficitHours)} tone="danger" />
        <StatPanel icon={Check} label={de ? 'Freigegeben' : 'Released'} value={totals.releasedEntries || 0} tone="success" />
        <StatPanel icon={CalendarDays} label={de ? 'Offene Abwesenheit' : 'Pending leave'} value={totals.pendingLeaveRequests || 0} tone="warning" />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <div className="overflow-x-auto">
          <TabsList variant="line" className="min-w-max">
            <TabsTrigger value="overview">{de ? 'Uebersicht' : 'Overview'}</TabsTrigger>
            <TabsTrigger value="records">{de ? 'Zeiten' : 'Records'}</TabsTrigger>
            <TabsTrigger value="leave">{de ? 'Abwesenheiten' : 'Leave'}</TabsTrigger>
            <TabsTrigger value="balances">{de ? 'Ferien' : 'Balances'}</TabsTrigger>
            <TabsTrigger value="calendar">{de ? 'Kalender' : 'Calendar'}</TabsTrigger>
            <TabsTrigger value="analytics">{de ? 'Analyse' : 'Analytics'}</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
            <Panel title={de ? 'Mitarbeiterstunden' : 'Employee hours'}>
              {overviewQuery.isLoading ? <LoadingRows rows={5} /> : <EmployeeWorkloadTable rows={employees} de={de} />}
            </Panel>
            <div className="space-y-4">
              <Panel title={de ? 'Signale' : 'Signals'}>
                {overviewQuery.isLoading ? (
                  <LoadingRows rows={4} />
                ) : (
                  <div className="space-y-2">
                    {(overview?.insights || []).map((item, index) => (
                      <div key={index} className="rounded-md border bg-muted/30 px-3 py-2 text-sm">{item}</div>
                    ))}
                  </div>
                )}
              </Panel>
              <Panel title={de ? 'Projektstunden' : 'Project hours'}>
                <GroupBars groups={overview?.groupings?.project || []} de={de} />
              </Panel>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="records">
          <FieldOpsTimeTable filters={filters} compact />
        </TabsContent>

        <TabsContent value="leave">
          <LeaveTab
            requests={leaveRequests}
            isLoading={leaveQuery.isLoading}
            error={leaveQuery.error}
            employees={employees}
            mutations={mutations}
            de={de}
          />
        </TabsContent>

        <TabsContent value="balances">
          <BalanceTab
            balances={balances}
            isLoading={balanceQuery.isLoading}
            error={balanceQuery.error}
            mutations={mutations}
            de={de}
          />
        </TabsContent>

        <TabsContent value="calendar">
          <CalendarTab
            calendar={calendarQuery.data}
            isLoading={calendarQuery.isLoading}
            error={calendarQuery.error}
            de={de}
          />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <div className="flex justify-end">
            <Select value={groupBy} onValueChange={setGroupBy}>
              <SelectTrigger className="h-8 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['employee', 'day', 'week', 'month', 'project', 'job', 'customer'].map((item) => (
                  <SelectItem key={item} value={item}>{item}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AnalyticsTab
            analytics={analyticsQuery.data}
            aiContext={aiQuery.data}
            isLoading={analyticsQuery.isLoading || aiQuery.isLoading}
            error={analyticsQuery.error || aiQuery.error}
            de={de}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
